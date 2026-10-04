alter table listings add column if not exists options jsonb not null default '[]'::jsonb;
