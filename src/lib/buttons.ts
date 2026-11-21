// お客様が押すボタンと、そのボタンが送る文面。
//
// ⚠️ scripts/setup_richmenu.py の CUSTOMER と必ず同じ文面にすること。
//    ずれると、ボタンを押したのに「補足」として扱われる。
//
// ボタンの文面は classify.ts が確実に拾える言葉にしてある。

import { normalize } from "./classify";

export const MENU_ITEMS = [
  { label: "🕐 営業時間", text: "営業時間を教えてください" },
  { label: "💇 メニューと料金", text: "メニューと料金を教えてください" },
  { label: "⏱ 施術時間", text: "施術時間はどのくらいかかりますか" },
  { label: "📅 空き状況", text: "空き状況を知りたいです" },
  { label: "✏️ 予約の変更", text: "予約を変更したいです" },
  // 最後の逃げ道。botが用件を拾えなかったときでも、
  // お客様がここを押せば必ずオーナー様に届く。
  { label: "💬 オーナーにきく", text: "スタッフに質問したいです" },
] as const;

const BUTTON_TEXTS = new Set(MENU_ITEMS.map((m) => normalize(m.text)));

/**
 * ボタンを押して送られた文面かどうか。
 *
 * ボタンが押されたということは、**新しいご用件をお持ちだということ**。
 * 先ほどの問い合わせへの補足ではない。
 *
 * 「空き状況を知りたいです」と「土曜の午後が希望です」は、
 * どちらも空き状況にかかわる、問いかけの形でない文面で、見分けがつかない。
 * 唯一たしかな違いが「ボタンの文面かどうか」なので、ここで見る。
 */
export function isButtonText(text: string): boolean {
  return BUTTON_TEXTS.has(normalize(text));
}
