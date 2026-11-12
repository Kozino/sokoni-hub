-- 031_offers.sql
--
-- Platform-funded offers: coupon codes, automatic discounts, free or reduced delivery.
--
-- Everything here is ADDITIVE. No existing column changes meaning, no existing row changes,
-- and nothing is live until an admin creates an offer and switches it on.
--
-- ---------------------------------------------------------------------------
-- Decisions worth stating, because they are what keep vendors and riders whole.
-- ---------------------------------------------------------------------------
--
-- 1. SUBTOTAL AND DELIVERY_FEE KEEP THEIR MEANING.
--    orders.subtotal is the goods value the vendor is owed. orders.delivery_fee is the
--    rider's pay. A discount never reduces either of them. It is recorded beside them in
--    orders.discount (goods) and orders.delivery_discount (delivery), and
--
--        total = subtotal + delivery_fee - discount - delivery_discount
--
--    is what the buyer actually pays in cash, which is what the rider collects. Vendor
--    wallet credit is computed from subtotal and rider pay from delivery_fee, so both are
--    unchanged and Sokoni Hub absorbs the discount: it collected less cash than it pays out.
--
-- 2. EVERYTHING IS DERIVED WHEN READ, NOTHING BY A JOB.
--    Whether an offer is live, expired or used up is worked out from now() and the
--    redemption rows on every request. Cancelled orders do not count, so a cancelled order
--    frees its use and its budget with no clean-up task (the same lesson as 008_promotions).
--
-- 3. THE PLATFORM'S SPEND IS CAPPED.
--    budget_total stops an offer when the money it has funded reaches the cap, usage_limit
--    caps how many checkouts may use it, per_customer_limit caps each customer, and
--    max_discount caps a single order. A customer always pays at least one QAR per order
--    (enforced in code) so a rider always has cash to collect.
--
-- 4. THE ORDER KEEPS A SNAPSHOT.
--    orders.offers_applied stores what was applied (code, title, amounts) so an old order
--    still explains itself after the offer is edited or paused.

do $$ begin
  create type offer_kind as enum (
    'percent_off',          -- % off the goods
    'amount_off',           -- fixed QAR off the goods
    'free_delivery',        -- the whole delivery fee is waived
    'delivery_percent_off', -- % off the delivery fee
    'delivery_amount_off'   -- fixed QAR off the delivery fee
  );
exception when duplicate_object then null; end $$;

create table if not exists offers (
  id                 uuid primary key default gen_random_uuid(),

  -- NULL code = applies automatically. A code = the buyer must enter it.
  code               text,
  title              text not null,
  description        text,
  kind               offer_kind not null,
  -- Percent (1-100) or QAR amount. Ignored by free_delivery.
  value              numeric(12,2) not null default 0,
  -- Largest saving one checkout can get from this offer (QAR). NULL = no cap.
  max_discount       numeric(12,2),
  -- Minimum spend on the items the offer applies to (QAR).
  min_subtotal       numeric(12,2) not null default 0,

  scope              text not null default 'all' check (scope in ('all', 'vendor', 'category')),
  vendor_id          uuid references vendors(id) on delete cascade,
  category_id        uuid references categories(id) on delete cascade,
  -- Which orders qualify: any, only deliveries, or only store collections.
  fulfilment         text not null default 'any' check (fulfilment in ('any', 'delivery', 'pickup')),
  first_order_only   boolean not null default false,

  usage_limit        int,            -- total checkouts that may use it
  per_customer_limit int,            -- per account / phone number
  budget_total       numeric(12,2),  -- most Sokoni Hub will fund through this offer (QAR)

  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  -- Created OFF. An admin switches it on; activated_at records that it was ever on, which is
  -- what separates "draft" from "paused".
  is_active          boolean not null default false,
  activated_at       timestamptz,

  -- Listed in the app's Offers rail. A code with this off is a private code.
  show_in_app        boolean not null default true,
  badge              text,
  accent             text not null default 'green' check (accent in ('green', 'orange', 'violet', 'sky', 'rose', 'amber')),
  priority           int not null default 0,
  currency           text not null default 'QAR',

  created_by         uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint offer_window_valid check (ends_at > starts_at),
  constraint offer_value_valid check (
       (kind in ('percent_off', 'delivery_percent_off') and value > 0 and value <= 100)
    or (kind in ('amount_off', 'delivery_amount_off') and value > 0)
    or (kind = 'free_delivery')
  ),
  constraint offer_scope_valid check (
       (scope = 'all' and vendor_id is null and category_id is null)
    or (scope = 'vendor' and vendor_id is not null and category_id is null)
    or (scope = 'category' and category_id is not null and vendor_id is null)
  ),
  constraint offer_limits_valid check (
       (usage_limit is null or usage_limit > 0)
   and (per_customer_limit is null or per_customer_limit > 0)
   and (budget_total is null or budget_total > 0)
   and (max_discount is null or max_discount > 0)
   and min_subtotal >= 0
  ),
  -- A delivery offer for store collections would never find a fee to reduce.
  constraint offer_delivery_fulfilment check (
    not (kind in ('free_delivery', 'delivery_percent_off', 'delivery_amount_off') and fulfilment = 'pickup')
  )
);

-- One code, one offer, whatever the capitalisation.
create unique index if not exists offers_code_unique on offers (upper(code)) where code is not null;
create index if not exists offers_live_idx on offers (ends_at, starts_at) where is_active;

drop trigger if exists offers_touch on offers;
create trigger offers_touch before update on offers
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Redemptions: one row per offer per order. The ledger behind every limit and report.
-- ---------------------------------------------------------------------------
create table if not exists offer_redemptions (
  id                uuid primary key default gen_random_uuid(),
  -- RESTRICT: an offer that has been used is never deleted, only paused.
  offer_id          uuid not null references offers(id) on delete restrict,
  order_id          uuid not null references orders(id) on delete cascade,
  -- Orders created by one checkout share a key, so a two-seller cart uses an offer once.
  checkout_key      text not null,
  user_id           uuid references users(id) on delete set null,
  -- Digits of the checkout phone (Qatar numbers normalised to 974...), so a guest is limited too.
  phone_key         text not null default '',
  goods_discount    numeric(12,2) not null default 0,
  delivery_discount numeric(12,2) not null default 0,
  created_at        timestamptz not null default now(),
  constraint offer_redemption_amounts check (goods_discount >= 0 and delivery_discount >= 0),
  unique (offer_id, order_id)
);
create index if not exists offer_redemptions_offer_idx    on offer_redemptions (offer_id);
create index if not exists offer_redemptions_order_idx    on offer_redemptions (order_id);
create index if not exists offer_redemptions_user_idx     on offer_redemptions (user_id) where user_id is not null;
create index if not exists offer_redemptions_phone_idx    on offer_redemptions (phone_key) where phone_key <> '';

-- ---------------------------------------------------------------------------
-- Orders: the discount sits beside subtotal and delivery_fee, never inside them.
-- ---------------------------------------------------------------------------
alter table orders add column if not exists discount          numeric(12,2) not null default 0;
alter table orders add column if not exists delivery_discount numeric(12,2) not null default 0;
alter table orders add column if not exists promo_code        text;
alter table orders add column if not exists offers_applied    jsonb not null default '[]'::jsonb;

alter table orders drop constraint if exists orders_discount_valid;
alter table orders add constraint orders_discount_valid
  check (discount >= 0 and delivery_discount >= 0 and discount <= subtotal and delivery_discount <= delivery_fee);

-- The existing rule was total = subtotal + delivery_fee. With both discounts at zero (every
-- order that exists today) the new rule is the same equation.
alter table orders drop constraint if exists orders_total_matches;
alter table orders add constraint orders_total_matches
  check (total = subtotal + delivery_fee - discount - delivery_discount);

-- ---------------------------------------------------------------------------
-- Push: devices of people who are not signed in, and a log of campaigns sent.
-- ---------------------------------------------------------------------------
-- push_tokens requires an account, so a guest's phone cannot be stored there. Offer
-- campaigns can reach these devices; order alerts to vendors and riders never use this table.
create table if not exists guest_push_devices (
  token        text primary key,
  platform     text not null default 'unknown',
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists offer_pushes (
  id         uuid primary key default gen_random_uuid(),
  offer_id   uuid references offers(id) on delete set null,
  title      text not null,
  body       text not null,
  link       text,
  audience   text not null check (audience in ('all', 'buyers', 'guests')),
  recipients int not null default 0,
  sent_by    uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists offer_pushes_created_idx on offer_pushes (created_at desc);
