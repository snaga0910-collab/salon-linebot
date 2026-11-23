// お店の情報。ここが「正本」。
// 料金や営業時間を変えるときは、このファイルだけを直せば全部の返答に反映される。
//
// 出典：オーナー様よりご提供いただいた**店内の紙メニュー表**（要件定義書 P-03）
// 受領日：2026年11月23日
//
// 書き換えるときは、必ず紙メニュー表と1行ずつ突き合わせること。
// 「誤った料金・営業時間の案内 0件」は必達の指標（要件定義書 第3章）。
// 「〜」の付け忘れと注意書きの消し忘れは salon.test.ts が止める。

export const SALON = {
  name: "hair salon mina",
  openTime: "10:00",
  closeTime: "19:00",
  /** 0=日 1=月 2=火 3=水 4=木 5=金 6=土 */
  closedWeekdays: [3],
  closedWeekdayLabel: "水曜日",
  /**
   * 最終受付。いちばん長い施術でも閉店までに終わる時刻にする。
   *
   * color は薬剤を使うメニュー、cut はそれ以外。
   * カット＋カラーが最長150分のため、color は16:00。
   * （17:00だと19:30〜20:00になり、閉店を超えていた）
   */
  lastOrder: { color: "16:00", cut: "18:00" },
} as const;

/**
 * 施術時間の目安。
 *
 * ここを正本にして、お客様への案内文と最終受付の妥当性チェックの
 * **両方を作る**。別々に書くと、時間だけ直して最終受付が取り残される。
 *
 * minutes は「いちばん長くかかる場合」。最終受付の計算に使う。
 * chair は、どちらの最終受付が適用されるか。
 */
export const DURATIONS = [
  { name: "カット", minutes: 60, label: "約60分", chair: "cut" },
  { name: "前髪カット", minutes: 15, label: "約15分", chair: "cut" },
  { name: "カラー", minutes: 90, label: "約90分", chair: "color" },
  { name: "パーマ", minutes: 120, label: "約120分", chair: "color" },
  { name: "トリートメント", minutes: 30, label: "約30分", chair: "cut" },
  { name: "カット＋カラー", minutes: 150, label: "約120〜150分", chair: "color" },
] as const;

/** 料金。幅を持たせて書く。断定すると誤案内になるため（要件定義書 F-03） */
export const MENU_TEXT = `【メニューと料金】

・カット　4,500円〜
・前髪カット　1,000円
・カラー　6,000円〜
・パーマ　7,000円〜
・トリートメント　2,000円〜
・カット＋カラー　10,000円〜

※ ロングの方は +1,000円を頂戴しております
※ カットとカラーを同時にご利用の場合、お安くなります
※ 髪の長さや状態で変わりますので、正確な金額は施術時にご案内いたします`;

/** 所要時間。こちらも幅を持たせる */
export const DURATION_TEXT = `【施術時間の目安】

${DURATIONS.map((d) => `・${d.name}　${d.label}`).join("\n")}

※ 髪の長さや状態によって前後いたします`;

/** 最終受付が同じメニューを「カラー・パーマ・カット＋カラー」の形に並べる */
function menuNames(chair: "cut" | "color"): string {
  return DURATIONS.filter((d) => d.chair === chair)
    .map((d) => d.name)
    .join("・");
}

/**
 * 営業時間。臨時休業のお知らせがあるときは、この前に差し込まれる。
 *
 * 時刻もメニュー名も、必ず SALON と DURATIONS から組み立てる。
 * ここに直接「10:00 〜 19:00」と書くと、SALON を直したときに
 * **お客様への案内だけが古いまま**になり、
 * 「営業中です」と答えながら閉店している、という食い違いが起きる。
 */
export const HOURS_TEXT = `【営業時間】

${SALON.openTime} 〜 ${SALON.closeTime}
定休日：毎週${SALON.closedWeekdayLabel}

※ ${menuNames("color")}は${SALON.lastOrder.color}、${menuNames("cut")}は${SALON.lastOrder.cut}が最終受付となります`;
