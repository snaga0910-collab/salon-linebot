-- （テスト）サロンmina：テーブル作成
-- Supabase の「SQL Editor」に貼り付けて実行してください。
-- ※これまでのアプリと同じプロジェクトに同居させるため、名前を sl_ で始めています。

-- 問い合わせの記録。未対応を追いかけるために使う（F-10）。
-- 保存するのは必要最小限だけ。電話番号・メール・住所・施術履歴は持たない（N-04）。
create table if not exists public.sl_inquiries (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,                 -- お客様のLINE識別子
  display_name text,                          -- お客様のLINE表示名（本名とは限らない）
  message_text text not null,                 -- 問い合わせの本文
  message_id text,                            -- 送信取消への対応に使う（F-14）
  category text not null,                     -- availability / change / other / complaint
  received_at timestamptz not null default now(),
  handled_at timestamptz                      -- null のあいだは「未対応」
);

-- 未対応を古い順に取り出すため
create index if not exists sl_inquiries_open_idx
  on public.sl_inquiries (handled_at, received_at);

-- 送信取消のときに元の1件を探すため
create index if not exists sl_inquiries_message_idx
  on public.sl_inquiries (message_id);

-- 臨時休業などの設定値（F-08）。key と value の2列だけの簡単な表。
create table if not exists public.sl_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- 行レベルセキュリティを有効にする。
-- ポリシーを作らないため、公開キーからは一切読み書きできない。
-- アプリはサーバー側から秘密キーで読み書きする。
alter table public.sl_inquiries enable row level security;
alter table public.sl_settings  enable row level security;
