// 臨時休業のお知らせのテスト。
//
// ここが壊れると、休みが終わったあともお知らせが出続ける。
// つまり**お客様に嘘をつき、しかも誰も気づけない**。
// 本システムでいちばん実害の大きい壊れ方なので、厚く確かめる。

import { describe, expect, it } from "vitest";
import { isActive, parseClosure, quickClosure } from "./closed";

// 日本時間の 2026年11月20日（金）22:00
const NOW = new Date("2026-11-20T13:00:00Z");
// 日本時間の 2026年12月31日 10:00（年またぎの確認用）
const NEW_YEARS_EVE = new Date("2026-12-31T01:00:00Z");

describe("ボタン1つで出す休業", () => {
  it("本日休業は、今日まで", () => {
    expect(quickClosure("today", NOW)).toEqual({
      text: "本日は臨時休業をいただきます",
      until: "2026-11-20",
    });
  });

  it("明日休業は、明日まで", () => {
    expect(quickClosure("tomorrow", NOW).until).toBe("2026-11-21");
  });
});

describe("文章から終わる日を読み取る", () => {
  const until = (text: string, now = NOW) => parseClosure(text, now).until;

  it("「11/22（日）は臨時休業をいただきます」→ 11月22日まで", () => {
    expect(until("11/22（日）は臨時休業をいただきます")).toBe("2026-11-22");
  });

  it("「11月22日はお休みです」→ 11月22日まで", () => {
    expect(until("11月22日はお休みです")).toBe("2026-11-22");
  });

  it("連休は、いちばん後ろの日まで", () => {
    // 「12/29〜1/3」なら 1/3 まで出す。初日で消えては意味がない
    expect(until("12/29〜1/3は年末年始のお休みです", NEW_YEARS_EVE)).toBe("2027-01-03");
    expect(until("11/21〜11/23は連休をいただきます")).toBe("2026-11-23");
  });

  it("「本日」「明日」も読み取る", () => {
    expect(until("本日は都合により臨時休業いたします")).toBe("2026-11-20");
    expect(until("明日は急遽お休みをいただきます")).toBe("2026-11-21");
    expect(until("明後日はお休みです")).toBe("2026-11-22");
  });

  it("日付が書かれていなければ、今日かぎりにする", () => {
    // 長く出しすぎて嘘をつくより、短く切れて出し直すほうが安全
    expect(until("午前中はお休みをいただきます")).toBe("2026-11-20");
    expect(until("都合により臨時休業いたします")).toBe("2026-11-20");
  });

  it("文章はそのまま残す（お客様に見せる文面を勝手に変えない）", () => {
    const text = "11/22（日）は臨時休業をいただきます";
    expect(parseClosure(text, NOW).text).toBe(text);
  });
});

describe("年またぎ", () => {
  it("12月末に「1/3まで」と書いたら、翌年の1月3日", () => {
    expect(parseClosure("1/3まで年末年始のお休みです", NEW_YEARS_EVE).until).toBe(
      "2027-01-03",
    );
  });

  it("うっかり過ぎた日付を書いても、来年扱いにして出し続けない", () => {
    // 11/20 に「11/1」と書くのは打ち間違い。来年の11/1まで出したら事故になる
    expect(parseClosure("11/1はお休みです", NOW).until).toBe("2026-11-01");
    expect(isActive(parseClosure("11/1はお休みです", NOW), NOW)).toBe(false);
  });
});

describe("期限が来たら、ひとりでに消える", () => {
  const closure = parseClosure("11/22（日）は臨時休業をいただきます", NOW);

  it("当日までは出す", () => {
    expect(isActive(closure, new Date("2026-11-20T13:00:00Z"))).toBe(true);
    // 11/22 の 23:50（日本時間）でも、まだその日なので出す
    expect(isActive(closure, new Date("2026-11-22T14:50:00Z"))).toBe(true);
  });

  it("翌日になったら出さない", () => {
    // 11/23 の 00:10（日本時間）＝ UTC では 11/22 15:10
    expect(isActive(closure, new Date("2026-11-22T15:10:00Z"))).toBe(false);
  });

  it("オーナー様が何もしなくても消える、が肝心", () => {
    expect(isActive(closure, new Date("2027-05-01T00:00:00Z"))).toBe(false);
  });
});
