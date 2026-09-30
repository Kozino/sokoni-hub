-- Optional one-time secret generation. Run only in YOUR Supabase SQL Editor.
-- This SELECT does not change tables or application records.
-- Keep results private. Do not save/share results in GitHub, chat or screenshots.
-- IMPORTANT: Keep an existing MFA_ENCRYPTION_KEY and PIN_PEPPER unchanged.
-- new_* keys below are candidates ONLY for settings that are missing/need rotation.
set search_path = public, extensions;
with entropy as materialized (select gen_random_bytes(32) as bytes),
seed as (
 select string_agg(substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',1+(get_byte(bytes,i)%32),1),'' order by i) as value
 from entropy cross join generate_series(0,31) as n(i)
)
select
 seed.value as admin_mfa_seed,
 (select string_agg(upper(encode(gen_random_bytes(12),'hex')), E'\n' order by i)
  from generate_series(1,10) as n(i)) as admin_mfa_recovery_codes,
 encode(gen_random_bytes(32),'hex') as new_mfa_encryption_key,
 encode(gen_random_bytes(32),'hex') as new_jwt_secret
from seed;
