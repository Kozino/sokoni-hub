-- 016_transactional_email.sql
--
-- Verified accounts and reliable transactional notifications.
-- Additive and safe for an already-populated production database.

-- Existing accounts predate email verification. Mark their existing addresses
-- as verified so this release never locks out current buyers or vendors.
alter table users add column if not exists email_verified_at timestamptz;
update users
   set email_verified_at = coalesce(email_verified_at, created_at)
 where email is not null and email_verified_at is null;

-- New registrations receive a high-entropy, single-use link. Only a SHA-256
-- digest is stored, so a database disclosure cannot be used to verify an email.
create table if not exists email_verification_tokens (
  id         uuid primary key,
  user_id    uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists email_verification_tokens_active_idx
  on email_verification_tokens (user_id, created_at desc)
  where used_at is null;
create index if not exists email_verification_tokens_expiry_idx
  on email_verification_tokens (expires_at)
  where used_at is null;

-- Guest checkout can now opt in to delivery updates and the branded receipt.
alter table orders add column if not exists contact_email text;
create index if not exists orders_contact_email_idx
  on orders (lower(contact_email)) where contact_email is not null;
