// LINE とのやり取り。
//
// 覚えておくこと：
//   応答メッセージ（reply）は無料メッセージ通数にカウントされない。
//   プッシュメッセージ（push）はカウントされる。
//   だから、お客様への返答は reply、オーナー様への通知だけ push を使う。

import { createHmac, timingSafeEqual } from "crypto";
import { MENU_ITEMS } from "./buttons";
import { formatJst } from "./time";
import type { Inquiry } from "./db";

const API = "https://api.line.me/v2/bot";

type Json = Record<string, unknown>;

function channelSecret(): string {
  const v = process.env.LINE_CHANNEL_SECRET;
  if (!v) throw new Error("LINE_CHANNEL_SECRET が設定されていません。");
  return v;
}

function accessToken(): string {
  const v = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!v) throw new Error("LINE_CHANNEL_ACCESS_TOKEN が設定されていません。");
  return v;
}

export function ownerUserId(): string {
  const v = process.env.OWNER_LINE_USER_ID;
  if (!v) throw new Error("OWNER_LINE_USER_ID が設定されていません。");
  return v;
}

/**
 * LINE から届いた通信が本物かどうかを確かめる（要件定義書 N-05）。
 * これを省くと、誰でも偽の問い合わせを流し込めてしまう。
 */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", channelSecret()).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  // 長さが違うと timingSafeEqual が例外を投げるので、先に確認する
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function post(path: string, body: Json): Promise<void> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken()}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`LINE API ${path} failed:`, res.status, await res.text());
  }
}

/** お客様への返答。無料。 */
export async function reply(replyToken: string, messages: Json[]): Promise<void> {
  await post("/message/reply", { replyToken, messages });
}

/** オーナー様への通知。通数を消費する。 */
export async function push(to: string, messages: Json[]): Promise<void> {
  await post("/message/push", { to, messages });
}

export async function getDisplayName(userId: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}/profile/${userId}`, {
      headers: { Authorization: `Bearer ${accessToken()}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { displayName?: string };
    return data.displayName ?? null;
  } catch {
    return null;
  }
}

// --- メッセージの組み立て ---

/** 下に出る選択ボタン。お客様に自由入力をさせないための誘導（要件定義書 F-01） */
export function textWithMenu(text: string): Json {
  return {
    type: "text",
    text,
    quickReply: {
      items: MENU_ITEMS.map((m) => ({
        type: "action",
        action: { type: "message", label: m.label, text: m.text },
      })),
    },
  };
}

export function plainText(text: string): Json {
  return { type: "text", text };
}

// --- 「すべて対応済みにする」ボタンの中身（要件定義書 F-18） ---
//
// ボタンには「いつの一覧か」を持たせる。
// オーナー様が古い通知をあとから押したとき、
// そのあとに届いた問い合わせまで消さないようにするため。

const DONE_ALL = "done_all";

export function doneAllData(listedAt: string): string {
  return `${DONE_ALL}:${listedAt}`;
}

/**
 * 押されたボタンから「いつの一覧か」を取り出す。
 * 時刻を持たない古いボタンは null（＝全件が対象）を返す。
 */
export function doneAllCutoff(data: string): string | null {
  if (!data.startsWith(`${DONE_ALL}:`)) return null;
  const at = data.slice(DONE_ALL.length + 1).trim();
  return at === "" ? null : at;
}

export function isDoneAll(data: string): boolean {
  return data === DONE_ALL || data.startsWith(`${DONE_ALL}:`);
}

const LABEL: Record<string, string> = {
  availability: "空き状況のお問い合わせ",
  change: "【至急】予約の変更・キャンセル",
  complaint: "【要対応】お客様からのご相談",
  other: "お問い合わせ",
};

function doneButton(id: string): Json {
  return {
    type: "button",
    style: "primary",
    color: "#10B981",
    height: "sm",
    action: {
      type: "postback",
      label: "✅ 対応済みにする",
      data: `done:${id}`,
      displayText: "対応済みにしました",
    },
  };
}

/**
 * 新しい問い合わせの通知。
 * 未対応が他にもあれば件数を冒頭に添える（要件定義書 F-12）。
 * 追加のメッセージを送らないので、通数は増えない。
 */
export function inquiryNotice(inquiry: Inquiry, otherOpenCount: number): Json {
  const urgent = inquiry.category === "change" || inquiry.category === "complaint";
  const body: Json[] = [];

  if (otherOpenCount > 0) {
    body.push({
      type: "text",
      text: `※ ほかに未対応が${otherOpenCount}件あります`,
      size: "xs",
      color: "#D97706",
      wrap: true,
    });
  }

  body.push(
    {
      type: "text",
      text: LABEL[inquiry.category] ?? "お問い合わせ",
      weight: "bold",
      size: "md",
      color: urgent ? "#DC2626" : "#1F2937",
      wrap: true,
    },
    {
      type: "text",
      text: `${inquiry.display_name ?? "お客様"} 様`,
      size: "sm",
      color: "#6B7280",
    },
    {
      type: "text",
      text: `「${inquiry.message_text}」`,
      size: "sm",
      wrap: true,
    },
    {
      type: "text",
      text: `${formatJst(inquiry.received_at)} 受信`,
      size: "xs",
      color: "#9CA3AF",
    },
  );

  return {
    type: "flex",
    altText: `${LABEL[inquiry.category] ?? "お問い合わせ"}：${inquiry.message_text.slice(0, 40)}`,
    contents: {
      type: "bubble",
      body: { type: "box", layout: "vertical", spacing: "sm", contents: body },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [doneButton(inquiry.id)],
      },
    },
  };
}

/**
 * 臨時休業のお知らせが出たままになっていることを、毎朝お伝えする。
 *
 * 取り消し忘れると、休みが終わったあとも案内が出続けてしまう。
 * 人の記憶に頼らず、毎朝その場で取り消せるようにしておく。
 */
export function closedReminder(note: string): Json {
  return {
    type: "flex",
    altText: `臨時休業のお知らせが出ています：${note}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "text",
            text: "⚠️ 臨時休業のお知らせが出ています",
            weight: "bold",
            size: "sm",
            color: "#D97706",
            wrap: true,
          },
          { type: "text", text: `「${note}」`, size: "sm", wrap: true },
          {
            type: "text",
            text: "お休みが終わっている場合は、取り消してください。",
            size: "xs",
            color: "#9CA3AF",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#10B981",
            height: "sm",
            action: {
              type: "postback",
              label: "お知らせを取り消す",
              data: "closed_off",
              displayText: "休業オフ",
            },
          },
        ],
      },
    },
  };
}

/**
 * 未対応の一覧。
 * 毎朝のまとめ（F-11）と、「未対応」と送られたとき（F-13）の両方で使う。
 */
export function openListMessage(inquiries: Inquiry[], greeting: string): Json {
  const shown = inquiries.slice(0, 5);
  const rest = inquiries.length - shown.length;

  const contents: Json[] = [
    { type: "text", text: greeting, weight: "bold", size: "md", wrap: true },
    {
      type: "text",
      text: `未対応のお問い合わせが${inquiries.length}件あります。`,
      size: "sm",
      color: "#6B7280",
      wrap: true,
    },
  ];

  shown.forEach((q, i) => {
    contents.push({
      type: "box",
      layout: "vertical",
      spacing: "xs",
      margin: "lg",
      contents: [
        {
          type: "text",
          text: `${i + 1}. ${q.display_name ?? "お客様"} 様（${formatJst(q.received_at)}）`,
          size: "xs",
          color: "#6B7280",
          wrap: true,
        },
        { type: "text", text: `「${q.message_text}」`, size: "sm", wrap: true },
        doneButton(q.id),
      ],
    });
  });

  if (rest > 0) {
    contents.push({
      type: "text",
      // 「未対応」と送っても同じ5件が出るだけなので、そう案内してはいけない。
      // 上の5件を片付ければ次の5件が出る、が正しい。
      text: `ほか${rest}件あります（上の5件を対応済みにすると、続きが表示されます）`,
      size: "xs",
      color: "#9CA3AF",
      margin: "lg",
      wrap: true,
    });
  }

  // 2件以上あるときだけ、まとめて片付けられるようにする。
  // ボタンには、この一覧をお送りした時刻を持たせる（doneAllData のコメント参照）
  const footer: Json | undefined =
    inquiries.length >= 2
      ? {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              style: "secondary",
              height: "sm",
              action: {
                type: "postback",
                label: `すべて対応済みにする（${inquiries.length}件）`,
                data: doneAllData(new Date().toISOString()),
                displayText: "すべて対応済みにしました",
              },
            },
          ],
        }
      : undefined;

  return {
    type: "flex",
    altText: `未対応のお問い合わせが${inquiries.length}件あります`,
    contents: {
      type: "bubble",
      body: { type: "box", layout: "vertical", contents },
      ...(footer ? { footer } : {}),
    },
  };
}
