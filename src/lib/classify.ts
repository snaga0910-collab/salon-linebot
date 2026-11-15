// お客様のメッセージを、どの種類の問い合わせかに振り分ける。
//
// AIには読ませない。間違った料金を案内しないことが最優先のため（要件定義書 N-01）。
// 言葉が入っているかどうかだけで判断し、迷ったら "other"（＝オーナーへ転送）に倒す。

export type Category =
  | "complaint"    // クレーム・お悩み相談　→ 内容に触れず転送
  | "change"       // 予約の変更・キャンセル　→ 【至急】で転送
  | "availability" // 空き状況　　　　　　　→ 一次受けして転送
  | "price"        // 料金　　　　　　　　　→ 自動回答
  | "duration"     // 所要時間　　　　　　　→ 自動回答
  | "hours"        // 営業時間　　　　　　　→ 自動回答
  | "menu"         // メニュー一覧　　　　　→ 自動回答
  | "other";       // それ以外　　　　　　　→ 転送

/** オーナーへ転送し、未対応として記録する種類 */
export const FORWARD_CATEGORIES: Category[] = [
  "complaint",
  "change",
  "availability",
  "other",
];

/** 上から順に判定する。並び順そのものが仕様。 */
const RULES: { category: Category; words: string[] }[] = [
  // 一番きわどいものから見る。ここを下げると、他の判定に吸われてしまう。
  {
    category: "complaint",
    words: ["傷ん", "痛ん", "似合わ", "失敗", "色が落ち", "色落ち", "思ってたのと",
            "クレーム", "苦情", "相談したい", "お悩み", "悩んで", "抜け毛", "薄毛"],
  },
  {
    category: "change",
    words: ["キャンセル", "変更", "ずらし", "リスケ", "行けなくな",
            "いけなくな", "遅れ", "日にちを", "日程を", "取り消"],
  },
  // 空き状況のうち、言い切りの強い言葉
  {
    category: "availability",
    words: ["空いて", "空き", "あいて", "予約", "取れますか", "とれますか"],
  },
  { category: "menu", words: ["メニュー"] },
  { category: "price", words: ["いくら", "値段", "料金", "価格", "金額", "おいくら"] },
  {
    category: "duration",
    words: ["何分", "どのくらい時間", "どれくらい時間", "時間かかり", "時間はかかり"],
  },
  {
    category: "hours",
    words: ["営業", "何時まで", "何時から", "定休", "お休みは", "やってます",
            "やっていま", "開いて", "開店", "閉店"],
  },
  // 空き状況のうち、弱い言葉。料金や営業時間に吸われないよう最後に見る。
  // 例：「今日は何時までですか」は hours、「今日これから行けますか」は availability
  {
    category: "availability",
    words: ["今日", "本日", "明日", "あした", "今週", "来週", "今度の",
            "月曜", "火曜", "水曜", "木曜", "金曜", "土曜", "日曜",
            "行けます", "いけます", "伺えます", "うかがえます"],
  },
];

export function classify(text: string): Category {
  const t = text.replace(/\s/g, "");
  for (const rule of RULES) {
    if (rule.words.some((w) => t.includes(w))) return rule.category;
  }
  return "other";
}
