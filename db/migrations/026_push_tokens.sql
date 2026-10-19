-- ============================================================
-- 026_push_tokens.sql
-- Expo push tokens for buyers, vendors and riders, so the apps
-- can alert them about new orders, rider assignment and receipts.
-- ============================================================

create table if not exists push_tokens (
  token        text primary key,
  user_id      uuid not null references users(id) on delete cascade,
  platform     text not null default 'unknown',
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on push_tokens(user_id);
