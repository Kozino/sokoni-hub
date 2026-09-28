-- 008_promotions.sql
--
-- Paid placement: VIP and Featured stores on the landing page.
--
-- A vendor pays for a time-bounded slot. Admin grants it, can revoke it early,
-- and it stops on its own when the paid period ends.
--
-- ---------------------------------------------------------------------------
-- Four decisions worth stating, because they are what separate this from a
-- boolean column on vendors.
-- ---------------------------------------------------------------------------
--
-- 1. EXPIRY IS EVALUATED WHEN THE ROW IS READ, NEVER BY A JOB.
--    There is a cron endpoint in this codebase that has never once run in
--    production, because CRON_SECRET is unset. If liveness were a stored flag
--    flipped by a scheduled task, every expired vendor would keep their paid
--    placement indefinitely and nobody would notice — the failure is silent and
--    it is revenue the platform is giving away. `is_live` is therefore derived
--    from now() on every read. A promotion cannot outlive the money.
--
-- 2. IT IS A LEDGER OF PURCHASES, NOT A STATE FLAG.
--    Renewals, history, and "what did we earn from placement last quarter" all
--    need the rows kept. Revoking sets revoked_at; it does not delete.
--
-- 3. SLOTS ARE FINITE AND OVERSUBSCRIPTION ROTATES.
--    Unlimited "featured" is worth nothing to the vendor and the platform
--    cannot honestly sell it twice. The number of visible slots is a setting.
--    When more promotions are live than there are slots, placement rotates on a
--    time bucket so every paying vendor accumulates impressions instead of the
--    same few winning forever on alphabetical or insertion order.
--
-- 4. PAID PLACEMENT IS ALWAYS LABELLED.
--    Presenting paid position as organic ranking is a consumer-protection
--    problem, not a design preference. The tier is returned with every promoted
--    vendor precisely so the UI cannot render one without a badge.

-- ---------------------------------------------------------------------------
-- tiers
-- ---------------------------------------------------------------------------

do $$ begin
  -- 'vip' outranks 'featured'. Two tiers is enough to price a premium without
  -- turning the landing page into a leaderboard.
  create type promotion_tier as enum ('featured', 'vip');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- placements
-- ---------------------------------------------------------------------------

create table if not exists vendor_promotions (
  id             uuid primary key default gen_random_uuid(),
  vendor_id      uuid not null references vendors(id) on delete cascade,
  tier           promotion_tier not null default 'featured',

  -- The paid window. Half-open [starts_at, ends_at): a promotion sold "to the
  -- 31st" ends at midnight on the 1st, so two consecutive months never both
  -- count as live for the same instant.
  starts_at      timestamptz not null default now(),
  ends_at        timestamptz not null,

  -- What was agreed and whether it has been settled. Placement is a flat fee,
  -- deliberately NOT routed through vendor_statements: statements are periodic
  -- commission on sales, and folding an unrelated one-off charge into them
  -- would make both harder to read and to dispute.
  price_amount   numeric(12,2) not null default 0 check (price_amount >= 0),
  currency       text not null default 'QAR',
  paid_at        timestamptz,
  payment_reference text,

  -- Early termination. Kept alongside the row rather than deleting it, so a
  -- refund conversation has something to point at.
  revoked_at     timestamptz,
  revoked_by     uuid references users(id),
  revoke_reason  text,

  -- Denormalised counters. One row per impression would be the "correct"
  -- model and would also be the largest table in the database within a month,
  -- for data nobody queries at that grain.
  impressions    bigint not null default 0,
  clicks         bigint not null default 0,

  note           text,
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint promotion_window_valid check (ends_at > starts_at)
);

drop trigger if exists vendor_promotions_touch on vendor_promotions;
create trigger vendor_promotions_touch before update on vendor_promotions
  for each row execute function touch_updated_at();

-- The hot path is "which promotions are live right now", so the index leads
-- with the window. Partial on not-revoked: revoked rows are history and are
-- never read by the public endpoint.
create index if not exists vendor_promotions_live_idx
  on vendor_promotions (ends_at, starts_at)
  where revoked_at is null;

create index if not exists vendor_promotions_vendor_idx
  on vendor_promotions (vendor_id, starts_at desc);

-- ---------------------------------------------------------------------------
-- how many slots each tier shows
-- ---------------------------------------------------------------------------

alter table platform_settings
  add column if not exists vip_slots int not null default 4
    check (vip_slots >= 0),
  add column if not exists featured_slots int not null default 8
    check (featured_slots >= 0),
  -- Minutes before the placement order reshuffles when oversubscribed. Long
  -- enough that a buyer refreshing the page does not see it flicker, short
  -- enough that every paying vendor gets daylight.
  add column if not exists promotion_rotation_minutes int not null default 15
    check (promotion_rotation_minutes between 1 and 1440);

comment on column platform_settings.vip_slots is
  'VIP stores shown on the landing page. Live promotions beyond this rotate.';

-- ---------------------------------------------------------------------------
-- the one definition of "promoted right now"
-- ---------------------------------------------------------------------------
--
-- Every consumer reads this view. Duplicating the predicate is how a vendor
-- ends up still featured on the landing page after their money ran out, or
-- badged on their store page but absent from the carousel.
--
-- Eligibility is deliberately stricter than "paid":
--   * the vendor must still be verified — a suspended store must vanish from
--     the landing page immediately, whatever they paid;
--   * the store must have something to sell — a featured empty store burns a
--     paid slot and reads as a broken link.
-- Both are enforced here rather than in the UI so they cannot be bypassed.

create or replace view active_promotions as
select
  p.id,
  p.vendor_id,
  p.tier,
  p.starts_at,
  p.ends_at,
  p.impressions,
  p.clicks,
  v.business_name,
  v.slug,
  v.logo_url,
  v.city,
  v.country,
  v.rating_avg,
  v.rating_count,
  (select count(*) from listings l
    where l.vendor_id = v.id and l.status = 'active')::int as listing_count,
  greatest(0, ceil(extract(epoch from (p.ends_at - now())) / 86400)::int) as days_remaining
from vendor_promotions p
join vendors v on v.id = p.vendor_id
where p.revoked_at is null
  and p.starts_at <= now()
  and p.ends_at   >  now()
  and v.status = 'verified'
  and exists (select 1 from listings l where l.vendor_id = v.id and l.status = 'active');

comment on view active_promotions is
  'Promotions that are live at this instant. Expiry is evaluated on read, so no scheduled job is required for a placement to end.';

-- ---------------------------------------------------------------------------
-- admin view: every promotion with a derived state
-- ---------------------------------------------------------------------------
--
-- Same source of truth, but nothing is filtered out and the state is spelled
-- out, so the admin table never has to reimplement the date logic.

create or replace view promotion_admin as
select
  p.*,
  v.business_name,
  v.slug,
  v.city,
  v.status as vendor_status,
  u.full_name as created_by_name,
  case
    when p.revoked_at is not null then 'revoked'
    when p.ends_at   <= now()     then 'expired'
    when p.starts_at >  now()     then 'scheduled'
    when v.status <> 'verified'   then 'suspended'
    else 'live'
  end as state,
  case when p.paid_at is null then false else true end as is_paid,
  greatest(0, ceil(extract(epoch from (p.ends_at - now())) / 86400)::int) as days_remaining
from vendor_promotions p
join vendors v on v.id = p.vendor_id
left join users u on u.id = p.created_by;
