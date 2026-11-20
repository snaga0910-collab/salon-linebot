// お返しする文面のテスト。
//
// 未対応をひとつにまとめるのはオーナー様側の都合であって、
// その都合をお客様に見せてはいけない。
// 実機で「髪が痛みました」に「ありがとうございます」と返してしまった。

import { describe, expect, it } from "vitest";
import { followUpAcknowledgement } from "./replies";

const OPEN = true;
const NO_NOTE = null;

describe("続けて届いた連絡へのお返事", () => {
  it("お悩みのご相談には、必ずご相談の文面で返す", () => {
    // 実機で見つかった不具合。「ありがとうございます」と返していた
    const text = followUpAcknowledgement("complaint", false, OPEN, NO_NOTE);
    expect(text).not.toContain("ありがとうございます。あわせて");
    expect(text).toContain("オーナーより直接ご返信");
  });

  it("予約の変更には、必ず変更の文面で返す", () => {
    const text = followUpAcknowledgement("change", false, OPEN, NO_NOTE);
    expect(text).toContain("至急");
    expect(text).toContain("ご予約いただいている日時");
  });

  it("新しい質問には、受け止めたことが伝わる文面で返す", () => {
    const text = followUpAcknowledgement("other", true, OPEN, NO_NOTE);
    expect(text).toContain("改めてご返信");
  });

  it("先ほどの補足には、短くお礼を返す", () => {
    const text = followUpAcknowledgement("other", false, OPEN, NO_NOTE);
    expect(text).toBe("ありがとうございます。あわせてオーナーにお伝えいたします。");
  });

  it("営業時間外なら、その旨を添える", () => {
    const text = followUpAcknowledgement("complaint", false, false, NO_NOTE);
    expect(text).toContain("翌営業日");
  });

  it("臨時休業中に予約変更が届いたら、休業のお知らせを先に出す", () => {
    const text = followUpAcknowledgement("change", false, OPEN, "明日は臨時休業です");
    expect(text.indexOf("明日は臨時休業です")).toBeLessThan(text.indexOf("至急"));
  });
});
