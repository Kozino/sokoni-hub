-- Security hardening follow-up. Additive and safe on populated installations.

-- Keep both the effective account and the administrator who was viewing as it.
-- actor_id intentionally remains the account context so the affected account is
-- visible; audit readers render impersonated_by as the real operator.
alter table audit_log add column if not exists impersonated_by uuid references users(id) on delete set null;
create index if not exists audit_impersonated_by_created_idx
  on audit_log(impersonated_by, created_at desc) where impersonated_by is not null;

-- These indexes keep the scheduled expiry purge bounded instead of requiring
-- growing-table sequential scans.
create index if not exists auth_sessions_expires_cleanup_idx on auth_sessions(expires_at);
create index if not exists auth_sessions_revoked_cleanup_idx on auth_sessions(revoked_at) where revoked_at is not null;
create index if not exists security_rate_limits_resets_cleanup_idx on security_rate_limits(resets_at);
create index if not exists checkout_requests_created_cleanup_idx on checkout_requests(created_at);

-- 012's users_invalidate_sessions trigger includes role changes. Re-declare it
-- here so installations that adopted an older security baseline also revoke
-- sessions when a user is promoted, demoted, enabled, or disabled.
create or replace function invalidate_user_sessions() returns trigger language plpgsql as $$
begin
 if new.password_hash is distinct from old.password_hash or new.pin_hash is distinct from old.pin_hash
 or new.sessions_valid_from is distinct from old.sessions_valid_from
 or new.role is distinct from old.role or new.is_active is distinct from old.is_active
 or new.mfa_secret is distinct from old.mfa_secret then
   new.session_version := old.session_version + 1;
   new.sessions_valid_from := clock_timestamp();
   update auth_sessions set revoked_at=coalesce(revoked_at,now())
    where user_id=old.id or impersonated_by=old.id;
 end if;
 return new;
end $$;

drop trigger if exists users_invalidate_sessions on users;
create trigger users_invalidate_sessions before update on users
  for each row execute function invalidate_user_sessions();
