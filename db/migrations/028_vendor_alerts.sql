-- ============================================================
-- 028_vendor_alerts.sql
-- Vendor on/off switch for order and booking alerts. When false,
-- the vendor's devices get no new-order, new-booking or cancellation
-- pushes. Default true keeps existing vendors alerting as before.
-- ============================================================

alter table vendors add column if not exists alerts_enabled boolean not null default true;
