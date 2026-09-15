-- ============================================================
-- Sokoni Hub — Marketplace schema (PostgreSQL / Supabase)
-- Run this ONCE in the Supabase SQL editor.
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------- enums ----------
do $$ begin
  create type user_role as enum ('buyer','vendor','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vendor_status as enum ('pending','verified','rejected','suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type listing_kind as enum ('product','service');
exception when duplicate_object then null; end $$;

do $$ begin
  create type listing_status as enum ('draft','active','paused','removed');
exception when duplicate_object then null; end $$;

-- New listings require admin review before they go live. Added as extra enum
-- values so this migrates cleanly on top of an existing 'draft/active/paused/removed' column.
alter type listing_status add value if not exists 'pending_review';
alter type listing_status add value if not exists 'rejected';

do $$ begin
  create type order_status as enum ('pending','confirmed','dispatched','delivered','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('cash_on_delivery','whatsapp','bank_transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type complaint_status as enum ('open','investigating','resolved','dismissed');
exception when duplicate_object then null; end $$;

-- ---------- users ----------
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  email         citext,
  phone         text not null unique,
  password_hash text not null,
  role          user_role not null default 'buyer',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index if not exists users_email_uidx on users(lower(email)) where email is not null;

-- ---------- categories ----------
create table if not exists categories (
  id        uuid primary key default gen_random_uuid(),
  name      text not null unique,
  slug      text not null unique,
  kind      listing_kind not null,
  is_banned boolean not null default false,   -- cosmetics / medicine => true
  sort      int not null default 100
);

-- ---------- vendors ----------
create table if not exists vendors (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references users(id) on delete cascade,
  business_name     text not null,
  slug              text not null unique,
  description       text,
  whatsapp          text not null,
  country           text not null,
  city              text not null,
  address           text,
  logo_url          text,
  id_document_url   text,               -- uploaded for KYC
  status            vendor_status not null default 'pending',
  rejection_reason  text,
  verified_at       timestamptz,
  verified_by       uuid references users(id),
  rating_avg        numeric(3,2) not null default 0,
  rating_count      int not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists vendors_status_idx on vendors(status);

-- ---------- listings (products AND services) ----------
create table if not exists listings (
  id             uuid primary key default gen_random_uuid(),
  vendor_id      uuid not null references vendors(id) on delete cascade,
  category_id    uuid not null references categories(id),
  kind           listing_kind not null,
  title          text not null,
  slug           text not null,
  description    text,
  price          numeric(12,2) not null check (price >= 0),
  currency       text not null default 'USD',
  -- product-only fields
  quantity       int,                                   -- stock on hand
  unit           text,                                  -- kg | litre | piece | bag | pack
  weight_kg      numeric(10,3),
  volume_l       numeric(10,3),
  -- service-only fields
  duration_mins  int,
  service_area   text,
  price_type     text not null default 'fixed',         -- fixed | from | hourly | per_kg
  images         jsonb not null default '[]'::jsonb,
  status         listing_status not null default 'pending_review',
  rejection_reason text,                                -- set by admin on reject
  first_approved_at timestamptz,                        -- set the first time an admin approves; re-publishing after that is self-serve
  reviewed_by    uuid references users(id),
  views          int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (vendor_id, slug)
);
alter table listings add column if not exists rejection_reason text;
alter table listings add column if not exists first_approved_at timestamptz;
alter table listings add column if not exists reviewed_by uuid references users(id);
alter table listings alter column status set default 'pending_review';
create index if not exists listings_vendor_idx  on listings(vendor_id);
create index if not exists listings_cat_idx     on listings(category_id);
create index if not exists listings_status_idx  on listings(status);
create index if not exists listings_search_idx  on listings using gin (to_tsvector('simple', title || ' ' || coalesce(description,'')));

-- ---------- orders ----------
create table if not exists orders (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  buyer_id         uuid references users(id) on delete set null,
  vendor_id        uuid not null references vendors(id) on delete cascade,
  status           order_status not null default 'pending',
  payment_method   payment_method not null default 'cash_on_delivery',
  subtotal         numeric(12,2) not null default 0,
  delivery_fee     numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,
  currency         text not null default 'USD',
  contact_name     text not null,
  contact_phone    text not null,
  delivery_address text not null,
  city             text not null,
  country          text not null,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists orders_vendor_idx on orders(vendor_id);
create index if not exists orders_buyer_idx  on orders(buyer_id);

create table if not exists order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  listing_id  uuid references listings(id) on delete set null,
  title       text not null,
  unit_price  numeric(12,2) not null,
  qty         int not null check (qty > 0),
  unit        text,
  line_total  numeric(12,2) not null
);
create index if not exists order_items_order_idx on order_items(order_id);

-- ---------- complaints ----------
create table if not exists complaints (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  reporter_id  uuid references users(id) on delete set null,
  reporter_name  text,
  reporter_phone text,
  vendor_id    uuid references vendors(id) on delete set null,
  listing_id   uuid references listings(id) on delete set null,
  order_id     uuid references orders(id) on delete set null,
  subject      text not null,
  body         text not null,
  status       complaint_status not null default 'open',
  admin_note   text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

-- ---------- reviews ----------
create table if not exists reviews (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references vendors(id) on delete cascade,
  buyer_id   uuid not null references users(id) on delete cascade,
  rating     int not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now(),
  unique (vendor_id, buyer_id)
);

-- ---------- audit log ----------
create table if not exists audit_log (
  id         bigserial primary key,
  actor_id   uuid references users(id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_created_idx on audit_log(created_at desc);

-- ---------- reference categories (config, not demo data) ----------
insert into categories (name, slug, kind, is_banned, sort) values
  ('Grains & Cereals',      'grains-cereals',     'product', false, 10),
  ('Tubers & Flour',        'tubers-flour',       'product', false, 20),
  ('Oils & Condiments',     'oils-condiments',    'product', false, 30),
  ('Spices & Seasoning',    'spices-seasoning',   'product', false, 40),
  ('Frozen & Protein',      'frozen-protein',     'product', false, 50),
  ('Fruits & Vegetables',   'fruits-vegetables',  'product', false, 60),
  ('Snacks & Drinks',       'snacks-drinks',      'product', false, 70),
  ('Hair Styling & Braids', 'hair-styling',       'service', false, 110),
  ('Nail Technician',       'nails',              'service', false, 120),
  ('Makeup Artistry',       'makeup',             'service', false, 130),
  ('Photography',           'photography',        'service', false, 140),
  ('Videography & Editing', 'video-editing',      'service', false, 150),
  ('Graphics & Design',     'graphics-design',    'service', false, 160),
  ('Tailoring & Fashion',   'tailoring',          'service', false, 170),
  ('Catering & Small Chops','catering',           'service', false, 180),
  ('Event Planning & MC',   'events',             'service', false, 190),
  ('Cleaning & Laundry',    'cleaning',           'service', false, 200),
  ('Cosmetics (BANNED)',    'cosmetics',          'product', true,  900),
  ('Medicine & Drugs (BANNED)','medicine',        'product', true,  910)
on conflict (slug) do nothing;

-- keyword blocklist used by the API for prohibited-goods screening
create table if not exists banned_keywords (
  word text primary key
);
insert into banned_keywords (word) values
  ('cosmetic'),('cosmetics'),('lipstick'),('foundation cream'),('skin bleach'),('bleaching'),
  ('whitening cream'),('drug'),('drugs'),('medicine'),('tablet'),('tablets'),('capsule'),
  ('capsules'),('antibiotic'),('paracetamol'),('ibuprofen'),('syrup medicine'),('tramadol'),
  ('codeine'),('supplement pill'),('injection'),('vaccine'),('pharmacy'),('pharmaceutical')
on conflict do nothing;

-- ---------- triggers ----------
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end $$ language plpgsql;

drop trigger if exists listings_touch on listings;
create trigger listings_touch before update on listings
  for each row execute function touch_updated_at();

drop trigger if exists orders_touch on orders;
create trigger orders_touch before update on orders
  for each row execute function touch_updated_at();

-- keep vendor rating in sync
create or replace function sync_vendor_rating() returns trigger as $$
declare v uuid;
begin
  v := coalesce(new.vendor_id, old.vendor_id);
  update vendors set
    rating_avg   = coalesce((select round(avg(rating)::numeric,2) from reviews where vendor_id = v),0),
    rating_count = (select count(*) from reviews where vendor_id = v)
  where id = v;
  return null;
end $$ language plpgsql;

drop trigger if exists reviews_sync on reviews;
create trigger reviews_sync after insert or update or delete on reviews
  for each row execute function sync_vendor_rating();

-- ---------- storage bucket (run in Supabase) ----------
-- insert into storage.buckets (id, name, public) values ('listings','listings', true)
--   on conflict do nothing;
