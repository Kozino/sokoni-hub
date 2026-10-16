-- ============================================================
-- 021_drivers.sql
-- ============================================================

alter type user_role add value if not exists 'driver' after 'admin';

create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  status text not null default 'pending', -- 'pending', 'approved', 'suspended'
  vehicle_type text not null, -- 'Motorcycle', 'Car', 'Van'
  license_plate text not null,
  is_online boolean not null default false,
  current_lat numeric(10,8),
  current_lng numeric(11,8),
  last_ping_at timestamptz
);

-- When a driver accepts an order, they are assigned to it.
alter table orders add column if not exists driver_id uuid references users(id) on delete set null;
