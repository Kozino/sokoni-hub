-- 007_order_item_kind.sql
--
-- Stop commissioning service work.
--
-- The monetisation decision is that service vendors pay a fee before approval
-- and are NEVER charged commission on the work itself. Since 005 that holds
-- structurally for new business: services leave the cart, a booking is written
-- instead of an order, and computeStatement() only ever sees orders.
--
-- It does not hold for history. Before 005 a service could be added to the cart
-- like any other listing, so orders containing service lines exist in the
-- database. Billing has never actually run in production (CRON_SECRET is unset,
-- so the endpoint 503s), which means the FIRST run will sweep up that entire
-- backlog and charge commission on every historical service sale in one go.
--
-- The commission base is currently orders.subtotal, which is blind to what was
-- sold. Deriving the kind at settlement time by joining back to listings does
-- not work either: order_items.listing_id is ON DELETE SET NULL, so a deleted
-- listing takes the evidence with it, and a vendor could change a listing's
-- kind after the sale.
--
-- So the kind is snapshotted onto the line, alongside the title and unit_price
-- that are already snapshotted there for exactly the same reason.

alter table order_items
  add column if not exists kind listing_kind;

comment on column order_items.kind is
  'What was sold, captured at checkout. Drives the commission base: service lines are never commissioned. NULL only for historical rows whose listing was deleted before this migration ran.';

-- Backfill from the listing where it still exists.
update order_items oi
   set kind = l.kind
  from listings l
 where l.id = oi.listing_id
   and oi.kind is null;

-- Everything still NULL is a line whose listing was deleted. The kind is
-- genuinely unrecoverable, so it is left NULL and treated as commissionable
-- downstream. That is the pre-existing behaviour and it deliberately does not
-- silently reduce revenue on the strength of a guess — but it IS a guess, so
-- the count is reported rather than buried.
do $$
declare n int;
begin
  select count(*) into n from order_items where kind is null;
  if n > 0 then
    raise notice '007: % order line(s) have an unrecoverable kind (listing deleted). They will be treated as products for commission. Review with: select o.code, oi.title from order_items oi join orders o on o.id = oi.order_id where oi.kind is null;', n;
  end if;
end $$;

-- Settlement filters by kind per order, so the lookup is by order.
create index if not exists order_items_order_kind_idx on order_items(order_id, kind);
