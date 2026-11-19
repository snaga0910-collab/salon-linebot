// 毎朝のまとめ通知（要件定義書 F-11）。
//
// Vercel の無料プランは定時実行が1日1回までなので、ここが唯一の自動リマインドになる。
// 開店10時に必ず間に合うよう、8時台に動かす（実行時刻には±59分の誤差があるため）。
//
// 伝えることが何もない日は送らない。無駄なメッセージ通数を使わないため。
// なお、1回の送信に複数のメッセージを入れても通数は1通のまま
// （通数は「送った相手の人数」で数えるため）。

import { NextResponse } from "next/server";
import { getClosedNote, listOpenInquiries, purgeOldInquiries } from "@/lib/db";
import { closedReminder, openListMessage, ownerUserId, push } from "@/lib/line";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 対応済みから30日たった記録を消す（N-08）
  await purgeOldInquiries();

  const [open, closedNote] = await Promise.all([
    listOpenInquiries(),
    getClosedNote(),
  ]);

  if (open.length === 0 && !closedNote) {
    return NextResponse.json({ ok: true, sent: false, open: 0 });
  }

  const messages = [];
  if (open.length > 0) {
    messages.push(openListMessage(open, "おはようございます。"));
  }
  // 臨時休業の取り消し忘れを防ぐ（要件定義書 第13章のリスク）
  if (closedNote) {
    messages.push(closedReminder(closedNote));
  }

  await push(ownerUserId(), messages);

  return NextResponse.json({
    ok: true,
    sent: true,
    open: open.length,
    closedNote: Boolean(closedNote),
  });
}
