-- ============================================================
-- 020_wallet_system.sql
-- ============================================================

-- Add new order statuses for the delivery driver workflow
alter type order_status add value if not exists 'dispatched_to_driver' after 'dispatched';
alter type order_status add value if not exists 'driver_arrived' after 'dispatched_to_driver';
alter type order_status add value if not exists 'delivered_pending_verification' after 'driver_arrived';

-- Add driver and money split columns to orders
alter table orders add column if not exists driver_id uuid references users(id) on delete set null;
alter table orders add column if not exists driver_lat numeric(10,8);
alter table orders add column if not exists driver_lng numeric(11,8);
alter table orders add column if not exists delivery_proof_url text;

-- Record the actual split amounts for online payments
alter table orders add column if not exists vendor_amount numeric(12,2) not null default 0;
alter table orders add column if not exists platform_commission numeric(12,2) not null default 0;
alter table orders add column if not exists driver_amount numeric(12,2) not null default 0;
alter table orders add column if not exists wallet_credited boolean not null default false;

-- Add wallet balances to vendors
alter table vendors add column if not exists wallet_pending   numeric(12,2) not null default 0;
alter table vendors add column if not exists wallet_available numeric(12,2) not null default 0;

-- Wallet transaction ledger to track every Riyal
create table if not exists wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  amount numeric(12,2) not null,
  currency text not null default 'QAR',
  type text not null, -- 'escrow_credit', 'escrow_release', 'withdrawal', 'refund'
  description text,
  created_at timestamptz not null default now()
);

-- Payout requests from vendors
create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  amount numeric(12,2) not null,
  currency text not null default 'QAR',
  status text not null default 'pending', -- 'pending', 'processing', 'paid', 'rejected'
  bank_name text,
  bank_account_name text,
  bank_iban text,
  reference text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
