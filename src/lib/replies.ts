// お客様にお返しする文章。すべて決め打ちの文。
// AIに書かせない。間違った料金や営業時間を案内しないことが最優先（要件定義書 N-01）。

import { DURATION_TEXT, HOURS_TEXT, MENU_TEXT, SALON } from "./salon";
import type { Category } from "./classify";

export const GREETING = `友だち追加ありがとうございます。
${SALON.name} です。

下のボタンから、知りたいことをお選びください。
ご予約の空き状況は、オーナーが確認してご連絡いたします。`;

/** 自動で答えられるもの。臨時休業のお知らせがあれば先頭に差し込む（F-08） */
export function autoAnswer(category: Category, closedNote: string | null): string | null {
  let body: string | null = null;
  if (category === "hours") body = HOURS_TEXT;
  else if (category === "price" || category === "menu") body = MENU_TEXT;
  else if (category === "duration") body = DURATION_TEXT;

  if (body === null) return null;

  // 休業のお知らせは、営業時間を聞かれたときに最優先で伝える
  if (closedNote && category === "hours") {
    return `⚠️ ${closedNote}\n\n${body}`;
  }
  return body;
}

/** 転送するものへの一次応答。お客様を待たせないための返事（F-05〜F-07・F-09） */
export function acknowledgement(category: Category, isOpen: boolean): string {
  const afterHours = isOpen
    ? ""
    : "\n\n※ ただいま営業時間外のため、翌営業日のご連絡となります。";

  switch (category) {
    // ここで希望日時まで聞いてしまう。
    // 「確認します」だけ返すと、オーナーが「いつがご希望ですか」と聞き直すことになり、
    // お客様とのやり取りが最低3往復になる。先に聞けば1往復で済む。
    case "availability":
      return `お問い合わせありがとうございます。

空き状況を確認して、オーナーより改めてご連絡いたします。

▼ よろしければ、あわせてお送りください
・ご希望の日にちと時間帯（第2希望までいただけると助かります）
・ご希望のメニュー（カット／カラー など）

いただいた内容をもとに確認いたします。${afterHours}`;

    case "change":
      return `ご連絡ありがとうございます。
承知いたしました。オーナーより至急ご連絡いたします。

▼ よろしければ、あわせてお送りください
・ご予約いただいている日時
・ご希望の変更先（キャンセルの場合はその旨）${afterHours}`;

    case "complaint":
      return `ご連絡ありがとうございます。

オーナーより直接ご返信いたしますので、
少々お待ちくださいませ。${afterHours}`;

    default:
      return `お問い合わせありがとうございます。

こちらはオーナーが確認のうえ、
改めてご返信いたします。${afterHours}`;
  }
}

// --- オーナー様専用のコマンド（スマホから操作できるようにするため：F-08・F-13） ---

export const OWNER_HELP = `【オーナー様メニュー】

下のボタンからお使いいただけます。
文字で送っても同じように動きます。

・「未対応」　… 未対応の一覧を表示します
・「休業 ◯◯」… 臨時休業のお知らせを設定します
　　例）休業 11/20（金）は臨時休業をいただきます
・「休業オフ」… 臨時休業のお知らせを取り消します`;

/** リッチメニューの「臨時休業を設定」を押したときの案内 */
export const CLOSED_PROMPT = `臨時休業のお知らせを設定します。

このトークに、次のように送ってください。

　休業 11/20（金）は臨時休業をいただきます

営業時間を聞かれたときに、この文章が先に表示されます。
取り消すときは「休業オフ」と送ってください。`;
