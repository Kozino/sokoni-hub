-- ============================================================
-- 023_driver_profile.sql
-- Rider profile (bank + documents), and a pickup step for deliveries.
-- ============================================================

-- Driver is collected for the order once picked up from the vendor.
alter type order_status add value if not exists 'out_for_delivery' after 'driver_arrived';

alter table drivers add column if not exists bank_name text;
alter table drivers add column if not exists bank_account_name text;
alter table drivers add column if not exists bank_iban text;
-- Document storage keys, e.g. {"licence":"kyc://…","id_card":"kyc://…"}
alter table drivers add column if not exists documents jsonb not null default '{}'::jsonb;
