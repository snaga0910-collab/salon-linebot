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

  // 自動回答は「答えて終わり」にしない。
  // botが用件を取り違えても、お客様が自分で人にたどり着けるようにしておく。
  const escape = `\n\n──────────\nほかにご不明な点やお困りごとがありましたら、そのままメッセージをお送りください。オーナーが確認してご返信いたします。`;

  // 休業のお知らせは、営業時間を聞かれたときに最優先で伝える
  if (closedNote && category === "hours") {
    return `⚠️ ${closedNote}\n\n${body}${escape}`;
  }
  return `${body}${escape}`;
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

  // 日時にかかわる用件のときは、休業のお知らせも伝える。
  // 休みの日をご希望のまま話が進むと、お互いに無駄な往復が生まれる。
  //
  // ただし、お客様はまだ日にちを言っていない。
  // いきなり ⚠️ から始めると、断られたように読めてしまうので、
  // まずお礼を述べ、そのうえで「なお」として添える。
  const closed =
    closedNote && (category === "availability" || category === "change")
      ? `\n⚠️ なお、${closedNote}\n`
      : "";

  switch (category) {
    // ここで希望日時まで聞いてしまう。
    // 「確認します」だけ返すと、オーナーが「いつがご希望ですか」と聞き直すことになり、
    // お客様とのやり取りが最低3往復になる。先に聞けば1往復で済む。
    case "availability":
      return `お問い合わせありがとうございます。

空き状況を確認して、オーナーより改めてご連絡いたします。
${closed}
▼ よろしければ、あわせてお送りください
・ご希望の日にちと時間帯（第2希望までいただけると助かります）
・ご希望のメニュー（カット／カラー など）

いただいた内容をもとに確認いたします。${afterHours}`;

    case "change":
      return `ご連絡ありがとうございます。
承知いたしました。オーナーより至急ご連絡いたします。
${closed}
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
): string {
  // ① ボタンを押された＝新しいご用件。先ほどの補足ではない
  // ② お気持ちや急ぎにかかわる用件は、必ずその用件の文面でお返しする
  // ③ 問いかけの形なら、新しいご質問として受け止める
  const isNewRequest =
    isButtonText(text) ||
    category === "complaint" ||
    category === "change" ||
    looksLikeQuestion(text);

  // 休業のお知らせは繰り返さない。
  // 続きの連絡ということは、直近のお返事で一度お伝えしている。
  // 1通のなかで同じ警告を何度も見せると、かえって読み飛ばされる。
  if (isNewRequest) return acknowledgement(category, isOpen, null);

  // それ以外は、先ほどの補足（「14時でカットでお願いします」など）
  return "ありがとうございます。あわせてオーナーにお伝えいたします。";
}

/**
 * 文字以外のメッセージ（スタンプ・お写真など）の種類。
 *
 * ■ なぜ必要か
 *
 *   以前は、文字以外のメッセージを何もせずに読み捨てていた。
 *   エラーにはならないが、**お客様にもオーナー様にも何も届かない**。
 *
 *   「髪が傷んだ」とだけ書いて、あとは写真を送るお客様がいる。
 *   そのお写真が誰にも届かないのは、本システムで最も起きてはいけないこと。
 *   用件を読み取れないのは構わない。人に届かないのが許されない。
 *
 * ■ label と noun を分ける理由
 *
 *   label … 未対応の一覧とオーナー様への通知に出す言い方。
 *           「何が届いたか」が一目で分かればよいので、記号で囲んで短くする。
 *   noun  … お客様へのお返事で使う言い方。お客様に「［　］」は見せない。
 */
const NON_TEXT_KINDS: Record<string, { label: string; noun: string }> = {
  sticker: { label: "［スタンプ］", noun: "スタンプ" },
  image: { label: "［お写真］", noun: "お写真" },
  video: { label: "［動画］", noun: "動画" },
  audio: { label: "［音声メッセージ］", noun: "音声メッセージ" },
  file: { label: "［ファイル］", noun: "ファイル" },
  location: { label: "［位置情報］", noun: "位置情報" },
};

/** 知らない種類が増えても読み捨てないための受け皿 */
const UNKNOWN_KIND = { label: "［メッセージ］", noun: "メッセージ" };

/**
 * 文字以外のメッセージなら、その種類を返す。文字のときは null。
 *
 * LINE がこれから新しい種類を増やしても、UNKNOWN_KIND に落ちて
 * オーナー様には届く。知らないものを黙って捨てない。
 */
export function nonTextKind(
  messageType: string,
): { label: string; noun: string } | null {
  if (messageType === "" || messageType === "text") return null;
  return NON_TEXT_KINDS[messageType] ?? UNKNOWN_KIND;
}

/**
 * 文字以外のメッセージへの一次応答。
 *
 * 中身は読み取れないので、**推測で答えない**（N-01と同じ考え方）。
 * 「届いている」「人が見る」ことだけをお伝えして、人にまわす。
 *
 * あわせて文字でもお送りいただけるとお願いしておく。
 * お写真だけだと、オーナー様がご用件を測りかねるため。
 */
export function nonTextAcknowledgement(noun: string, isOpen: boolean): string {
  const afterHours = isOpen
    ? ""
    : "\n\n※ ただいま営業時間外のため、翌営業日のご連絡となります。";

  return `${noun}をお送りいただきありがとうございます。

オーナーが確認のうえ、改めてご返信いたします。

※ ご用件を文字でもお送りいただけますと、より早くご案内できます。${afterHours}`;
}

// --- オーナー様専用のコマンド（スマホから操作できるようにするため：F-08・F-13） ---

export const OWNER_HELP = `【オーナー様メニュー】

下のボタンからお使いいただけます。
文字で送っても同じように動きます。

・「未対応」　… 未対応の一覧を表示します
・「本日休業」「明日休業」… ボタン1つで設定できます
・「休業 ◯◯」… 日付を指定して設定します
　　例）休業 12/29〜1/3は年末年始のお休みです
・「休業オフ」… 早めに取り下げたいときだけ使います

※ お知らせは、お休みの日が過ぎると自動で消えます。
　 取り消し操作は必要ありません。`;

/**
 * リッチメニューの「日付を指定」を押したときの案内。
 * 見本の日付を「設定された日付」と読み違えないよう、書き方だけを示す。
 */
export const CLOSED_PROMPT = `日付を指定して、臨時休業のお知らせを出します。
（この時点では、まだ何も設定されていません）

入力欄に「休業 」と入れてありますので、
そのうしろに、お休みの内容を続けて入力してください。

── 書き方の見本 ───────────
休業 11/20（金）は臨時休業をいただきます
休業 12/29〜1/3は年末年始のお休みです
──────────────────────

※ 文中の日付を読み取って、その日まで自動で出します。
　 その日を過ぎれば、ひとりでに消えます。
※ 本日・明日のお休みは、ボタン1つで設定できます。`;

/** 設定できたときのお返事。いつまで出るのかを必ず伝える */
export function closureSetMessage(text: string, untilLabel: string): string {
  return `臨時休業のお知らせを出しました。

「${text}」

${untilLabel}まで表示し、そのあとは自動で消えます。
取り消しの操作は必要ありません。

※ 早めに取り下げたいときは［休業を取り消す］を押してください。`;
}
