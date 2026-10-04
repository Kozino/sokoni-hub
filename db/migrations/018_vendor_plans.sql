
create type vendor_plan as enum ('free', 'standard', 'pro');
alter table vendors add column if not exists plan vendor_plan not null default 'free';
alter table vendors add column if not exists plan_expires_at timestamptz;

create type subscription_status as enum ('pending', 'approved', 'rejected');

create table if not exists vendor_subscriptions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  plan vendor_plan not null,
  months int not null default 1,
  amount numeric(12,2) not null,
  currency text not null default 'QAR',
  payment_method text not null,
  reference text,
  receipt_url text,
  status subscription_status not null default 'pending',
  admin_note text,
  reviewed_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger vendor_subscriptions_touch before update on vendor_subscriptions for each row execute function touch_updated_at();
