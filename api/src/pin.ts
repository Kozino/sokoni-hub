// api/src/pin.ts
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { one, query } from './db';
import { config } from './config';
import { HttpError } from './utils';

/* Server-side secret. A 4-digit PIN can be cracked from a leaked database in
   seconds, so the hash mixes in a key that lives only in Render's environment. */
const PEPPER = process.env.PIN_PEPPER ?? '';
if (PEPPER.length < 32) {
  throw new Error('PIN_PEPPER must be set to 32+ random characters (generate: openssl rand -hex 32)');
}

const digest = (userId: string, pin: string) =>
  crypto.createHmac('sha256', PEPPER).update(`${userId}:${pin}`).digest('hex');

export const hashPin = (userId: string, pin: string) => bcrypt.hash(digest(userId, pin), 10);
export const checkPin = (userId: string, pin: string, hash: string) =>
  bcrypt.compare(digest(userId, pin), hash);

/* ---- weak PIN rules ---------------------------------------------------- */
const COMMON = new Set([
  '1212', '2121', '1122', '2211', '1010', '0101', '2000', '2580',
  '0852', '1004', '6969', '1313', '2468', '1357',
]);

export function weakPinReason(pin: string, phone?: string): string | null {
  if (!/^\d{4}$/.test(pin)) return 'PIN must be exactly 4 digits';
  const d = pin.split('').map(Number);
  if (d.every((x) => x === d[0])) return 'Choose a PIN without repeated digits, like 1111';
  const steps = d.slice(1).map((x, i) => x - d[i]);
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1))
    return 'Choose a PIN that is not a simple sequence, like 1234';
  if (COMMON.has(pin)) return 'That PIN is too easy to guess. Choose another.';
  if (phone && phone.replace(/\D/g, '').endsWith(pin))
    return 'Do not use the last 4 digits of your phone number';
  return null;
}

/* ---- per-account lockout ------------------------------------------------
   The attempt is CHARGED before the PIN is compared, in one atomic UPDATE.
   If we compared first and counted after, a burst of parallel guesses would
   all pass the "not locked" check before any failure was recorded. Charging
   first caps an attacker at 5 guesses per lock window.
   Locks escalate: 15m, 30m, 1h, 2h, 4h, 8h, 16h, then 24h.
   The PIN step is only reachable after a correct password, so a stranger
   cannot lock someone else's account by guessing. */
export async function chargeAttempt(userId: string) {
  const row = await one<{ id: string }>(
    `update users set
       pin_failed_attempts = case when pin_failed_attempts + 1 >= 5 then 0 else pin_failed_attempts + 1 end,
       pin_locked_until = case when pin_failed_attempts + 1 >= 5
           then now() + interval '15 minutes' * least(power(2, pin_lock_level), 96)
           else pin_locked_until end,
       pin_lock_level = case when pin_failed_attempts + 1 >= 5
           then least(pin_lock_level + 1, 7) else pin_lock_level end
     where id = $1 and (pin_locked_until is null or pin_locked_until <= now())
     returning id`,
    [userId]
  );
  if (!row) {
    const u = await one<{ mins: number }>(
      `select ceil(extract(epoch from (pin_locked_until - now())) / 60)::int as mins
         from users where id = $1`,
      [userId]
    );
    const mins = Math.max(u?.mins ?? 15, 1);
    throw new HttpError(429, `Too many wrong PIN attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }
}

export const clearAttempts = (userId: string) =>
  query(
    `update users set pin_failed_attempts = 0, pin_lock_level = 0, pin_locked_until = null where id = $1`,
    [userId]
  );

/* ---- step tokens --------------------------------------------------------
   Both are signed with DIFFERENT secrets from session tokens, so neither can
   ever be used as a login session, even by accident. */
const SETUP_SECRET = `${config.jwtSecret}:pin-setup`;
const CHALLENGE_SECRET = `${config.jwtSecret}:pin-login`;

function verifyPurpose(token: string, secret: string, purpose: string, message: string): string {
  try {
    const p = jwt.verify(token, secret) as { sub: string; pur?: string };
    if (p.pur !== purpose) throw new Error('wrong purpose');
    return p.sub;
  } catch {
    throw new HttpError(400, message);
  }
}

/** Issued after a correct password when the user must create a PIN. */
export const signSetupToken = (userId: string) =>
  jwt.sign({ sub: userId, pur: 'pin_setup' }, SETUP_SECRET, { expiresIn: '10m' });
export const verifySetupToken = (t: string) =>
  verifyPurpose(t, SETUP_SECRET, 'pin_setup', 'This step expired. Please sign in again.');

/** Issued after a correct password when the user already has a PIN. */
export const signChallengeToken = (userId: string) =>
  jwt.sign({ sub: userId, pur: 'pin_login' }, CHALLENGE_SECRET, { expiresIn: '5m' });
export const verifyChallengeToken = (t: string) =>
  verifyPurpose(t, CHALLENGE_SECRET, 'pin_login', 'Your sign-in expired. Please start again.');
