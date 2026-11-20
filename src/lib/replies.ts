// お客様にお返しする文章。すべて決め打ちの文。
// AIに書かせない。間違った料金や営業時間を案内しないことが最優先（要件定義書 N-01）。

import { isButtonText } from "./buttons";
import { DURATION_TEXT, HOURS_TEXT, MENU_TEXT, SALON } from "./salon";
import { looksLikeQuestion, type Category } from "./classify";

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
export function acknowledgement(
  category: Category,
  isOpen: boolean,
  closedNote: string | null = null,
): string {
  const afterHours = isOpen
    ? ""
    : "\n\n※ ただいま営業時間外のため、翌営業日のご連絡となります。";

  // 日時にかかわる用件のときは、休業のお知らせを先に伝える。
  // 休みの日をご希望のまま話が進むと、お互いに無駄な往復が生まれる。
  const closed =
    closedNote && (category === "availability" || category === "change")
      ? `⚠️ ${closedNote}\n\n`
      : "";

  switch (category) {
    // ここで希望日時まで聞いてしまう。
    // 「確認します」だけ返すと、オーナーが「いつがご希望ですか」と聞き直すことになり、
    // お客様とのやり取りが最低3往復になる。先に聞けば1往復で済む。
    case "availability":
      return `${closed}お問い合わせありがとうございます。

空き状況を確認して、オーナーより改めてご連絡いたします。

▼ よろしければ、あわせてお送りください
・ご希望の日にちと時間帯（第2希望までいただけると助かります）
・ご希望のメニュー（カット／カラー など）

いただいた内容をもとに確認いたします。${afterHours}`;

    case "change":
      return `${closed}ご連絡ありがとうございます。
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

/**
 * 続けて届いた連絡へのお返事（F-17）。
 *
 * 未対応はひとつにまとめるが、**お返しする文面は内容に合わせる**。
 * まとめる都合を、お客様に見せてはいけない。
 *
 * とくに「髪が傷んだ」のようなご相談に
 * 「ありがとうございます。あわせてお伝えします」と返してはならない。
 */
export function followUpAcknowledgement(
  category: Category,
  text: string,
  isOpen: boolean,
  closedNote: string | null,
): string {
  // ① ボタンを押された＝新しいご用件。先ほどの補足ではない
  // ② お気持ちや急ぎにかかわる用件は、必ずその用件の文面でお返しする
  // ③ 問いかけの形なら、新しいご質問として受け止める
  const isNewRequest =
    isButtonText(text) ||
    category === "complaint" ||
    category === "change" ||
    looksLikeQuestion(text);

  if (isNewRequest) return acknowledgement(category, isOpen, closedNote);

  // それ以外は、先ほどの補足（「14時でカットでお願いします」など）
  return "ありがとうございます。あわせてオーナーにお伝えいたします。";
}

// --- オーナー様専用のコマンド（スマホから操作できるようにするため：F-08・F-13） ---

export const OWNER_HELP = `【オーナー様メニュー】

下のボタンからお使いいただけます。
文字で送っても同じように動きます。

・「未対応」　… 未対応の一覧を表示します
・「休業 ◯◯」… 臨時休業のお知らせを設定します
　　例）休業 11/20（金）は臨時休業をいただきます
・「休業オフ」… 臨時休業のお知らせを取り消します`;

/**
 * リッチメニューの「臨時休業を設定」を押したときの案内。
 * 見本の日付を「設定された日付」と読み違えないよう、書き方だけを示す。
 */
export const CLOSED_PROMPT = `臨時休業のお知らせを設定します。
（この時点では、まだ何も設定されていません）

入力欄に「休業 」と入れてありますので、
そのうしろに、お休みの内容を続けて入力してください。

── 書き方の見本 ───────────
休業 11/20（金）は臨時休業をいただきます
休業 12/29〜1/3は年末年始のお休みです
休業 本日は都合により臨時休業いたします
──────────────────────

※ 日付や文面は自由に書けます。上は見本です。
※ 送信すると、営業時間を聞かれたときに
　 この文章がいちばん上に表示されます。`;
