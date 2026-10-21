-- ============================================================
-- Monthly bills for service booking fees.
--
-- Fees raised during a calendar month are grouped into one bill per vendor, with a due date.
-- The vendor settles a bill in one of two ways:
--   1. Bank transfer: they submit the transfer reference and receipt, and the admin confirms it.
--   2. Wallet netting: when the vendor requests a payout, open bills are settled from their
--      wallet balance first (oldest first), and the payout is what remains.
--
-- Fee lifecycle: due (raised, not yet billed) -> billed (on a bill) -> paid | void | waived.
-- Bill lifecycle: open -> submitted (receipt sent) -> paid, and submitted -> open if rejected.
-- ============================================================

create table if not exists service_fee_bills (
  id                uuid primary key default gen_random_uuid(),
  vendor_id         uuid not null references vendors(id) on delete cascade,
  period_start      date not null,
  period_end        date not null,          -- exclusive: the first day after the period
  amount            numeric(12,2) not null check (amount >= 0),
  currency          text not null default 'QAR',
  status            text not null default 'open' check (status in ('open', 'submitted', 'paid', 'void')),
  due_date          date not null,
  payment_method    text,
  payment_reference text,
  receipt_url       text,
  submitted_at      timestamptz,
  paid_at           timestamptz,
  paid_from_wallet  boolean not null default false,
  admin_note        text,
  reviewed_by       uuid references users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (vendor_id, period_start)
);

create index if not exists idx_service_fee_bills_status on service_fee_bills (status, due_date);

create trigger service_fee_bills_touch before update on service_fee_bills
  for each row execute function touch_updated_at();

alter table service_booking_fees add column if not exists bill_id uuid references service_fee_bills(id) on delete set null;
create index if not exists idx_service_fees_bill on service_booking_fees (bill_id);

alter table service_booking_fees drop constraint if exists service_booking_fees_status_check;
alter table service_booking_fees add constraint service_booking_fees_status_check
  check (status in ('due', 'billed', 'paid', 'waived', 'void'));

-- A cancelled booking voids its fee while it is unbilled, or while its bill is still open.
-- If that empties an open bill, the bill is voided too. Submitted or paid bills are left alone,
-- so an admin handles any refund for those.
create or replace function void_service_fee_on_cancel() returns trigger
language plpgsql as $$
declare
  b_id uuid;
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update service_booking_fees f set status = 'void', updated_at = now()
     where f.booking_id = new.id
       and (f.status = 'due'
            or (f.status = 'billed' and exists (
                  select 1 from service_fee_bills b where b.id = f.bill_id and b.status = 'open')))
    returning f.bill_id into b_id;

    if b_id is not null then
      update service_fee_bills b set
        amount = coalesce((select sum(f.amount) from service_booking_fees f
                            where f.bill_id = b.id and f.status = 'billed'), 0),
        status = case when exists (select 1 from service_booking_fees f
                                    where f.bill_id = b.id and f.status = 'billed')
                      then b.status else 'void' end,
        updated_at = now()
       where b.id = b_id and b.status = 'open';
    end if;
  end if;
  return new;
end;
$$;
