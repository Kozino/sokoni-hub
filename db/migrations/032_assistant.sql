-- Sokoni Assistant (consumer chat + voice) and better catalogue search.
-- Additive. Safe to run more than once. Requires nothing from later migrations.

-- Fuzzy title/store matching so "mchele" / misspellings still find rice, etc.
create extension if not exists pg_trgm;

create index if not exists listings_title_trgm on listings using gin (title gin_trgm_ops);
create index if not exists listings_description_trgm on listings using gin (description gin_trgm_ops);

-- Channel: an order the buyer assembled with Sokoni Assistant (still confirmed in Checkout).
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'orders_source_check') then
    alter table orders drop constraint orders_source_check;
  end if;
  alter table orders
    add constraint orders_source_check
    check (source in ('marketplace', 'vendor-share', 'qr', 'ai-assistant'));
end $$;

insert into system_settings (key, value) values (
  'assistant',
  '{"enabled": true, "retention_days": 90, "voice_enabled": true}'::jsonb
) on conflict (key) do nothing;

-- One conversation per signed-in buyer or hashed guest device. user_id is
-- anonymised on account deletion (the completion job deletes these rows).
create table if not exists assistant_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  guest_key text,
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint assistant_threads_owner check (user_id is not null or guest_key is not null)
);
create index if not exists assistant_threads_user_idx on assistant_threads (user_id, last_message_at desc);
create index if not exists assistant_threads_guest_idx on assistant_threads (guest_key, last_message_at desc);

create table if not exists assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references assistant_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  locale text,
  cards jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists assistant_messages_thread_idx on assistant_messages (thread_id, created_at);

-- Tool audit. Listing ids only — not prompts, not phone numbers, not audio.
create table if not exists assistant_turns (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references assistant_threads(id) on delete cascade,
  message_id uuid references assistant_messages(id) on delete set null,
  user_id uuid,
  guest_key text,
  model text,
  tools_called jsonb not null default '[]'::jsonb,
  listing_ids uuid[] not null default '{}',
  proposed_checkout boolean not null default false,
  duration_ms int,
  created_at timestamptz not null default now()
);
create index if not exists assistant_turns_thread_idx on assistant_turns (thread_id, created_at desc);

revoke all on assistant_threads, assistant_messages, assistant_turns from public;
do $$ declare r text; begin
  foreach r in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=r) then
      execute format('revoke all on assistant_threads, assistant_messages, assistant_turns from %I', r);
    end if;
  end loop;
end $$;
