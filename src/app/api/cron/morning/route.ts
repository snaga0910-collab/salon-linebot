// 毎朝のまとめ通知（要件定義書 F-11）。
//
// Vercel の無料プランは定時実行が1日1回までなので、ここが唯一の自動リマインドになる。
// 開店10時に必ず間に合うよう、8時台に動かす（実行時刻には±59分の誤差があるため）。
//
// 未対応が0件の日は送らない。無駄なメッセージ通数を使わないため。

import { NextResponse } from "next/server";
import { listOpenInquiries, purgeOldInquiries } from "@/lib/db";
import { openListMessage, ownerUserId, push } from "@/lib/line";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 対応済みから30日たった記録を消す（N-08）
  await purgeOldInquiries();

  const open = await listOpenInquiries();
  if (open.length === 0) {
    return NextResponse.json({ ok: true, sent: false, open: 0 });
  }

  await push(ownerUserId(), [
    openListMessage(open, "おはようございます。"),
  ]);

  return NextResponse.json({ ok: true, sent: true, open: open.length });
}
