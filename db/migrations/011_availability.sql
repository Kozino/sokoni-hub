-- Extends 005_service_bookings; never creates a second bookings table/enum.
-- Qatar local hours; absolute appointment times are timestamptz.
begin;
create extension if not exists btree_gist;
create table if not exists vendor_booking_settings (
 vendor_id uuid primary key references vendors(id) on delete cascade,
 auto_accept boolean not null default false,
 offers_at_vendor boolean not null default true,
 offers_home_service boolean not null default false,
 home_service_notes text,
 cancel_notice_hours int not null default 24 check(cancel_notice_hours between 0 and 168),
 buffer_mins int not null default 15 check(buffer_mins between 0 and 120),
 slot_step_mins int not null default 30 check(slot_step_mins in (15,30,60)),
 min_notice_hours int not null default 2 check(min_notice_hours between 0 and 72),
 max_advance_days int not null default 30 check(max_advance_days between 1 and 180),
 updated_at timestamptz not null default now(), check(offers_at_vendor or offers_home_service)
);
create table if not exists vendor_hours (
 id uuid primary key default gen_random_uuid(),
 vendor_id uuid not null references vendors(id) on delete cascade,
 weekday smallint not null check(weekday between 0 and 6),
 opens_at time not null, closes_at time not null, check(closes_at > opens_at)
);
create index if not exists idx_vendor_hours_vendor on vendor_hours(vendor_id,weekday);
create table if not exists vendor_time_off (
 id uuid primary key default gen_random_uuid(),
 vendor_id uuid not null references vendors(id) on delete cascade,
 starts_at timestamptz not null, ends_at timestamptz not null, reason text,
 created_at timestamptz not null default now(), check(ends_at > starts_at)
);
create index if not exists idx_vendor_time_off_vendor on vendor_time_off(vendor_id,starts_at);
alter table service_bookings
 add column if not exists slot_starts_at timestamptz,
 add column if not exists slot_ends_at timestamptz,
 add column if not exists location_type text not null default 'vendor' check(location_type in ('vendor','home')),
 add column if not exists address text,
 add column if not exists cancelled_by text check(cancelled_by in ('buyer','vendor')),
 add column if not exists reminder_sent_at timestamptz;
create index if not exists idx_bookings_slot on service_bookings(vendor_id,slot_starts_at);
do $$ begin
 alter table service_bookings add constraint service_bookings_slot_bounds check (
   (slot_starts_at is null and slot_ends_at is null) or
   (slot_starts_at is not null and slot_ends_at is not null and slot_ends_at > slot_starts_at)
 );
exception when duplicate_object then null; end $$;
do $$ begin
 alter table service_bookings add constraint service_bookings_no_overlap exclude using gist (
  vendor_id with =, tstzrange(slot_starts_at,slot_ends_at,'[)') with &&
 ) where (slot_starts_at is not null and status in ('new','contacted','confirmed'));
exception when duplicate_object or duplicate_table then null; end $$;
-- These tables are accessed by the existing privileged Express/pg connection,
-- not anonymous Supabase REST. Do not expose schedules/private reasons publicly.
alter table service_bookings enable row level security;
alter table vendor_booking_settings enable row level security;
alter table vendor_hours enable row level security;
alter table vendor_time_off enable row level security;
commit;
