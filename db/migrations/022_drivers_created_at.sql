-- The admin driver list orders and displays d.created_at, but 021_drivers.sql
-- did not create that column, so /api/admin/drivers failed with a 500.
-- Idempotent: safe to run even if the column already exists.
alter table drivers add column if not exists created_at timestamptz not null default now();
