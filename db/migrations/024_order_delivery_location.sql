-- ============================================================
-- 024_order_delivery_location.sql
-- Customer-confirmed delivery pin, used by the rider and by live tracking.
-- ============================================================

alter table orders add column if not exists delivery_lat numeric(10,7);
alter table orders add column if not exists delivery_lng numeric(10,7);

alter table orders drop constraint if exists orders_delivery_lat_range;
alter table orders add constraint orders_delivery_lat_range
  check (delivery_lat is null or delivery_lat between -90 and 90);
alter table orders drop constraint if exists orders_delivery_lng_range;
alter table orders add constraint orders_delivery_lng_range
  check (delivery_lng is null or delivery_lng between -180 and 180);

-- Both coordinates or neither.
alter table orders drop constraint if exists orders_delivery_point_pair;
alter table orders add constraint orders_delivery_point_pair
  check ((delivery_lat is null) = (delivery_lng is null));
