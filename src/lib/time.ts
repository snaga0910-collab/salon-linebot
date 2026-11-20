// 時刻まわり。サーバーの時計が何時であっても、日本時間で判断する。

import { SALON } from "./salon";

/** 日本時間の「今」を、数字で取り出す */
export function jstNow(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    // 24時は 0 として扱う
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

/** 日本時間の日付を「2026-11-20」の形にする。日付の比較はこの形で行う */
export function jstDateKey(now: Date = new Date()): string {
  const t = jstNow(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.year}-${pad(t.month)}-${pad(t.day)}`;
}

/** 日本時間で◯日後の日付キー。「明日まで」の計算に使う */
export function jstDateKeyAfter(days: number, now: Date = new Date()): string {
  return jstDateKey(new Date(now.getTime() + days * 24 * 60 * 60 * 1000));
}

/** 「2026-11-20」→「11月20日」。お客様とオーナー様に見せる形 */
export function formatDateKey(key: string): string {
  const [, m, d] = key.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

/** 「11/10 22:14」の形にする。通知に入れる受信時刻 */
export function formatJst(iso: string): string {
  const t = jstNow(new Date(iso));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.month}/${t.day} ${pad(t.hour)}:${pad(t.minute)}`;
}

/** いま営業中か。営業時間外なら「翌営業日のご連絡」と添える（要件定義書 F-05） */
export function isOpenNow(now: Date = new Date()): boolean {
  const t = jstNow(now);
  if ((SALON.closedWeekdays as readonly number[]).includes(t.weekday)) return false;
  const open = Number(SALON.openTime.split(":")[0]);
  const close = Number(SALON.closeTime.split(":")[0]);
  return t.hour >= open && t.hour < close;
}
