-- ============================================================
-- 027: QC fixes
--  - payment status for cash on delivery (item 12)
--  - pickup geofence evidence (item 10)
--  - rider cash and fee ledger for reconciliation (item 5)
-- Additive and idempotent.
-- ============================================================

-- ---------- 12. payment status ----------
alter table orders add column if not exists payment_status text not null default 'unpaid';
alter table orders add column if not exists paid_at timestamptz;

alter table orders drop constraint if exists orders_payment_status_check;
alter table orders add constraint orders_payment_status_check
  check (payment_status in ('unpaid', 'paid'));

-- Cash on delivery is paid once the order has been handed over (rider or vendor completes the drop-off).
update orders
   set payment_status = 'paid', paid_at = coalesce(paid_at, delivered_at, updated_at)
 where status in ('delivered_pending_verification', 'delivered') and payment_status <> 'paid';

create or replace function orders_mark_paid() returns trigger language plpgsql as $$
begin
  if new.status in ('delivered_pending_verification', 'delivered') and new.payment_status <> 'paid' then
    new.payment_status := 'paid';
    new.paid_at := coalesce(new.paid_at, now());
  end if;
  return new;
end $$;

drop trigger if exists orders_mark_paid_trg on orders;
create trigger orders_mark_paid_trg
  before insert or update of status on orders
  for each row execute function orders_mark_paid();

-- ---------- 10. pickup evidence ----------
alter table orders add column if not exists pickup_lat numeric(10,7);
alter table orders add column if not exists pickup_lng numeric(10,7);
alter table orders add column if not exists pickup_distance_m numeric(8,1);

-- ---------- 5. rider cash and fee ledger ----------
-- cash_collected : cash the rider took from the buyer (order total, cash on delivery only)
-- fee_earned     : the delivery fee the rider earned on that order
-- remittance     : cash the rider handed in (recorded by an admin)
-- fee_paid       : earned fees paid out to the rider (recorded by an admin)
create table if not exists driver_ledger (
  id uuid primary key default gen_random_uuid(),
  driver_user_id uuid not null references users(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  kind text not null check (kind in ('cash_collected', 'fee_earned', 'remittance', 'fee_paid')),
  amount numeric(12,2) not null check (amount > 0),
  note text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- One automatic entry per order per kind, so a retry never double-counts.
create unique index if not exists driver_ledger_order_kind_uidx
  on driver_ledger (order_id, kind) where order_id is not null;
create index if not exists driver_ledger_driver_idx on driver_ledger (driver_user_id, created_at desc);

-- Backfill ledger entries for orders that riders already completed.
insert into driver_ledger (driver_user_id, order_id, kind, amount, note)
select o.driver_id, o.id, 'cash_collected', o.total, 'Backfilled from completed order'
  from orders o
 where o.driver_id is not null
   and o.status in ('delivered_pending_verification', 'delivered')
   and o.payment_method = 'cash_on_delivery'
   and o.total > 0
on conflict do nothing;

insert into driver_ledger (driver_user_id, order_id, kind, amount, note)
select o.driver_id, o.id, 'fee_earned', o.delivery_fee, 'Backfilled from completed order'
  from orders o
 where o.driver_id is not null
   and o.status in ('delivered_pending_verification', 'delivered')
   and o.delivery_fee > 0
on conflict do nothing;
