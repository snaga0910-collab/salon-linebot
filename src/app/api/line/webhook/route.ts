// LINE からの通信を受け取る入口。
//
// 守ること：
//   ① 署名を確かめてから中身を見る（偽の問い合わせを防ぐ）
//   ② 何があっても 200 を返す（LINE が再送し続けるのを防ぐ）

import { NextResponse } from "next/server";
import { classify, FORWARD_CATEGORIES } from "@/lib/classify";
import {
  clearClosedNote,
  countOpenInquiries,
  deleteByMessageId,
  getClosedNote,
  listOpenInquiries,
  markHandled,
  recordInquiry,
  setClosedNote,
} from "@/lib/db";
import {
  getDisplayName,
  inquiryNotice,
  openListMessage,
  ownerUserId,
  plainText,
  push,
  reply,
  textWithMenu,
  verifySignature,
} from "@/lib/line";
import { acknowledgement, autoAnswer, GREETING, OWNER_HELP } from "@/lib/replies";
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
    const displayName = userId ? await getDisplayName(userId) : null;

    // 先にお客様へお返事する。お待たせしないことが一番大事。
    await reply(replyToken, [plainText(acknowledgement(category, isOpenNow()))]);

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
      await reply(replyToken, [plainText(OWNER_HELP)]);
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
