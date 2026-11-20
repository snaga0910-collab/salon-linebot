// 毎朝のまとめ通知（要件定義書 F-11）。
//
// Vercel の無料プランは定時実行が1日1回までなので、ここが唯一の自動リマインドになる。
// 開店10時に必ず間に合うよう、8時台に動かす（実行時刻には±59分の誤差があるため）。
//
// 伝えることが何もない日は送らない。無駄なメッセージ通数を使わないため。
// なお、1回の送信に複数のメッセージを入れても通数は1通のまま
// （通数は「送った相手の人数」で数えるため）。

import { NextResponse } from "next/server";
import { getClosure, listOpenInquiries, purgeOldInquiries } from "@/lib/db";
import { closedReminder, openListMessage, ownerUserId, push } from "@/lib/line";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 対応済みから30日たった記録を消す（N-08）
  await purgeOldInquiries();

  // getClosure は、終わった日のお知らせをここで自動的に消す
  const [open, closure] = await Promise.all([listOpenInquiries(), getClosure()]);

  if (open.length === 0 && !closure) {
    return NextResponse.json({ ok: true, sent: false, open: 0 });
  }

  const messages = [];
  if (open.length > 0) {
    messages.push(openListMessage(open, "おはようございます。"));
  }
  // いま何が出ているかをお伝えする（要件定義書 F-19）。
  // 取り消しは任意。期限が来れば自動で消える。
  if (closure) {
    messages.push(closedReminder(closure));
  }

  await push(ownerUserId(), messages);

  return NextResponse.json({
    ok: true,
    sent: true,
    open: open.length,
    closedUntil: closure?.until ?? null,
  });
}
