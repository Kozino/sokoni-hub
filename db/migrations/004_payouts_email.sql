-- ============================================================
-- Sokoni Hub — 004: payout details, email log
-- Additive. Idempotent. Safe to re-run. Requires 003.
--
-- Money still cannot move by itself — there is no payment rail. What this
-- adds is everything around the transfer: where to send it, a bulk export
-- for the bank, and a record of every document emailed.
-- ============================================================

-- ---------- vendor bank details ----------
-- Needed to pay a vendor anything, and to produce a bank bulk-transfer file.
-- All nullable: a vendor who is only ever charged commission never fills these in.
alter table vendors add column if not exists bank_name         text;
alter table vendors add column if not exists bank_account_name text;
alter table vendors add column if not exists bank_iban         text;
alter table vendors add column if not exists payout_notes      text;

-- ---------- email log ----------
-- Every send attempt, successful or not. Without this, "did the vendor get
-- their statement?" is unanswerable.
do $$ begin
  create type email_status as enum ('sent','failed','skipped');
exception when duplicate_object then null; end $$;

create table if not exists email_log (
  id          uuid primary key default gen_random_uuid(),
  to_address  text not null,
  subject     text not null,
  kind        text not null,                 -- 'statement' | 'receipt' | other
  entity_id   uuid,                          -- statement or order id
  status      email_status not null,
  provider    text,
  provider_id text,
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists email_log_entity_idx  on email_log(entity_id, created_at desc);
create index if not exists email_log_created_idx on email_log(created_at desc);

-- ---------- statement email tracking ----------
alter table vendor_statements add column if not exists emailed_at timestamptz;

-- ---------- payout batches ----------
-- Groups statements settled together in one bank run, so a single transfer
-- covering six vendors is still traceable to each statement.
create table if not exists payout_batches (
  id          uuid primary key default gen_random_uuid(),
  reference   text not null,
  note        text,
  total       numeric(12,2) not null default 0,
  currency    text not null default 'QAR',
  count       int not null default 0,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now()
);

alter table vendor_statements add column if not exists payout_batch_id uuid references payout_batches(id) on delete set null;
create index if not exists vendor_statements_batch_idx on vendor_statements(payout_batch_id);
