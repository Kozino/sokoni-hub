-- 006_inventory.sql
--
-- Inventory management for product vendors.
--
-- Stock already existed as a single mutable number on the listing, decremented
-- at checkout. That is enough to prevent overselling and nothing else. It cannot
-- answer the two questions a vendor actually asks:
--
--   "what do I need to reorder, and how urgently?"
--   "why does this say 12 when I counted 15?"
--
-- Three things are added.
--
-- 1. A threshold that means something. "Low" was hardcoded to 5 everywhere, so a
--    vendor selling sachets by the hundred got warned far too late and a vendor
--    selling bespoke pieces got warned constantly. The trigger point is now a
--    vendor-wide default with an optional per-listing override, because the
--    right number is a property of the product, not of the platform.
--
-- 2. A movement ledger. Every change to quantity writes a row saying how much,
--    why, and who did it. The balance after each movement is stored rather than
--    recomputed, so a correction made later cannot silently rewrite history.
--
-- 3. Reorder context on the listing: how many to buy back up to, and an optional
--    supplier note, so the restock view can tell the vendor what to actually do
--    rather than only that something is wrong.
--
-- Services are untouched throughout. A haircut has no stock, and every query
-- here is filtered to kind = 'product'.

-- ---------------------------------------------------------------------------
-- thresholds
-- ---------------------------------------------------------------------------

alter table vendors
  add column if not exists low_stock_threshold int not null default 5
    check (low_stock_threshold >= 0);

comment on column vendors.low_stock_threshold is
  'Default units-remaining at or below which this vendor considers a product low. Per-listing override wins.';

alter table listings
  add column if not exists low_stock_threshold int
    check (low_stock_threshold is null or low_stock_threshold >= 0);

comment on column listings.low_stock_threshold is
  'Overrides the vendor default for this product. NULL means inherit.';

-- How many units to bring the product back up to when restocking. Advisory
-- only; nothing auto-orders.
alter table listings
  add column if not exists reorder_to int
    check (reorder_to is null or reorder_to > 0);

alter table listings
  add column if not exists supplier_note text;

-- ---------------------------------------------------------------------------
-- movement ledger
-- ---------------------------------------------------------------------------

do $$ begin
  create type stock_reason as enum (
    'sale',        -- decremented by checkout
    'restock',     -- vendor received new stock
    'adjustment',  -- vendor corrected the number after a count
    'return',      -- customer returned an item
    'damage',      -- written off
    'initial'      -- opening balance when the product was created
  );
exception when duplicate_object then null; end $$;

create table if not exists stock_movements (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references listings(id) on delete cascade,
  vendor_id      uuid not null references vendors(id) on delete cascade,
  -- Signed: -3 sold, +50 received. Never zero; a movement that changes nothing
  -- is not a movement.
  delta          int not null check (delta <> 0),
  -- Stock on hand immediately after this movement. Stored, not derived: the
  -- ledger must still read correctly even after a later correction, and
  -- recomputing a running total over a paginated view is needlessly expensive.
  balance_after  int not null check (balance_after >= 0),
  reason         stock_reason not null,
  note           text,
  -- Set for 'sale' so a vendor can trace a decrement back to the order.
  order_id       uuid references orders(id) on delete set null,
  -- Null when the platform moved the stock rather than a person (checkout).
  actor_id       uuid references users(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- The restock view reads one vendor's recent movements, and the per-product
-- drawer reads one listing's, newest first in both cases.
create index if not exists stock_movements_vendor_idx  on stock_movements(vendor_id, created_at desc);
create index if not exists stock_movements_listing_idx on stock_movements(listing_id, created_at desc);

-- ---------------------------------------------------------------------------
-- the low-stock predicate, defined once
-- ---------------------------------------------------------------------------
--
-- This rule was previously duplicated in the dashboard SQL, the overview stat
-- card and the listings table cell, which is how they drifted. A view keeps it
-- in one place and gives the API something to select from directly.
--
-- Products with quantity IS NULL are treated as untracked, not as zero. A vendor
-- who never set a quantity is not out of stock, they are simply not counting,
-- and nagging them about it would train them to ignore the alert.

create or replace view vendor_inventory as
select
  l.id,
  l.vendor_id,
  l.title,
  l.slug,
  l.status,
  l.quantity,
  l.unit,
  l.price,
  l.currency,
  l.images,
  l.reorder_to,
  l.supplier_note,
  l.low_stock_threshold                                  as threshold_override,
  coalesce(l.low_stock_threshold, v.low_stock_threshold) as threshold,
  case
    when l.quantity is null                                              then 'untracked'
    when l.quantity = 0                                                  then 'out'
    when l.quantity <= coalesce(l.low_stock_threshold, v.low_stock_threshold) then 'low'
    else 'ok'
  end as stock_state,
  -- Units to buy to reach reorder_to. Null when no target is set.
  case
    when l.reorder_to is not null and l.quantity is not null and l.reorder_to > l.quantity
      then l.reorder_to - l.quantity
  end as reorder_qty,
  (select max(sm.created_at) from stock_movements sm
    where sm.listing_id = l.id and sm.reason <> 'sale')  as last_counted_at,
  -- Units sold in the last 30 days, so the view can rank by what is actually
  -- moving instead of alphabetically.
  coalesce((
    select -sum(sm.delta) from stock_movements sm
     where sm.listing_id = l.id
       and sm.reason = 'sale'
       and sm.created_at > now() - interval '30 days'
  ), 0) as sold_30d
from listings l
join vendors v on v.id = l.vendor_id
where l.kind = 'product'
  and l.status <> 'removed';

-- ---------------------------------------------------------------------------
-- backfill
-- ---------------------------------------------------------------------------
--
-- Existing products get an opening-balance movement so the ledger is not empty
-- on day one and every current number has a stated origin. Only for products
-- that actually track stock, and only once.

insert into stock_movements (listing_id, vendor_id, delta, balance_after, reason, note)
select l.id, l.vendor_id, l.quantity, l.quantity, 'initial',
       'Opening balance recorded when inventory tracking was introduced'
from listings l
where l.kind = 'product'
  and l.quantity is not null
  and l.quantity > 0
  and l.status <> 'removed'
  and not exists (select 1 from stock_movements sm where sm.listing_id = l.id);
