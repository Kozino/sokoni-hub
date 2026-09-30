-- Security foundation. Additive; no customer records are deleted.
alter table users add column if not exists session_version integer not null default 0;
alter table users add column if not exists mfa_secret text;
alter table users add column if not exists mfa_last_step bigint;
alter table users add column if not exists mfa_recovery_hashes jsonb not null default '[]';
create table if not exists auth_sessions (
 id uuid primary key, user_id uuid not null references users(id) on delete cascade,
 version integer not null, created_at timestamptz not null default now(),
 expires_at timestamptz not null, revoked_at timestamptz,
 impersonated_by uuid references users(id) on delete cascade,
 parent_session_id uuid references auth_sessions(id) on delete cascade,
 label text not null default 'Web session'
);
create index if not exists auth_sessions_user on auth_sessions(user_id, expires_at);
create or replace function invalidate_user_sessions() returns trigger language plpgsql as $$
begin
 if new.password_hash is distinct from old.password_hash or new.pin_hash is distinct from old.pin_hash
 or new.sessions_valid_from is distinct from old.sessions_valid_from
 or new.role is distinct from old.role or new.is_active is distinct from old.is_active
 or new.mfa_secret is distinct from old.mfa_secret then
   new.session_version := old.session_version + 1;
   new.sessions_valid_from := clock_timestamp();
   update auth_sessions set revoked_at=coalesce(revoked_at,now()) where user_id=old.id or impersonated_by=old.id;
 end if;
 return new;
end $$;
drop trigger if exists users_invalidate_sessions on users;
create trigger users_invalidate_sessions before update on users for each row execute function invalidate_user_sessions();
create table if not exists security_rate_limits (
 key text primary key, attempts integer not null, resets_at timestamptz not null
);
create table if not exists checkout_requests (
 key uuid primary key, fingerprint text not null, response jsonb not null, created_at timestamptz not null default now()
);
alter table orders add column if not exists stock_restored_at timestamptz;
create table if not exists private_uploads (
 key text primary key, user_id uuid not null references users(id) on delete cascade,
 bytes integer not null, created_at timestamptz not null default now()
);
-- Express is the sole application data gateway. No browser/mobile Supabase table API access.
-- Use an owner/BYPASSRLS role for the trusted Express server; NEVER expose that credential.
do $$ declare n text; r text; begin
 foreach n in array array['users','vendors','categories','listings','orders','order_items','complaints',
 'complaint_messages','reviews','review_votes','audit_log','banned_keywords','vendor_delivery_settings',
 'platform_settings','vendor_statements','statement_orders','document_counters','email_log','payout_batches',
 'service_bookings','stock_movements','vendor_promotions','vendor_booking_settings','vendor_hours','vendor_time_off',
 'auth_sessions','security_rate_limits','checkout_requests','private_uploads','vendor_inventory','active_promotions',
 'promotion_admin','review_public'] loop
 if to_regclass('public.'||n) is not null then
   if exists(select 1 from pg_class where oid=to_regclass('public.'||n) and relkind='r') then
     execute format('alter table public.%I enable row level security',n);
   end if;
   foreach r in array array['anon','authenticated'] loop
     if exists(select 1 from pg_roles where rolname=r) then
       execute format('revoke all on table public.%I from %I',n,r);
     end if;
   end loop;
   execute format('revoke all on table public.%I from public',n);
 end if;
 end loop;
end $$;
