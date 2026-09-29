-- Where did each order come from?
--   marketplace  = found through Sokoni Hub itself (search, browse)
--   vendor-share = buyer opened the vendor's shared link
--   qr           = buyer scanned the vendor's QR code
-- Safe to run more than once. Also append this block to db/schema.sql so fresh setups include it.

alter table orders
  add column if not exists source text not null default 'marketplace';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_source_check'
  ) then
    alter table orders
      add constraint orders_source_check
      check (source in ('marketplace', 'vendor-share', 'qr'));
  end if;
end $$;

create index if not exists idx_orders_vendor_source on orders (vendor_id, source);
