// 「すべて対応済みにする」ボタンのテスト。
//
// ここが壊れると、オーナー様が**まだ見ていない問い合わせを消してしまう**。
// 返信忘れを防ぐことがこのシステムの目的なので、一番こわい壊れ方になる。

import { describe, expect, it } from "vitest";
import { doneAllCutoff, doneAllData, isDoneAll, openListMessage } from "./line";
import type { Inquiry } from "./db";

function inquiry(id: string, receivedAt: string): Inquiry {
  return {
    id,
    line_user_id: "U1",
    display_name: "テスト",
    message_text: "空き状況を知りたいです",
    message_id: null,
    category: "availability",
    received_at: receivedAt,
    handled_at: null,
  };
}

describe("ボタンに「いつの一覧か」を持たせる", () => {
  it("作って、取り出せる", () => {
    const at = "2026-11-20T23:05:00.000Z";
    expect(doneAllCutoff(doneAllData(at))).toBe(at);
  });

  it("時刻を持たない古いボタンも受け付ける（全件が対象）", () => {
    // すでにオーナー様のトークに残っている通知は、押せなくなってはいけない
    expect(isDoneAll("done_all")).toBe(true);
    expect(doneAllCutoff("done_all")).toBeNull();
  });

  it("個別の「対応済み」ボタンと混ざらない", () => {
    expect(isDoneAll("done:abc-123")).toBe(false);
    expect(isDoneAll("closed_off")).toBe(false);
    expect(isDoneAll("closed_prompt")).toBe(false);
  });
});

describe("未対応の一覧", () => {
  const list = [
    inquiry("1", "2026-11-20T13:00:00.000Z"),
    inquiry("2", "2026-11-20T14:00:00.000Z"),
  ];

  it("2件以上あると、まとめて片付けるボタンが付く", () => {
    const msg = openListMessage(list, "おはようございます。") as {
      contents: { footer?: unknown };
    };
    expect(msg.contents.footer).toBeDefined();
  });

  it("そのボタンには、お送りした時刻が入っている", () => {
    const before = Date.now();
    const msg = openListMessage(list, "おはようございます。") as {
      contents: { footer: { contents: { action: { data: string } }[] } };
    };
    const at = doneAllCutoff(msg.contents.footer.contents[0].action.data);
    expect(at).not.toBeNull();
    // 一覧を作った時刻が入る（それより新しい問い合わせは消えない）
    expect(new Date(at as string).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("1件のときは付けない（個別ボタンで足りる）", () => {
    const msg = openListMessage([list[0]], "おはようございます。") as {
      contents: { footer?: unknown };
    };
    expect(msg.contents.footer).toBeUndefined();
  });
});
