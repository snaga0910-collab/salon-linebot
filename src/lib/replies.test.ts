// お返しする文面のテスト。
//
// 未対応をひとつにまとめるのはオーナー様側の都合であって、
// その都合をお客様に見せてはいけない。
// ここは実機で2回つまずいている。

import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS, isButtonText } from "./buttons";
import { followUpAcknowledgement } from "./replies";

const OPEN = true;
const NO_NOTE = null;

const THANKS = "ありがとうございます。あわせてオーナーにお伝えいたします。";

function followUp(text: string, category: Parameters<typeof followUpAcknowledgement>[0]) {
  return followUpAcknowledgement(category, text, OPEN, NO_NOTE);
}

describe("ボタンの文面かどうか", () => {
  it("クイックリプライの5件をすべて拾う", () => {
    for (const m of MENU_ITEMS) {
      expect(isButtonText(m.text)).toBe(true);
    }
  });

  it("リッチメニューにしかない「その他のご質問」も拾う", () => {
    expect(isButtonText("スタッフに質問したいです")).toBe(true);
  });

  it("似ているが違う文面は拾わない", () => {
    expect(isButtonText("空き状況を知りたいのですが")).toBe(false);
    expect(isButtonText("土曜の午後が希望です")).toBe(false);
    expect(isButtonText("")).toBe(false);
  });

  it("リッチメニューを作るスクリプトと、文面がずれていない", () => {
    // ずれると、ボタンを押したのに「補足」として扱われる。
    // 片方だけ直したときに、ここで気づけるようにしておく。
    const script = readFileSync(
      new URL("../../scripts/setup_richmenu.py", import.meta.url),
      "utf8",
    );
    for (const t of [...MENU_ITEMS.map((m) => m.text), "スタッフに質問したいです"]) {
      expect(script, `${t} がスクリプトに見つかりません`).toContain(t);
    }
  });
});

describe("続けて届いた連絡へのお返事", () => {
  it("ボタンを押されたら、新しいご用件として扱う", () => {
    // 実機で見つかった不具合。問いかけの形でないため補足と判定していた
    const text = followUp("空き状況を知りたいです", "availability");
    expect(text).not.toBe(THANKS);
    expect(text).toContain("空き状況を確認して");
  });

  it("「予約を変更したいです」のボタンも、新しいご用件", () => {
    expect(followUp("予約を変更したいです", "change")).toContain("至急");
  });

  it("お悩みのご相談には、必ずご相談の文面で返す", () => {
    // 実機で見つかった不具合。「ありがとうございます」と返していた
    const text = followUp("髪が痛みました", "complaint");
    expect(text).not.toBe(THANKS);
    expect(text).toContain("オーナーより直接ご返信");
  });

  it("自由に打たれた予約変更にも、変更の文面で返す", () => {
    const text = followUp("やっぱりキャンセルでお願いします", "change");
    expect(text).toContain("ご予約いただいている日時");
  });

  it("新しい質問には、その用件の文面で返す", () => {
    expect(followUp("駐車場はありますか？", "other")).toContain("改めてご返信");
    expect(followUp("来週の土曜は空いてますか？", "availability")).toContain(
      "空き状況を確認して",
    );
  });

  it("先ほどの補足には、短くお礼を返す", () => {
    // 希望日時を答えていただいただけなので、同じ質問を繰り返さない
    expect(followUp("14時でカットでお願いします", "other")).toBe(THANKS);
    expect(followUp("土曜の午後が希望です", "availability")).toBe(THANKS);
  });

  it("営業時間外なら、その旨を添える", () => {
    expect(followUpAcknowledgement("complaint", "髪が痛みました", false, NO_NOTE)).toContain(
      "翌営業日",
    );
  });

  it("臨時休業中に予約変更が届いたら、休業のお知らせを先に出す", () => {
    const text = followUpAcknowledgement(
      "change",
      "予約を変更したいです",
      OPEN,
      "明日は臨時休業です",
    );
    expect(text.indexOf("明日は臨時休業です")).toBeLessThan(text.indexOf("至急"));
  });
});
