import { adminChallenge, verifyAdmin } from '../mfa';
// api/src/routes/auth.ts
import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomInt, randomUUID } from 'crypto';
import { z } from 'zod';
import { one, query } from '../db';
import { charge } from '../security';
import { signToken, requireAuth, blockImpersonation } from '../auth';
import { HttpError, audit, normalizePhone, validateUuidParam } from '../utils';
import {
  hashPin, checkPin, weakPinReason, chargeAttempt, clearAttempts,
  signSetupToken, verifySetupToken, signChallengeToken, verifyChallengeToken,
} from '../pin';

export const authRouter = Router();
authRouter.param('id', validateUuidParam);

const PUBLIC_COLS = 'id, full_name, phone, email, role, is_active, created_at';
// The signed-in vendor needs their KYC/profile fields but never internal payout
// details or future columns added to the vendors table.
const SELF_VENDOR_COLS = `id, user_id, business_name, slug, description, whatsapp,
  country, city, address, logo_url, id_document_url, status, rejection_reason,
  verified_at, rating_avg, rating_count, created_at, lat, lng`;
const pinField = z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits');
const emailField = z.string().trim().email().max(200);
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10); // equalises timing for unknown accounts

const pub = (u: any) => ({
  id: u.id, full_name: u.full_name, phone: u.phone, email: u.email,
  role: u.role, is_active: u.is_active, created_at: u.created_at,
});

const vendorOf = (userId: string) =>
  one('select id, status, business_name, slug from vendors where user_id = $1', [userId]);

async function startSession(res: Response, user: any) {
  await audit(user.id, 'user.login', 'user', user.id);
  res.json({ token: await signToken(user.id, user.role, {expectedVersion:user.session_version}), user: pub(user), vendor: await vendorOf(user.id) });
}

const needsSetup = async (res: Response, user: any) =>
  res.json({
    pin_setup_required: true,
    setup_token: await signSetupToken(user.id,user.session_version),
    needs_email: !user.email,
    full_name: user.full_name,
  });

/* ------------------------------------------------------------------ */
/* Register: phone, email, password AND a PIN are all required         */
/* ------------------------------------------------------------------ */
const registerSchema = z.object({
  full_name: z.string().min(2).max(120),
  phone: z.string().min(7).max(20),
  email: emailField,
  password: z.string().min(12).max(72).refine(s=>Buffer.byteLength(s,'utf8')<=72,'Password must be at most 72 UTF-8 bytes'),
  pin: pinField,
  role: z.enum(['buyer', 'vendor']).default('buyer'),
});

authRouter.post('/register', async (req, res, next) => {
  try {
    const b = registerSchema.parse(req.body);
    const phone = normalizePhone(b.phone);
    const email = b.email.toLowerCase();

    const weak = weakPinReason(b.pin, phone);
    if (weak) throw new HttpError(422, weak);

    if (await one('select id from users where phone = $1', [phone]))
      throw new HttpError(409, 'An account with this phone number already exists');
    if (await one('select id from users where lower(email) = lower($1)', [email]))
      throw new HttpError(409, 'An account with this email already exists');

    const id = randomUUID(); // the PIN hash is bound to the user id
    const [passwordHash, pinHash] = await Promise.all([bcrypt.hash(b.password, 10), hashPin(id, b.pin)]);
    const user = await one<any>(
      `insert into users (id, full_name, phone, email, password_hash, pin_hash, role)
       values ($1,$2,$3,$4,$5,$6,$7::user_role)
       returning ${PUBLIC_COLS}`,
      [id, b.full_name.trim(), phone, email, passwordHash, pinHash, b.role]
    );
    await audit(user.id, 'user.register', 'user', user.id, { role: b.role });
    res.status(201).json({ token: await signToken(user.id, user.role), user });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------ */
/* Login, step 1: identifier + password                                */
/*   admin            -> independent authenticator/recovery step        */
/*   no PIN yet       -> pin_setup_required (existing accounts)        */
/*   has a PIN        -> pin_required, then step 2                     */
/* ------------------------------------------------------------------ */
const loginSchema = z.object({
  identifier: z.string().min(3).max(200), // phone or email
  password: z.string().min(1).max(200),
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const b = loginSchema.parse(req.body);
    await charge('login:'+b.identifier.trim().toLowerCase(),20,900);
    const phone = normalizePhone(b.identifier);
    const user = await one<any>(
      `select * from users where phone = $1 or lower(email) = lower($2) limit 1`,
      [phone, b.identifier.trim()]
    );
    if (!user) {
      await bcrypt.compare(b.password, DUMMY_HASH);
      throw new HttpError(401, 'Invalid credentials');
    }
    await charge('login-user:'+user.id,20,900);
    if (!(await bcrypt.compare(b.password, user.password_hash)))
      throw new HttpError(401, 'Invalid credentials');
    if (!user.is_active) throw new HttpError(403, 'Account disabled. Contact support.');

    if (user.role === 'admin') return res.json(adminChallenge(user));
    if (!user.pin_hash) return await needsSetup(res, user);
    res.json({ pin_required: true, pin_token: await signChallengeToken(user.id,user.session_version), full_name: user.full_name });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------ */
/* Login, step 2: the PIN                                              */
/* ------------------------------------------------------------------ */
authRouter.post('/login/pin', async (req, res, next) => {
  try {
    const b = z.object({ pin_token: z.string().min(10), pin: pinField }).parse(req.body);
    const userId = await verifyChallengeToken(b.pin_token);
    const user = await one<any>('select * from users where id = $1', [userId]);
    if (!user || !user.is_active || user.role === 'admin' || !user.pin_hash)
      throw new HttpError(403, 'Not allowed');

    await chargeAttempt(user.id); // throws 429 while the account is locked

    if (!(await checkPin(user.id, b.pin, user.pin_hash))) throw new HttpError(401, 'Incorrect PIN');

    await verifyChallengeToken(b.pin_token); // close a concurrent reset between verification and user lookup
    if (user.must_change_pin) {
      // The PIN was a temporary one issued by an admin.
      if (user.pin_temp_expires_at && new Date(user.pin_temp_expires_at) < new Date())
        throw new HttpError(401, 'That temporary PIN has expired. Ask support for a new one.');
      await clearAttempts(user.id);
      return await needsSetup(res, user);
    }

    await clearAttempts(user.id);
    await startSession(res, user);
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------ */
/* Create a PIN: existing accounts on first login, or after an admin   */
/* reset. Password stays as it is.                                     */
/* ------------------------------------------------------------------ */
authRouter.post('/pin/setup', async (req, res, next) => {
  try {
    const b = z
      .object({ setup_token: z.string().min(10), pin: pinField, email: emailField.optional() })
      .parse(req.body);

    const userId = await verifySetupToken(b.setup_token);
    const user = await one<any>('select * from users where id = $1', [userId]);
    if (!user || !user.is_active || user.role === 'admin') throw new HttpError(403, 'Not allowed');
    // Single use: once a real PIN exists this step is closed.
    if (user.pin_hash && !user.must_change_pin) throw new HttpError(409, 'A PIN is already set. Sign in again.');

    const weak = weakPinReason(b.pin, user.phone);
    if (weak) throw new HttpError(422, weak);
    if (user.pin_hash && (await checkPin(user.id, b.pin, user.pin_hash)))
      throw new HttpError(422, 'Choose a different PIN from the temporary one.');

    let email = user.email as string | null;
    if (!email) {
      if (!b.email) throw new HttpError(422, 'Please add your email address.');
      email = b.email.toLowerCase();
      if (await one('select id from users where lower(email) = lower($1) and id <> $2', [email, user.id]))
        throw new HttpError(409, 'An account with this email already exists');
    }

    await verifySetupToken(b.setup_token);
    const updated = await one<any>(
      `update users set
         pin_hash = $2, email = $3, must_change_pin = false, pin_temp_expires_at = null,
         pin_failed_attempts = 0, pin_lock_level = 0, pin_locked_until = null,
         sessions_valid_from = $4
       where id = $1 and session_version=$5
       returning ${PUBLIC_COLS}, session_version`,
      [user.id, await hashPin(user.id, b.pin), email, new Date(),user.session_version]
    );
    if(!updated)throw new HttpError(409,'Account changed. Sign in again.');
    await audit(user.id, 'user.pin_set', 'user', user.id);
    res.json({ token: await signToken(updated.id, updated.role,{expectedVersion:updated.session_version}), user: updated, vendor: await vendorOf(updated.id) });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------ */
/* Change PIN (signed in). Wrong current PIN is a 400, not a 401: the  */
/* web client signs the user out on any 401.                           */
/* ------------------------------------------------------------------ */
authRouter.post('/pin/change', requireAuth('buyer', 'vendor'), blockImpersonation, async (req, res, next) => {
  try {
    const b = z.object({ current_pin: pinField, new_pin: pinField }).parse(req.body);
    const row = await one<any>('select pin_hash, phone, role, session_version from users where id = $1', [req.user!.id]);
    if (!row?.pin_hash) throw new HttpError(400, 'No PIN is set on this account');

    await chargeAttempt(req.user!.id); // a stolen session must not be able to guess the PIN

    if (!(await checkPin(req.user!.id, b.current_pin, row.pin_hash)))
      throw new HttpError(400, 'Current PIN is incorrect');
    if (b.new_pin === b.current_pin) throw new HttpError(422, 'Choose a different PIN');
    const weak = weakPinReason(b.new_pin, row.phone);
    if (weak) throw new HttpError(422, weak);

    const changed=await one<any>(
      `update users set pin_hash = $2, pin_failed_attempts = 0, pin_lock_level = 0,
              pin_locked_until = null, sessions_valid_from = $3
        where id = $1 and session_version=$4 returning session_version`,
      [req.user!.id, await hashPin(req.user!.id, b.new_pin), new Date(),row.session_version]
    );
    if(!changed)throw new HttpError(409,'Account changed. Sign in again.');
    await audit(req.user!, 'user.pin_change', 'user', req.user!.id);
    // Other devices are signed out; hand this one a fresh token.
    res.json({ ok: true, token: await signToken(req.user!.id, row.role,{expectedVersion:changed.session_version}) });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------ */
/* Admin: reset a user's PIN (stand-in until email reset exists).      */
/* Returns a temporary PIN ONCE. The user signs in with their password,*/
/* enters the temporary PIN, then must create a new one.               */
/* ------------------------------------------------------------------ */
authRouter.post('/admin/reset-pin', requireAuth('admin'), blockImpersonation, async (req, res, next) => {
  try {
    const { user_id } = z.object({ user_id: z.string().uuid() }).parse(req.body);
    const target = await one<any>('select id, role from users where id = $1', [user_id]);
    if (!target) throw new HttpError(404, 'User not found');
    if (target.role === 'admin') throw new HttpError(400, 'Admin accounts do not use a PIN');

    const temp = String(randomInt(0, 10000)).padStart(4, '0');
    await query(
      `update users set pin_hash = $2, must_change_pin = true, pin_temp_expires_at = $3,
              pin_failed_attempts = 0, pin_lock_level = 0, pin_locked_until = null,
              sessions_valid_from = $4
        where id = $1`,
      [target.id, await hashPin(target.id, temp), new Date(Date.now() + 48 * 3600 * 1000), new Date()]
    );
    await audit(req.user!, 'user.pin_reset', 'user', target.id);
    res.json({ temp_pin: temp, expires_in_hours: 48 });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------ */
/* Profile + password (unchanged)                                      */
/* ------------------------------------------------------------------ */
authRouter.get('/me', requireAuth(), async (req, res, next) => {
  try {
    // Do not expose session internals from req.user, and do not use select *:
    // both tables receive operational/security columns over time.
    const user = await one(`select ${PUBLIC_COLS} from users where id = $1`, [req.user!.id]);
    const vendor = await one(`select ${SELF_VENDOR_COLS} from vendors where user_id = $1`, [req.user!.id]);
    res.json({ user, vendor });
  } catch (e) {
    next(e);
  }
});

authRouter.patch('/me', requireAuth(), blockImpersonation, async (req, res, next) => {
  try {
    const b = z
      .object({ full_name: z.string().min(2).optional(), email: emailField.nullable().optional() })
      .parse(req.body);
    const user = await one(
      `update users set full_name = coalesce($2, full_name), email = coalesce($3, email)
       where id = $1 returning id, full_name, phone, email, role`,
      [req.user!.id, b.full_name ?? null, b.email ? b.email.toLowerCase() : null]
    );
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/change-password', requireAuth(), blockImpersonation, async (req, res, next) => {
  try {
    const b = z
      .object({ current_password: z.string(), new_password: z.string().min(12).max(72).refine(s=>Buffer.byteLength(s,'utf8')<=72,'Password must be at most 72 UTF-8 bytes') })
      .parse(req.body);
    const row = await one<any>('select password_hash,session_version from users where id = $1', [req.user!.id]);
    if (!(await bcrypt.compare(b.current_password, row.password_hash)))
      throw new HttpError(400, 'Current password is incorrect');
    const changed=await one<any>('update users set password_hash = $2 where id = $1 and session_version=$3 returning session_version', [
      req.user!.id,
      await bcrypt.hash(b.new_password, 10),row.session_version,
    ]);
    if(!changed)throw new HttpError(409,'Account changed. Sign in again.');
    await audit(req.user!, 'user.password_change', 'user', req.user!.id);
    res.json({ ok: true, token: await signToken(req.user!.id, req.user!.role,{expectedVersion:changed.session_version}) });
  } catch (e) {
    next(e);
  }
});

// Device/session controls. Impersonated sessions cannot administer the target's security.
authRouter.get('/sessions', requireAuth(), blockImpersonation, async(req,res,next)=>{
 try {res.json({sessions:await query(`select id,label,created_at,expires_at,(id=$2) as current
 from auth_sessions where user_id=$1 and revoked_at is null and expires_at>now() and impersonated_by is null order by created_at desc`,[req.user!.id,req.user!.session_id])});}catch(e){next(e);}
});
authRouter.delete('/sessions/:id',requireAuth(),blockImpersonation,async(req,res,next)=>{
 try {const id=z.string().uuid().parse(req.params.id);await query('update auth_sessions set revoked_at=now() where id=$1 and user_id=$2',[id,req.user!.id]);res.json({ok:true});}catch(e){next(e);}
});
authRouter.post('/logout',requireAuth(),async(req,res,next)=>{
 try {await query('update auth_sessions set revoked_at=now() where id=$1',[req.user!.session_id]);res.json({ok:true});}catch(e){next(e);}
});
authRouter.post('/logout-others',requireAuth(),blockImpersonation,async(req,res,next)=>{
 try {await query('update auth_sessions set revoked_at=now() where user_id=$1 and id<>$2',[req.user!.id,req.user!.session_id]);res.json({ok:true});}catch(e){next(e);}
});

authRouter.post('/login/mfa',async(req,res,next)=>{
 try {const b=z.object({mfa_token:z.string().max(2000),code:z.string().trim().min(6).max(64)}).parse(req.body);
 const user=await verifyAdmin(b.mfa_token,b.code);await startSession(res,user);
 }catch(e){next(e);}
});
