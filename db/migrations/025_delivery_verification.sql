-- ============================================================
-- 025_delivery_verification.sql
-- Delivery confirmation: the rider completes at the drop-off point (GPS checked),
-- the buyer can confirm or report a problem, and the order completes automatically
-- after a window. Only 'delivered' orders are settled into vendor statements.
-- ============================================================

alter table orders add column if not exists delivered_at timestamptz;      -- when the order became final
alter table orders add column if not exists verify_by timestamptz;         -- auto-complete deadline
alter table orders add column if not exists completed_by text;             -- 'buyer' | 'auto' | 'admin' | 'vendor'
alter table orders add column if not exists buyer_confirmed_at timestamptz;
alter table orders add column if not exists disputed_at timestamptz;       -- set when the buyer reports a problem
alter table orders add column if not exists dispute_reason text;
alter table orders add column if not exists drop_lat numeric(10,7);        -- where the rider says they dropped it
alter table orders add column if not exists drop_lng numeric(10,7);
alter table orders add column if not exists drop_distance_m numeric(8,1);  -- distance from the confirmed pin

alter table orders drop constraint if exists orders_completed_by_check;
alter table orders add constraint orders_completed_by_check
  check (completed_by is null or completed_by in ('buyer', 'auto', 'admin', 'vendor'));

create index if not exists orders_pending_verification_idx
  on orders (verify_by) where status = 'delivered_pending_verification';

-- Editable from the admin dashboard. Defaults: 24 hours to confirm, 150 m geofence.
insert into system_settings (key, value) values (
  'delivery_verification',
  '{"auto_complete_hours": 24, "geofence_metres": 150}'::jsonb
) on conflict (key) do nothing;
