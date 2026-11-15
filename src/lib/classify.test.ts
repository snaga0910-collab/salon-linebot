// 振り分けのテスト。
//
// ここがこのシステムで一番こわれやすい。言葉を1つ足すと、
// 別の種類に吸われて「料金を聞かれたのに営業時間を返す」といった事故が起きる。
// ヒアリングで伺った「実際に届いた文面」を、そのままテストにしている。

import { describe, expect, it } from "vitest";
import { classify, FORWARD_CATEGORIES } from "./classify";

describe("ヒアリングで伺った、よくある質問トップ5", () => {
  it("①「来週の土曜って空いてますか？」→ 空き状況", () => {
    expect(classify("来週の土曜って空いてますか？")).toBe("availability");
  });

  it("②「今日これから行けますか？」→ 空き状況", () => {
    expect(classify("今日これから行けますか？")).toBe("availability");
  });

  it("③「カラーっていくらですか？」→ 料金", () => {
    expect(classify("カラーっていくらですか？")).toBe("price");
  });

  it("④「カットとカラーだと何分かかりますか？」→ 所要時間", () => {
    expect(classify("カットとカラーだと何分かかりますか？")).toBe("duration");
  });

  it("⑤「何時までやってますか？」→ 営業時間", () => {
    expect(classify("何時までやってますか？")).toBe("hours");
  });
});

describe("すぐ気づきたいもの", () => {
  it("「明日の予約をキャンセルしたいです」→ 変更（空き状況に吸われない）", () => {
    expect(classify("明日の予約をキャンセルしたいです")).toBe("change");
  });

  it("「予約を変更したいです」→ 変更", () => {
    expect(classify("予約を変更したいです")).toBe("change");
  });

  it("「少し遅れそうです」→ 変更", () => {
    expect(classify("少し遅れそうです")).toBe("change");
  });

  it("「髪が傷んだ気がします」→ 相談（botは内容に触れない）", () => {
    expect(classify("髪が傷んだ気がします")).toBe("complaint");
  });

  it("「色が落ちてきたので相談したいです」→ 相談（料金に吸われない）", () => {
    expect(classify("色が落ちてきたので相談したいです")).toBe("complaint");
  });
});

describe("言葉が重なるときの優先順位", () => {
  it("「今日は何時までですか」→ 営業時間（『今日』で空き状況にしない）", () => {
    expect(classify("今日は何時までですか")).toBe("hours");
  });

  it("「明日のカラーはいくらですか」→ 料金（『明日』で空き状況にしない）", () => {
    expect(classify("明日のカラーはいくらですか")).toBe("price");
  });

  it("「土曜日に予約取れますか」→ 空き状況", () => {
    expect(classify("土曜日に予約取れますか")).toBe("availability");
  });

  it("「予約をキャンセルしたら料金かかりますか」→ 変更を優先する", () => {
    expect(classify("予約をキャンセルしたら料金かかりますか")).toBe("change");
  });
});

describe("分からないものは答えない", () => {
  it("「駐車場はありますか？」→ その他（推測で答えずオーナーへ）", () => {
    expect(classify("駐車場はありますか？")).toBe("other");
  });

  it("「子ども連れでも大丈夫ですか」→ その他", () => {
    expect(classify("子ども連れでも大丈夫ですか")).toBe("other");
  });

  it("空文字 → その他", () => {
    expect(classify("")).toBe("other");
  });
});

describe("表記のゆれ・打ち間違い", () => {
  it("ひらがなで打たれても拾う：「らいしゅうのどようびあいてますか」", () => {
    expect(classify("らいしゅうのどようびあいてますか")).toBe("availability");
  });

  it("ひらがなで打たれても拾う：「からーのりょうきんはいくらですか」", () => {
    expect(classify("からーのりょうきんはいくらですか")).toBe("price");
  });

  it("ひらがなで打たれても拾う：「よやくをへんこうしたいです」", () => {
    expect(classify("よやくをへんこうしたいです")).toBe("change");
  });

  it("長音がハイフンでも拾う：「カラ-っていくら？」", () => {
    expect(classify("カラ-っていくら？")).toBe("price");
  });

  it("半角カタカナでも拾う：「ｷｬﾝｾﾙしたいです」", () => {
    expect(classify("ｷｬﾝｾﾙしたいです")).toBe("change");
  });

  it("全角の記号や空白が混ざっても拾う：「何時 まで　やってますか」", () => {
    expect(classify("何時 まで　やってますか")).toBe("hours");
  });

  it("誤字があっても、言葉の一部が残っていれば拾える", () => {
    // 「空いてまうか」のように打ち間違えても「あいて」が残っていれば届く
    expect(classify("らいしゅうのどよう、あいてまうか")).toBe("availability");
  });

  it("判定できない文は、勝手に答えず『その他』へ倒す", () => {
    expect(classify("ちゅうしゃじょうはありますか")).toBe("other");
    expect(classify("こどもづれでもだいじょうぶですか")).toBe("other");
  });
});

describe("転送の対象", () => {
  it("自動で答えるものは転送しない", () => {
    for (const c of ["price", "duration", "hours", "menu"] as const) {
      expect(FORWARD_CATEGORIES).not.toContain(c);
    }
  });

  it("人が判断すべきものは必ず転送する", () => {
    for (const c of ["availability", "change", "complaint", "other"] as const) {
      expect(FORWARD_CATEGORIES).toContain(c);
    }
  });
});
