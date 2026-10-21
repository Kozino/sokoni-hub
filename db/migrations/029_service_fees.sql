-- ============================================================
-- Service booking fees and service-only monthly plans.
--
-- Settings live in system_settings (key 'service_fees') so the admin can change them
-- from the dashboard without a code change:
--   fee_enabled     turn the per-booking fee on or off
--   amount          fee in the platform currency (QAR)
--   charge_on       'every_booking' or 'new_clients' (first booking from a client phone)
--   waive_for_plan  vendors with an active paid plan do not pay the fee
--   plan_enabled    service vendors may buy Standard/Pro plans, even when product
--                   subscriptions are off. Plans then limit service listings only.
--
-- A fee row is written when a booking is created. Cancelling the booking voids its
-- due fee automatically (trigger below), so the vendor is never charged for it.
-- ============================================================

insert into system_settings (key, value) values (
  'service_fees',
  '{"fee_enabled": false, "amount": 0, "charge_on": "every_booking", "waive_for_plan": false, "plan_enabled": false}'::jsonb
) on conflict (key) do nothing;

create table if not exists service_booking_fees (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null unique references service_bookings(id) on delete cascade,
  vendor_id         uuid not null references vendors(id) on delete cascade,
  amount            numeric(12,2) not null check (amount >= 0),
  currency          text not null default 'QAR',
  charge_on         text not null check (charge_on in ('every_booking', 'new_clients')),
  status            text not null default 'due' check (status in ('due', 'paid', 'waived', 'void')),
  payment_reference text,
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_service_fees_vendor_status on service_booking_fees (vendor_id, status);
create index if not exists idx_service_fees_status on service_booking_fees (status, created_at);

create trigger service_booking_fees_touch before update on service_booking_fees
  for each row execute function touch_updated_at();

create or replace function void_service_fee_on_cancel() returns trigger
language plpgsql as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update service_booking_fees set status = 'void', updated_at = now()
     where booking_id = new.id and status = 'due';
  end if;
  return new;
end;
$$;

drop trigger if exists service_bookings_void_fee on service_bookings;
create trigger service_bookings_void_fee after update of status on service_bookings
  for each row execute function void_service_fee_on_cancel();
