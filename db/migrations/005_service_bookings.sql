-- 005_service_bookings.sql
--
-- Services stop going through the cart.
--
-- A haircut, a set of nails or a dreadlock appointment is not an order: there is
-- no stock to decrement, nothing to deliver, and listings.price_type may be
-- 'from' or 'hourly', so no honest total can be computed at checkout. What the
-- buyer actually wants is to reach the vendor and agree a time.
--
-- But a bare WhatsApp link tells the platform nothing, and the requirement is
-- that everything in the app reports back to admin and vendor. So a booking row
-- is written first and the WhatsApp hand-off carries its code. The conversation
-- still happens on WhatsApp; the platform keeps the record.
--
-- Deliberately NOT included here (see notes at the end):
--   * vendor availability / working hours / slot conflict detection
--   * any money. Bookings never touch orders, so they are never commissioned.
--
-- Additive and idempotent. Safe to re-run.

begin;

do $$ begin
  create type booking_status as enum ('new','contacted','confirmed','completed','cancelled','no_show');
exception when duplicate_object then null; end $$;

create table if not exists service_bookings (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  listing_id     uuid not null references listings(id) on delete cascade,
  vendor_id      uuid not null references vendors(id) on delete cascade,
  -- Null when a signed-out visitor books. The contact fields below are the
  -- source of truth for reaching them, exactly as orders does it.
  buyer_id       uuid references users(id) on delete set null,

  contact_name   text not null,
  contact_phone  text not null,
  contact_email  text,

  -- What the buyer asked for. preferred_at is their request, not a commitment;
  -- scheduled_at is what the vendor actually agreed after talking.
  preferred_at   timestamptz,
  preferred_note text,
  scheduled_at   timestamptz,

  -- Snapshot of the advertised price at the time of booking, so a later price
  -- edit cannot rewrite history. Indicative only: nothing is charged here.
  quoted_price   numeric(12,2),
  quoted_price_type text,
  currency       text not null default 'QAR',

  status         booking_status not null default 'new',
  vendor_note    text,
  cancel_reason  text,

  -- Set when the vendor first opens it, so response time can be measured. That
  -- number is the whole argument for charging service vendors a fee later.
  first_viewed_at timestamptz,
  contacted_at    timestamptz,
  completed_at    timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_bookings_vendor  on service_bookings (vendor_id, created_at desc);
create index if not exists idx_bookings_buyer   on service_bookings (buyer_id, created_at desc);
create index if not exists idx_bookings_status  on service_bookings (status);
create index if not exists idx_bookings_listing on service_bookings (listing_id);

-- Look-ups by code+phone for the public "track my booking" view, mirroring the
-- existing order tracking route.
create index if not exists idx_bookings_code on service_bookings (code);

do $$ begin
  create trigger trg_bookings_updated
    before update on service_bookings
    for each row execute function touch_updated_at();
exception when duplicate_object then null; end $$;

commit;

-- ---------------------------------------------------------------------------
-- Vendor availability, when you are ready for it
--
-- This migration stops at "the buyer states a preferred time". Real availability
-- is a separate problem and should be a later migration, because it needs:
--
--   vendor_hours        (vendor_id, weekday, opens_at, closes_at)
--   vendor_time_off     (vendor_id, starts_at, ends_at, reason)
--   listings.duration_mins is already present and becomes the slot length
--
-- and then a conflict check on insert. Doing that now would mean guessing at
-- how these vendors actually work before a single booking has been taken.
-- preferred_at vs scheduled_at is the seam: once availability exists, the API
-- can validate preferred_at against it and auto-fill scheduled_at, and nothing
-- above needs to change.
-- ---------------------------------------------------------------------------
