// お店の情報（正本）の見張り番。
//
// 料金と営業時間を間違えることが、このシステムで一番やってはいけない失敗。
// 要件定義書の成功指標でも「誤った料金・営業時間の案内 0件（必達）」としている。
//
// 納品後、オーナー様から新しい料金表をいただいて書き換えるのは人の手。
// そのとき注意書きを消してしまう・幅を取ってしまう、という事故を
// 人の記憶に頼らず、ここで止める。

import { describe, expect, it } from "vitest";
import { DURATION_TEXT, HOURS_TEXT, MENU_TEXT, SALON } from "./salon";
import { isOpenNow } from "./time";

/** 「・カット　4,500円〜」のような金額の行を取り出す */
function priceLines(): string[] {
  return MENU_TEXT.split("\n").filter((l) => l.startsWith("・") && l.includes("円"));
}

/** 「17:00」→ 17 */
function hourOf(hhmm: string): number {
  return Number(hhmm.split(":")[0]);
}

describe("料金は断定しない", () => {
  it("金額の行がある", () => {
    expect(priceLines().length).toBeGreaterThan(0);
  });

  it("髪の長さで変わるメニューは「〜」で幅を持たせる", () => {
    // ロングは +1,000円、セット割引もある。
    // 単一の金額で答えるとその場で誤案内になり、クレームに直結する。
    // 前髪カットだけは長さで変わらないため、定額でよい。
    const flatOk = ["前髪カット"];
    for (const line of priceLines()) {
      if (flatOk.some((m) => line.includes(m))) continue;
      expect(line, `「${line}」は金額を言い切っています`).toContain("〜");
    }
  });

  it("3つの注意書きを消さない", () => {
    expect(MENU_TEXT).toContain("ロング");
    expect(MENU_TEXT).toContain("お安くなります");
    expect(MENU_TEXT).toContain("正確な金額は施術時にご案内");
  });

  it("所要時間も幅か「約」で書く", () => {
    for (const line of DURATION_TEXT.split("\n").filter((l) => l.startsWith("・"))) {
      expect(line, `「${line}」は時間を言い切っています`).toMatch(/約|〜/);
    }
  });
});

describe("営業時間の案内と、営業中の判定が食い違わない", () => {
  it("案内文の時刻は SALON から組み立てられている", () => {
    // ここが別々だと、「営業中です」と答えながら閉店していることが起きる
    expect(HOURS_TEXT).toContain(`${SALON.openTime} 〜 ${SALON.closeTime}`);
    expect(HOURS_TEXT).toContain(SALON.closedWeekdayLabel);
  });

  it("定休日は営業中にならない", () => {
    // 2026-11-25 は水曜日。JST の昼どき
    expect(isOpenNow(new Date("2026-11-25T03:00:00Z"))).toBe(false);
  });

  it("開店前・閉店後は営業中にならない", () => {
    expect(isOpenNow(new Date("2026-11-26T00:00:00Z"))).toBe(false); // JST 9:00
    expect(isOpenNow(new Date("2026-11-26T01:00:00Z"))).toBe(true); // JST 10:00
    expect(isOpenNow(new Date("2026-11-26T09:00:00Z"))).toBe(true); // JST 18:00
    expect(isOpenNow(new Date("2026-11-26T10:00:00Z"))).toBe(false); // JST 19:00
  });

  it("最終受付は閉店より前", () => {
    const close = hourOf(SALON.closeTime);
    expect(hourOf(SALON.lastOrder.cut)).toBeLessThan(close);
    expect(hourOf(SALON.lastOrder.color)).toBeLessThan(close);
  });

  it("カラーのほうが、カットより早く締め切る（施術が長いため）", () => {
    expect(hourOf(SALON.lastOrder.color)).toBeLessThan(hourOf(SALON.lastOrder.cut));
  });
});
