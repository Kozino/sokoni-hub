create table if not exists system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into system_settings (key, value) values (
  'plan_limits',
  '{"product": {"free": {"listings": 10, "photos": 3, "options": 3}, "standard": {"listings": 50, "photos": 6, "options": 10}, "pro": {"listings": 999999, "photos": 6, "options": 999999}}, "service": {"free": {"listings": 3, "photos": 3, "options": 3}, "standard": {"listings": 10, "photos": 6, "options": 10}, "pro": {"listings": 999999, "photos": 6, "options": 999999}}}'::jsonb
) on conflict (key) do nothing;

insert into system_settings (key, value) values (
  'plan_prices',
  '{"standard": 100, "pro": 250}'::jsonb
) on conflict (key) do nothing;
