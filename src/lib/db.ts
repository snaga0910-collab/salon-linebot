// Supabase への読み書き。サーバー側だけで動く。
// 秘密キーを使うため、クライアント側のコードから読み込んではいけない。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Category } from "./classify";
import { isActive, type Closure } from "./closed";
import { jstDateKey } from "./time";

export type Inquiry = {
  id: string;
  line_user_id: string;
  display_name: string | null;
  message_text: string;
  message_id: string | null;
  category: Category;
  received_at: string;
  handled_at: string | null;
};

let cached: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SECRET_KEY が設定されていません。.env.local を確認してください。",
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/** 問い合わせを「未対応」として記録する（要件定義書 F-10） */
export async function recordInquiry(input: {
  lineUserId: string;
  displayName: string | null;
  messageText: string;
  messageId: string | null;
  category: Category;
}): Promise<Inquiry | null> {
  const { data, error } = await getDb()
    .from("sl_inquiries")
    .insert({
      line_user_id: input.lineUserId,
      display_name: input.displayName,
      message_text: input.messageText,
      message_id: input.messageId,
      category: input.category,
    })
    .select()
    .single();

  if (error) {
    console.error("recordInquiry failed:", error.message);
    return null;
  }
  return data as Inquiry;
}

/**
 * 同じお客様の未対応が残っていれば、それを返す。
 *
 * 「土曜空いてますか」のあとに「14時でカットです」と続けて送られたとき、
 * 2件に分けてしまうとオーナー様の未対応が水増しされ、通知も2回飛ぶ。
 * ひとつのやり取りは、ひとつの未対応としてまとめる。
 */
export async function findOpenInquiryByUser(
  lineUserId: string,
  withinHours = 12,
): Promise<Inquiry | null> {
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await getDb()
    .from("sl_inquiries")
    .select("*")
    .eq("line_user_id", lineUserId)
    .is("handled_at", null)
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("findOpenInquiryByUser failed:", error.message);
    return null;
  }
  return (data?.[0] as Inquiry) ?? null;
}

/** 続きの連絡を、元の問い合わせに書き足す */
export async function appendToInquiry(id: string, text: string): Promise<void> {
  const { data, error: readError } = await getDb()
    .from("sl_inquiries")
    .select("message_text")
    .eq("id", id)
    .maybeSingle();

  if (readError || !data) {
    console.error("appendToInquiry read failed:", readError?.message);
    return;
  }

  const { error } = await getDb()
    .from("sl_inquiries")
    .update({ message_text: `${data.message_text}\n${text}` })
    .eq("id", id);
  if (error) console.error("appendToInquiry failed:", error.message);
}

/** 未対応を古い順に取り出す */
export async function listOpenInquiries(limit = 20): Promise<Inquiry[]> {
  const { data, error } = await getDb()
    .from("sl_inquiries")
    .select("*")
    .is("handled_at", null)
    .order("received_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("listOpenInquiries failed:", error.message);
    return [];
  }
  return (data ?? []) as Inquiry[];
}

export async function countOpenInquiries(): Promise<number> {
  const { count, error } = await getDb()
    .from("sl_inquiries")
    .select("id", { count: "exact", head: true })
    .is("handled_at", null);

  if (error) {
    console.error("countOpenInquiries failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** 「対応済み」ボタンが押されたとき。すでに済みなら false を返す */
export async function markHandled(id: string): Promise<boolean> {
  const { data, error } = await getDb()
    .from("sl_inquiries")
    .update({ handled_at: new Date().toISOString() })
    .eq("id", id)
    .is("handled_at", null)
    .select("id");

  if (error) {
    console.error("markHandled failed:", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

/**
 * 「すべて対応済みにする」ボタン（要件定義書 F-18）。
 *
 * before には、一覧をお送りした時刻が入る。
 * これより新しく届いた問い合わせは対象にしない。
 *
 * 朝8時の一覧を見たオーナー様が、9時に届いた問い合わせを知らないまま
 * 10時にボタンを押すことがある。そのとき9時の1件まで消してしまうと、
 * 「見ていない問い合わせが消える」という最悪の壊れ方になる。
 */
export async function markAllHandled(before?: string): Promise<number> {
  let q = getDb()
    .from("sl_inquiries")
    .update({ handled_at: new Date().toISOString() })
    .is("handled_at", null);

  if (before) q = q.lte("received_at", before);

  const { data, error } = await q.select("id");

  if (error) {
    console.error("markAllHandled failed:", error.message);
    return 0;
  }
  return (data ?? []).length;
}

/** お客様が送信を取り消したとき、記録そのものを消す（要件定義書 F-14） */
export async function deleteByMessageId(messageId: string): Promise<void> {
  const { error } = await getDb()
    .from("sl_inquiries")
    .delete()
    .eq("message_id", messageId);
  if (error) console.error("deleteByMessageId failed:", error.message);
}

/** 対応済みから30日たった記録を消す（要件定義書 N-08） */
export async function purgeOldInquiries(): Promise<void> {
  const limit = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await getDb()
    .from("sl_inquiries")
    .delete()
    .lt("handled_at", limit);
  if (error) console.error("purgeOldInquiries failed:", error.message);
}

// --- 設定値（臨時休業のお知らせ：要件定義書 F-08） ---

const CLOSED_KEY = "closed_note";

/**
 * 出ている臨時休業のお知らせ。
 *
 * **終わる日を過ぎていたら、その場で消して null を返す。**
 * オーナー様が取り消し操作をしなくても、翌日には自動で消える。
 * 消し忘れたまま誤案内が続く——という事故を、仕組みで起こせなくする。
 */
export async function getClosure(): Promise<Closure | null> {
  const { data, error } = await getDb()
    .from("sl_settings")
    .select("value")
    .eq("key", CLOSED_KEY)
    .maybeSingle();

  if (error) {
    console.error("getClosure failed:", error.message);
    return null;
  }

  const raw = (data?.value ?? "").trim();
  if (raw === "") return null;

  let closure: Closure;
  try {
    const parsed = JSON.parse(raw) as Partial<Closure>;
    if (!parsed.text || !parsed.until) throw new Error("形が違います");
    closure = { text: parsed.text, until: parsed.until };
  } catch {
    // 期限を持たせる前に設定されたお知らせ。今日かぎりとして扱う。
    //
    // ここで文面を読み直してはいけない。
    // 「明日は臨時休業です」を毎回読み直すと、
    // 期限がいつまでも明日に伸び続け、永久に消えなくなる。
    closure = { text: raw, until: jstDateKey() };
  }

  if (!isActive(closure)) {
    await clearClosure();
    return null;
  }
  return closure;
}

/** お客様に見せる文章だけが必要なとき */
export async function getClosedNote(): Promise<string | null> {
  return (await getClosure())?.text ?? null;
}

export async function setClosure(closure: Closure): Promise<void> {
  const { error } = await getDb().from("sl_settings").upsert({
    key: CLOSED_KEY,
    value: JSON.stringify(closure),
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("setClosure failed:", error.message);
}

export async function clearClosure(): Promise<void> {
  const { error } = await getDb().from("sl_settings").delete().eq("key", CLOSED_KEY);
  if (error) console.error("clearClosure failed:", error.message);
}
