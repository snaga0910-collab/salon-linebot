// LINE からの通信を受け取る入口。
//
// 守ること：
//   ① 署名を確かめてから中身を見る（偽の問い合わせを防ぐ）
//   ② 何があっても 200 を返す（LINE が再送し続けるのを防ぐ）

import { NextResponse } from "next/server";
import {
  canMergeInto,
  classify,
  FORWARD_CATEGORIES,
  looksLikeQuestion,
} from "@/lib/classify";
import {
  appendToInquiry,
  clearClosedNote,
  countOpenInquiries,
  deleteByMessageId,
  findOpenInquiryByUser,
  getClosedNote,
  listOpenInquiries,
  markAllHandled,
  markHandled,
  recordInquiry,
  setClosedNote,
} from "@/lib/db";
import {
  doneAllCutoff,
  getDisplayName,
  inquiryNotice,
  isDoneAll,
  openListMessage,
  ownerUserId,
  plainText,
  push,
  reply,
  textWithMenu,
  verifySignature,
} from "@/lib/line";
import {
  acknowledgement,
  autoAnswer,
  CLOSED_PROMPT,
  followUpAcknowledgement,
  GREETING,
  OWNER_HELP,
} from "@/lib/replies";
import { isOpenNow } from "@/lib/time";

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type?: string; id?: string; text?: string };
  unsend?: { messageId?: string };
  postback?: { data?: string };
};

export async function POST(req: Request) {
  const raw = await req.text();

  if (!verifySignature(raw, req.headers.get("x-line-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(raw) as { events?: LineEvent[] }).events ?? [];
  } catch {
    // Webhook URL の疎通確認では中身が空で届く。200 を返しておく。
    return NextResponse.json({ ok: true });
  }

  for (const event of events) {
    try {
      await handle(event);
    } catch (e) {
      // 1件の失敗で全体を落とさない
      console.error("event handling failed:", e);
    }
  }

  return NextResponse.json({ ok: true });
}

async function handle(event: LineEvent) {
  const userId = event.source?.userId ?? "";

  // 友だち追加：あいさつとメニューを出す（F-01）
  if (event.type === "follow" && event.replyToken) {
    await reply(event.replyToken, [textWithMenu(GREETING)]);
    return;
  }

  // 送信取消：記録を消す（F-14）
  if (event.type === "unsend") {
    const id = event.unsend?.messageId;
    if (id) await deleteByMessageId(id);
    return;
  }

  // 「対応済み」ボタン（F-10）
  if (event.type === "postback" && event.replyToken) {
    const data = event.postback?.data ?? "";

    // リッチメニューの「臨時休業を設定」。
    // 入力欄に「休業 」が入った状態でキーボードが開くので、書き方だけ案内する。
    if (data === "closed_prompt") {
      await reply(event.replyToken, [plainText(CLOSED_PROMPT)]);
      return;
    }

    // 朝のまとめに添えた「お知らせを取り消す」ボタン
    if (data === "closed_off") {
      await clearClosedNote();
      await reply(event.replyToken, [
        plainText("臨時休業のお知らせを取り消しました。通常営業の案内に戻ります。"),
      ]);
      return;
    }

    if (isDoneAll(data)) {
      // 一覧をお送りしたあとに届いた問い合わせは残す。
      // まだ見ていない問い合わせを消してしまわないため。
      const n = await markAllHandled(doneAllCutoff(data) ?? undefined);
      const left = await countOpenInquiries();
      const tail =
        left > 0
          ? `\n\nそのあとに届いた${left}件は残してあります。\n「未対応」と送るとご確認いただけます。`
          : "";
      await reply(event.replyToken, [
        plainText(
          n === 0
            ? "未対応のお問い合わせはありません。"
            : `${n}件すべてを対応済みにしました。${tail}`,
        ),
      ]);
      return;
    }

    if (data.startsWith("done:")) {
      const ok = await markHandled(data.slice("done:".length));
      const left = await countOpenInquiries();
      const tail = left > 0 ? `\n残りの未対応：${left}件` : "\nこれで未対応はありません。";
      await reply(event.replyToken, [
        plainText(ok ? `対応済みにしました。${tail}` : `すでに対応済みです。${tail}`),
      ]);
    }
    return;
  }

  if (event.type !== "message" || event.message?.type !== "text") return;

  const text = (event.message.text ?? "").trim();
  const replyToken = event.replyToken;
  if (!replyToken || text === "") return;

  // オーナー様からの操作コマンド（F-08・F-13）
  // 決まった言葉のときだけコマンドとして扱い、それ以外は
  // お客様と同じ流れで処理する。こうしておくと、
  // アカウントが1つでも通し確認ができる。
  if (userId && userId === safeOwnerId()) {
    if (await handleOwnerCommand(text, replyToken)) return;
  }

  const category = classify(text);
  const closedNote = await getClosedNote();

  // 自動で答えられるもの（F-02・F-03・F-04）
  const answer = autoAnswer(category, closedNote);
  if (answer !== null) {
    await reply(replyToken, [textWithMenu(answer)]);
    return;
  }

  // 転送するもの（F-05・F-06・F-07・F-09）
  if (FORWARD_CATEGORIES.includes(category)) {
    // 同じお客様の未対応が残っていれば、そこへまとめる。
    // オーナー様がその方に返す返事は1回なので、未対応も1件であるべき。
    // ただし「やっぱりキャンセルで」のように急ぎの用件に変わった場合は
    // 新しい1件として扱う（至急の通知を埋もれさせないため）。
    const open = userId ? await findOpenInquiryByUser(userId) : null;
    const existing = open && canMergeInto(open.category, category) ? open : null;

    if (existing) {
      // 未対応はひとつにまとめるが、お客様へのお返事は内容に合わせる（F-17）
      await reply(replyToken, [
        plainText(
          followUpAcknowledgement(
            category,
            looksLikeQuestion(text),
            isOpenNow(),
            closedNote,
          ),
        ),
      ]);
      await appendToInquiry(existing.id, text);
      // 続きであっても、急ぎの用件は見出しで分かるようにする
      const head =
        category === "change"
          ? "【至急・追加のご連絡】"
          : category === "complaint"
            ? "【要対応・追加のご連絡】"
            : "【追加のご連絡】";
      await push(safeOwnerId(), [
        plainText(
          `${head}${existing.display_name ?? "お客様"} 様\n` +
            `「${text}」\n\n` +
            `※ 先ほどのお問い合わせの続きです（未対応は増えていません）`,
        ),
      ]);
      return;
    }

    const displayName = userId ? await getDisplayName(userId) : null;

    // 先にお客様へお返事する。お待たせしないことが一番大事。
    await reply(replyToken, [
      plainText(acknowledgement(category, isOpenNow(), closedNote)),
    ]);

    const inquiry = await recordInquiry({
      lineUserId: userId,
      displayName,
      messageText: text,
      messageId: event.message.id ?? null,
      category,
    });

    if (inquiry) {
      // 自分自身を数えないよう、1 を引く
      const others = Math.max((await countOpenInquiries()) - 1, 0);
      await push(safeOwnerId(), [inquiryNotice(inquiry, others)]);
    }
  }
}

function safeOwnerId(): string {
  try {
    return ownerUserId();
  } catch {
    return "";
  }
}

/** オーナー様のコマンドを処理したら true */
async function handleOwnerCommand(text: string, replyToken: string): Promise<boolean> {
  if (text === "未対応" || text === "みたいおう") {
    const open = await listOpenInquiries();
    await reply(replyToken, [
      open.length === 0
        ? plainText("未対応のお問い合わせはありません。")
        : openListMessage(open, "未対応の一覧です。"),
    ]);
    return true;
  }

  if (text === "休業オフ" || text === "休業解除") {
    await clearClosedNote();
    await reply(replyToken, [plainText("臨時休業のお知らせを取り消しました。")]);
    return true;
  }

  if (text.startsWith("休業")) {
    const note = text.slice("休業".length).trim();
    if (note === "") {
      // リッチメニューの「臨時休業を設定」を押したとき。書き方を案内する
      await reply(replyToken, [plainText(CLOSED_PROMPT)]);
      return true;
    }
    await setClosedNote(note);
    await reply(replyToken, [
      plainText(`臨時休業のお知らせを設定しました。\n\n「${note}」\n\n営業時間を聞かれた際に、この文章が先に表示されます。`),
    ]);
    return true;
  }

  if (text === "ヘルプ" || text === "へるぷ") {
    await reply(replyToken, [plainText(OWNER_HELP)]);
    return true;
  }

  return false;
}
