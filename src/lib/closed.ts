// 臨時休業のお知らせ（要件定義書 F-08）。
//
// ■ いちばん大事な考え方
//
//   お知らせは「出す」と「消す」の2操作にしてはいけない。
//   消し忘れると、休みが終わったあとも案内が出続け、
//   お客様に嘘をつくことになる。しかも誰も気づけない。
//
//   そこで、お知らせには必ず**終わる日**を持たせる。
//   その日を過ぎたら、オーナー様が何もしなくても自動で消える。
//
//   オーナー様の操作は「出す」の1回だけ。消す操作は任意。

import { jstDateKey, jstDateKeyAfter, jstNow } from "./time";

export type Closure = {
  /** お客様に見せる文章 */
  text: string;
  /** この日までお知らせを出す（日本時間・"2026-11-20" の形） */
  until: string;
};

/** ボタン1つで設定できる休業 */
export const QUICK_CLOSURES = {
  today: { days: 0, text: "本日は臨時休業をいただきます" },
  tomorrow: { days: 1, text: "明日は臨時休業をいただきます" },
} as const;

export type QuickKind = keyof typeof QUICK_CLOSURES;

export function quickClosure(kind: QuickKind, now: Date = new Date()): Closure {
  const q = QUICK_CLOSURES[kind];
  return { text: q.text, until: jstDateKeyAfter(q.days, now) };
}

// --- 文章から「終わる日」を読み取る ---

/** 「12/29」「12月29日」をすべて拾う */
const DATE_RE = /(\d{1,2})\s*(?:\/|月)\s*(\d{1,2})\s*日?/g;

/** 「本日」「明日」などの言葉 */
const RELATIVE: { words: string[]; days: number }[] = [
  { words: ["本日", "ほんじつ", "今日", "きょう"], days: 0 },
  { words: ["明日", "あした", "あす", "みょうにち"], days: 1 },
  { words: ["明後日", "あさって"], days: 2 },
];

/**
 * 「12/29」のような月日から、西暦を決める。
 *
 * 年末に「1/3まで」と書かれたら、それは翌年の1月3日。
 * 今日より30日以上前になる日付は、来年のものとみなす。
 */
function resolveYear(month: number, day: number, now: Date): string {
  const t = jstNow(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  const asKey = (y: number) => `${y}-${pad(month)}-${pad(day)}`;

  const todayKey = jstDateKey(now);
  const thisYear = asKey(t.year);
  if (thisYear >= todayKey) return thisYear;

  // 今年の日付としては過ぎている。30日以内の過去なら今年、それ以上なら来年
  const graceKey = jstDateKeyAfter(-30, now);
  return thisYear >= graceKey ? thisYear : asKey(t.year + 1);
}

/**
 * オーナー様が書いた文章から、お知らせの終わる日を読み取る。
 *
 *   「11/20（金）は臨時休業をいただきます」      → 11月20日まで
 *   「12/29〜1/3は年末年始のお休みです」         → 1月3日まで（いちばん後ろの日付）
 *   「本日は都合により臨時休業いたします」        → 今日まで
 *   「午前中はお休みをいただきます」（日付なし）  → 今日まで
 *
 * 日付が書かれていない場合は**今日まで**とする。
 * 長く出しすぎて嘘をつくより、短く切れて出し直すほうが安全なため。
 */
export function parseClosure(text: string, now: Date = new Date()): Closure {
  const body = text.trim();
  const keys: string[] = [];

  for (const m of body.matchAll(DATE_RE)) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    keys.push(resolveYear(month, day, now));
  }

  for (const r of RELATIVE) {
    if (r.words.some((w) => body.includes(w))) keys.push(jstDateKeyAfter(r.days, now));
  }

  // いちばん後ろの日まで出す（「12/29〜1/3」なら1/3まで）
  const until = keys.length > 0 ? keys.sort().at(-1)! : jstDateKey(now);
  return { text: body, until };
}

/** まだ出しておく日か。until の当日までは出す */
export function isActive(c: Closure, now: Date = new Date()): boolean {
  return jstDateKey(now) <= c.until;
}
