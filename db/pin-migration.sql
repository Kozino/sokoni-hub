-- Run once in the Supabase SQL editor. Passwords stay; the PIN is added on top.

alter table users
  add column if not exists pin_hash text,
  add column if not exists must_change_pin boolean not null default false,
  add column if not exists pin_temp_expires_at timestamptz,
  add column if not exists pin_failed_attempts int not null default 0,
  add column if not exists pin_lock_level int not null default 0,
  add column if not exists pin_locked_until timestamptz,
  add column if not exists sessions_valid_from timestamptz;

-- Only if you already ran the earlier "PIN replaces password" migration:
-- alter table users drop constraint if exists users_has_credential;
-- alter table users alter column password_hash set not null;

-- Optional: sign everyone out now, so each existing user is asked to create a
-- PIN at their next visit instead of whenever their old session expires.
-- update users set sessions_valid_from = now();
