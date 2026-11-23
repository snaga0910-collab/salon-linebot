// お返しする文面のテスト。
//
// 未対応をひとつにまとめるのはオーナー様側の都合であって、
// その都合をお客様に見せてはいけない。
// ここは実機で2回つまずいている。

import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS, isButtonText } from "./buttons";
import {
  acknowledgement,
  autoAnswer,
  followUpAcknowledgement,
  nonTextAcknowledgement,
  nonTextKind,
} from "./replies";

const OPEN = true;
const NO_NOTE = null;

const THANKS = "ありがとうございます。あわせてオーナーにお伝えいたします。";

function followUp(text: string, category: Parameters<typeof followUpAcknowledgement>[0]) {
  return followUpAcknowledgement(category, text, OPEN);
}

describe("ボタンの文面かどうか", () => {
  it("クイックリプライのボタンをすべて拾う", () => {
    for (const m of MENU_ITEMS) {
      expect(isButtonText(m.text)).toBe(true);
    }
  });

  it("最後の逃げ道「オーナーにきく」も拾う", () => {
    // botが用件を取り違えても、ここを押せば必ずオーナー様に届く
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
    for (const m of MENU_ITEMS) {
      expect(script, `${m.text} がスクリプトに見つかりません`).toContain(m.text);
    }
  });
});

describe("自動回答にも、人へたどり着く道を残す", () => {
  it("答えたあとに「そのままお送りください」と添える", () => {
    // botが用件を取り違えても、お客様が自分で人にたどり着けるようにする
    for (const c of ["price", "duration", "hours", "menu"] as const) {
      expect(autoAnswer(c, null)).toContain("そのままメッセージをお送りください");
    }
  });

  it("転送するものには添えない（すでに人へ渡っているため）", () => {
    for (const c of ["availability", "change", "complaint", "other"] as const) {
      expect(autoAnswer(c, null)).toBeNull();
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
    expect(followUpAcknowledgement("complaint", "髪が痛みました", false)).toContain(
      "翌営業日",
    );
  });
});

describe("臨時休業のお知らせの出し方", () => {
  const NOTE = "明日は急遽都合によりお休みをいただきます";

  it("営業時間を聞かれたら、いちばん上に出す", () => {
    // 「何時まで？」への答えとしては、休みであることが最重要
    const text = autoAnswer("hours", NOTE) as string;
    expect(text.startsWith(`⚠️ ${NOTE}`)).toBe(true);
  });

  it("空き状況では、お礼のあとに「なお」として添える", () => {
    // お客様はまだ日にちを言っていない。⚠️ で始めると断られたように読める
    const text = acknowledgement("availability", OPEN, NOTE);
    expect(text.startsWith("お問い合わせありがとうございます")).toBe(true);
    expect(text).toContain(`⚠️ なお、${NOTE}`);
    // 希望日時を伺う前に出す（休みの日をご希望のまま進めないため）
    expect(text.indexOf("なお、")).toBeLessThan(text.indexOf("▼"));
  });

  it("予約の変更でも、承ったあとに添える", () => {
    const text = acknowledgement("change", OPEN, NOTE);
    expect(text.startsWith("ご連絡ありがとうございます")).toBe(true);
    expect(text).toContain(`⚠️ なお、${NOTE}`);
  });

  it("ご相談には出さない（お気持ちの話に休業は関係ない）", () => {
    expect(acknowledgement("complaint", OPEN, NOTE)).not.toContain(NOTE);
  });

  it("続きの連絡には出さない（直近のお返事で一度お伝えしている）", () => {
    // 1通のなかで同じ警告を繰り返すと、かえって読み飛ばされる
    expect(followUp("空き状況を知りたいです", "availability")).not.toContain("なお、");
  });

  it("お知らせがなければ、何も足さない", () => {
    expect(acknowledgement("availability", OPEN, NO_NOTE)).not.toContain("⚠️");
  });
});

describe("文字以外のメッセージ（スタンプ・お写真）", () => {
  // 以前はここで読み捨てていた。
  // 「髪が傷んだ」と書いたあとに写真だけ送るお客様がいるので、
  // 誰にも届かないのは事故になる。

  it("文字のときは null（ふだんの流れを変えない）", () => {
    expect(nonTextKind("text")).toBeNull();
    expect(nonTextKind("")).toBeNull();
  });

  it("スタンプ・お写真・動画・音声・ファイル・位置情報を見分ける", () => {
    expect(nonTextKind("sticker")?.label).toBe("［スタンプ］");
    expect(nonTextKind("image")?.label).toBe("［お写真］");
    expect(nonTextKind("video")?.label).toBe("［動画］");
    expect(nonTextKind("audio")?.label).toBe("［音声メッセージ］");
    expect(nonTextKind("file")?.label).toBe("［ファイル］");
    expect(nonTextKind("location")?.label).toBe("［位置情報］");
  });

  it("知らない種類も読み捨てず、オーナー様に届く形にする", () => {
    // LINEが新しい種類を増やしても、黙って消えないこと
    expect(nonTextKind("sowakaranai")).not.toBeNull();
    expect(nonTextKind("sowakaranai")?.label).toBe("［メッセージ］");
  });

  it("お客様へのお返事に「［　］」を見せない", () => {
    for (const type of ["sticker", "image", "video", "audio", "file", "location"]) {
      const kind = nonTextKind(type)!;
      const text = nonTextAcknowledgement(kind.noun, OPEN);
      expect(text, `${type} のお返事に記号が出ています`).not.toContain("［");
      expect(text).toContain(kind.noun);
    }
  });

  it("中身を推測して答えない", () => {
    // 料金・営業時間を推測で答えるのが、このシステムで一番の事故
    const text = nonTextAcknowledgement("お写真", OPEN);
    expect(text).not.toContain("円");
    expect(text).not.toContain(":");
    expect(text).toContain("オーナーが確認");
  });

  it("文字でもお送りいただけるようお願いしている", () => {
    // お写真だけだと、オーナー様がご用件を測りかねる
    expect(nonTextAcknowledgement("お写真", OPEN)).toContain("文字でも");
  });

  it("営業時間外なら、翌営業日になることを伝える", () => {
    expect(nonTextAcknowledgement("スタンプ", false)).toContain("翌営業日");
    expect(nonTextAcknowledgement("スタンプ", OPEN)).not.toContain("翌営業日");
  });
});
