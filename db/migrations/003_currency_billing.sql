-- ============================================================
-- Sokoni Hub — 003: QAR currency, settlement statements, receipts
-- Additive. Idempotent. Safe to re-run.
--
-- Three things:
--   1. Currency defaults move from USD to QAR, and existing rows are
--      relabelled (they were always QAR, only the label was wrong).
--   2. A settlement ledger, so what each vendor owes (or is owed) for a
--      period is computed rather than worked out by hand.
--   3. Receipt numbers on orders, so a buyer receipt is a stable document
--      rather than a re-render of whatever the order looks like today.
--
-- IMPORTANT on direction: with cash_on_delivery / whatsapp / bank_transfer
-- the VENDOR collects the buyer's money. The platform is therefore owed
-- commission BY the vendor — the opposite of a marketplace that holds funds.
-- The ledger tracks both directions so it still works when a payment
-- gateway is added and money starts arriving at the platform first.
-- ============================================================

-- ---------- 1. currency ----------
alter table listings alter column currency set default 'QAR';
alter table orders   alter column currency set default 'QAR';

-- Relabel historical rows. Every price ever entered was in Qatari riyal;
-- 'USD' was an unchanged column default, not a real currency. This is a
-- correction, not a conversion — no amounts are touched.
update listings set currency = 'QAR' where currency = 'USD';
update orders   set currency = 'QAR' where currency = 'USD';

-- ---------- 2. who is holding the money ----------
-- 'vendor'   : vendor took cash / bank transfer directly (today's reality)
-- 'platform' : funds arrived at the platform first (future, via a gateway)
do $$ begin
  create type funds_holder as enum ('vendor','platform');
exception when duplicate_object then null; end $$;

alter table orders add column if not exists funds_collected_by funds_holder not null default 'vendor';

-- ---------- 3. platform settings (singleton) ----------
create table if not exists platform_settings (
  id                 boolean primary key default true check (id),
  commission_rate    numeric(5,4) not null default 0 check (commission_rate >= 0 and commission_rate <= 1),
  currency           text not null default 'QAR',
  business_name      text not null default 'Sokoni Hub',
  business_address   text,
  business_email     text,
  business_phone     text,
  cr_number          text,                                  -- MOCI commercial registration
  tax_number         text,
  logo_url           text,
  invoice_prefix     text not null default 'INV',
  receipt_prefix     text not null default 'RCT',
  invoice_footer     text,
  updated_at         timestamptz not null default now()
);
insert into platform_settings (id) values (true) on conflict (id) do nothing;

-- ---------- 4. settlement statements ----------
do $$ begin
  create type statement_status as enum ('draft','issued','paid','void');
exception when duplicate_object then null; end $$;

create table if not exists vendor_statements (
  id                    uuid primary key default gen_random_uuid(),
  number                text unique,                        -- assigned on issue, not on draft
  vendor_id             uuid not null references vendors(id) on delete cascade,
  period_start          date not null,
  period_end            date not null,
  currency              text not null default 'QAR',

  order_count           int not null default 0,
  goods_subtotal        numeric(12,2) not null default 0,   -- sum of order subtotals
  delivery_total        numeric(12,2) not null default 0,   -- sum of delivery fees (vendor's own money)
  gross_sales           numeric(12,2) not null default 0,   -- goods_subtotal + delivery_total

  commission_rate       numeric(5,4) not null default 0,    -- snapshot; changing the setting never rewrites history
  commission_base       numeric(12,2) not null default 0,   -- what commission was charged on
  commission_amount     numeric(12,2) not null default 0,

  collected_by_vendor   numeric(12,2) not null default 0,
  collected_by_platform numeric(12,2) not null default 0,

  net_due_to_platform   numeric(12,2) not null default 0,   -- vendor pays platform
  net_due_to_vendor     numeric(12,2) not null default 0,   -- platform pays vendor

  status                statement_status not null default 'draft',
  issued_at             timestamptz,
  paid_at               timestamptz,
  payment_reference     text,
  notes                 text,
  created_by            uuid references users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  check (period_end >= period_start),
  -- exactly one direction can be non-zero
  check (net_due_to_platform = 0 or net_due_to_vendor = 0)
);
create index if not exists vendor_statements_vendor_idx on vendor_statements(vendor_id, period_start desc);
create index if not exists vendor_statements_status_idx on vendor_statements(status);

-- One live statement per vendor per period. Voided ones are excluded so a
-- mistake can be voided and the period regenerated.
create unique index if not exists vendor_statements_period_uidx
  on vendor_statements(vendor_id, period_start, period_end)
  where status <> 'void';

-- ---------- 5. which orders a statement covers ----------
-- unique(order_id) is the anti-double-billing guarantee: an order can belong
-- to at most one statement. Voiding a statement deletes its links, freeing
-- the orders to be settled again.
create table if not exists statement_orders (
  statement_id      uuid not null references vendor_statements(id) on delete cascade,
  order_id          uuid not null references orders(id) on delete cascade,
  gross             numeric(12,2) not null default 0,
  commission_amount numeric(12,2) not null default 0,
  primary key (statement_id, order_id),
  unique (order_id)
);

-- ---------- 6. receipts ----------
-- A receipt number is issued once, on first request, and never changes.
alter table orders add column if not exists receipt_number    text;
alter table orders add column if not exists receipt_issued_at timestamptz;
create unique index if not exists orders_receipt_uidx on orders(receipt_number) where receipt_number is not null;

-- ---------- 7. document number sequences ----------
-- Gapless-enough per-year counters for invoices and receipts.
create table if not exists document_counters (
  kind  text not null,          -- 'invoice' | 'receipt'
  year  int  not null,
  seq   int  not null default 0,
  primary key (kind, year)
);

-- Atomically allocate the next number for a document kind.
create or replace function next_document_number(p_kind text, p_prefix text)
returns text language plpgsql as $$
declare
  y int := extract(year from now())::int;
  n int;
begin
  insert into document_counters (kind, year, seq) values (p_kind, y, 1)
    on conflict (kind, year) do update set seq = document_counters.seq + 1
    returning seq into n;
  return p_prefix || '-' || y || '-' || lpad(n::text, 4, '0');
end $$;
