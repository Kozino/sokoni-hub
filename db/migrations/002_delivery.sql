-- ============================================================
-- Sokoni Hub — 002: Vendor-managed delivery + vendor location
-- Additive. Idempotent. Safe to re-run.
--
-- Model: vendors deliver their own orders and set their own fee.
-- No third-party courier integration.
-- ============================================================

-- ---------- cleanup of the earlier courier draft ----------
-- These were part of a superseded third-party-courier design and were never
-- deployed. Dropping them keeps the schema honest. No-ops if absent.
drop table if exists delivery_events cascade;
drop table if exists deliveries cascade;
drop table if exists delivery_providers cascade;
drop table if exists vendor_delivery_zones cascade;
do $$ begin drop type delivery_status; exception when undefined_object then null; end $$;

-- ---------- enums ----------
do $$ begin
  create type fulfilment_mode as enum ('pickup','delivery');
exception when duplicate_object then null; end $$;

-- ---------- vendor location (for "near me") ----------
-- Nullable: a vendor without coordinates simply never ranks by distance and
-- falls back to city matching. Nothing breaks.
alter table vendors add column if not exists lat numeric(9,6);
alter table vendors add column if not exists lng numeric(9,6);

-- Only index rows that actually have coordinates.
create index if not exists vendors_geo_idx on vendors (lat, lng)
  where lat is not null and lng is not null;

-- ---------- per-vendor delivery settings ----------
-- The vendor owns the fee. The platform never sets or overrides it.
create table if not exists vendor_delivery_settings (
  vendor_id           uuid primary key references vendors(id) on delete cascade,
  offers_pickup       boolean not null default true,
  offers_delivery     boolean not null default false,
  delivery_fee        numeric(12,2) not null default 0 check (delivery_fee >= 0),
  free_delivery_over  numeric(12,2) check (free_delivery_over is null or free_delivery_over >= 0),
  delivery_radius_km  numeric(6,2) check (delivery_radius_km is null or delivery_radius_km > 0),
  pickup_address      text,
  delivery_notes      text,
  updated_at          timestamptz not null default now()
);

-- Backfill a row for every existing vendor so joins never miss.
insert into vendor_delivery_settings (vendor_id)
  select id from vendors on conflict (vendor_id) do nothing;

-- ---------- order fulfilment ----------
-- orders.delivery_fee and orders.total already exist. Before this migration
-- the checkout route wrote subtotal into BOTH subtotal and total, so
-- delivery_fee was always 0 and the buyer was never charged for delivery.
alter table orders add column if not exists fulfilment_mode fulfilment_mode not null default 'delivery';

-- Integrity: total must always equal subtotal + delivery_fee. This is the
-- guard that makes the checkout bug impossible to reintroduce silently.
do $$ begin
  alter table orders add constraint orders_total_matches
    check (total = subtotal + delivery_fee);
exception when duplicate_object then null; end $$;

-- ---------- notes ----------
-- 1. Services are never delivered. Gate on listings.kind = 'product'.
-- 2. Pickup orders must carry delivery_fee = 0.
-- 3. Fees are recomputed server-side at checkout; a client-supplied fee is
--    never trusted.
