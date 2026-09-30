-- Email-code recovery for buyer/vendor passwords and PINs.
-- Codes are never stored in plaintext. A server-secret HMAC protects the
-- deliberately short (six digit) user-entered value if this table is exposed.
create table if not exists account_recovery_tokens (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  purpose text not null check (purpose in ('password','pin')),
  code_hash text not null,
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 5),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_recovery_tokens_active_idx
  on account_recovery_tokens (user_id, purpose, created_at desc)
  where used_at is null;
create index if not exists account_recovery_tokens_expiry_idx
  on account_recovery_tokens (expires_at);
