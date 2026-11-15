// Supabase への読み書き。サーバー側だけで動く。
// 秘密キーを使うため、クライアント側のコードから読み込んではいけない。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Category } from "./classify";

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

export async function getClosedNote(): Promise<string | null> {
  const { data, error } = await getDb()
    .from("sl_settings")
    .select("value")
    .eq("key", CLOSED_KEY)
    .maybeSingle();
  if (error) {
    console.error("getClosedNote failed:", error.message);
    return null;
  }
  const value = (data?.value ?? "").trim();
  return value === "" ? null : value;
}

export async function setClosedNote(note: string): Promise<void> {
  const { error } = await getDb()
    .from("sl_settings")
    .upsert({ key: CLOSED_KEY, value: note, updated_at: new Date().toISOString() });
  if (error) console.error("setClosedNote failed:", error.message);
}

export async function clearClosedNote(): Promise<void> {
  const { error } = await getDb().from("sl_settings").delete().eq("key", CLOSED_KEY);
  if (error) console.error("clearClosedNote failed:", error.message);
}
