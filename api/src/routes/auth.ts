import { adminChallenge, verifyAdmin } from '../mfa';
// api/src/routes/auth.ts
import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { one, query, tx } from '../db';
import { charge } from '../security';
import { signToken, requireAuth, blockImpersonation } from '../auth';
import { config } from '../config';
import { sendMailAsync } from '../mailer';
import { verificationEmail } from '../transactionalEmail';
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
  verified_at, rating_avg, rating_count, created_at, lat, lng, plan, plan_expires_at`;
const pinField = z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits');
const emailField = z.string().trim().email().max(200);
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10); // equalises timing for unknown accounts

const pub = (u: any) => ({
  id: u.id, full_name: u.full_name, phone: u.phone, email: u.email,
  role: u.role, is_active: u.is_active, created_at: u.created_at,
});

const vendorOf = (userId: string) =>
  one('select id, status, business_name, slug, plan, plan_expires_at from vendors where user_id = $1', [userId]);

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
/* Email verification                                                   */
/* ------------------------------------------------------------------ */
const verificationHash = (token: string) => createHash('sha256').update(token).digest('hex');

async function issueVerification(userId: string, email: string) {
  const token = randomBytes(32).toString('base64url');
  await tx(async (c) => {
    await c.query('update email_verification_tokens set used_at=now() where user_id=$1 and used_at is null', [userId]);
    await c.query(
      `insert into email_verification_tokens(id,user_id,token_hash,expires_at)
       values($1,$2,$3,now()+interval '24 hours')`,
      [randomUUID(), userId, verificationHash(token)],
    );
  });
  const verificationUrl = `${config.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
  sendMailAsync({
    to: email,
    subject: 'Verify your Sokoni Hub email address',
    html: verificationEmail(verificationUrl),
    kind: 'email_verification',
    entityId: userId,
  });
}

const verificationToken = z.string().min(40).max(200);
const verificationEmailAddress = z.string().trim().email().max(200).transform((value) => value.toLowerCase());

authRouter.post('/verify-email', async (req, res, next) => {
  try {
    const token = verificationToken.parse(req.body?.token);
    const result = await tx(async (c) => {
      const row = (await c.query<any>(
        `select t.id,t.user_id from email_verification_tokens t
         join users u on u.id=t.user_id
         where t.token_hash=$1 and t.used_at is null and t.expires_at>now()
         for update of t,u`,
        [verificationHash(token)],
      )).rows[0];
      if (!row) return null;
      await c.query('update email_verification_tokens set used_at=now() where id=$1', [row.id]);
      await c.query('update users set email_verified_at=coalesce(email_verified_at,now()) where id=$1', [row.user_id]);
      return row.user_id as string;
    });
    if (!result) throw new HttpError(400, 'This verification link is invalid or has expired. Request a new link.');
    await audit(result, 'user.email_verified', 'user', result);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

authRouter.post('/verify-email/resend', async (req, res, next) => {
  try {
    const email = verificationEmailAddress.parse(req.body?.email);
    await charge(`verify-email:${email}`, 5, 900);
    const user = await one<any>(
      `select id,email from users where lower(email)=lower($1) and is_active=true
       and email_verified_at is null and role <> 'admin' limit 1`,
      [email],
    );
    if (user?.email) {
      await issueVerification(user.id, user.email);
      await audit(user.id, 'user.email_verification_resent', 'user', user.id);
    }
    // Generic response prevents address enumeration.
    res.status(202).json({ ok: true, message: 'If that address needs verification, a new link has been sent.' });
  } catch (e) { next(e); }
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
    await issueVerification(user.id, user.email);
    // Do not create a session until the address has been proven. This prevents
    // disposable/typo addresses from becoming active marketplace accounts.
    res.status(201).json({ verification_required: true, email: user.email });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------ */
/* Email recovery: generic replies prevent account enumeration.         */
/*                                                                      */
/* A provider is optional. With EMAIL_PROVIDER=none, the mailer records */
/* a skipped delivery and the client still sees the same success reply. */
/* Once Resend/Brevo is configured, no mobile release is needed.       */
/* ------------------------------------------------------------------ */
const recoveryPurpose = z.enum(['password', 'pin']);
const recoveryEmail = z.string().trim().email().max(200).transform((v) => v.toLowerCase());
const recoveryCode = z.string().regex(/^\d{6}$/, 'Recovery code must be six digits');
const recoveryDigest = (id: string, code: string) =>
  createHmac('sha256', `${config.jwtSecret}:account-recovery`).update(`${id}:${code}`).digest('hex');
const recoveryEqual = (a: string, b: string) => {
  const left = Buffer.from(a, 'hex'); const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
};
const recoveryMail = (code: string, purpose: 'password' | 'pin') => `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#171c36">
    <h2>Sokoni Hub account recovery</h2>
    <p>Use this one-time code to reset your ${purpose === 'password' ? 'password' : 'four-digit PIN'}:</p>
    <p style="font-size:28px;letter-spacing:7px;font-weight:700;color:#2b3a72">${code}</p>
    <p>This code expires in 15 minutes and can only be used once. If you did not request it, you can safely ignore this email.</p>
    <p>Never share this code, your password, or your PIN.</p>
  </div>`;

authRouter.post('/recovery/request', async (req, res, next) => {
  try {
    const b = z.object({ email: recoveryEmail, purpose: recoveryPurpose }).parse(req.body);
    // Email-specific limiting gives a six-digit code no useful online guessing
    // window while keeping the response generic for both unknown and known users.
    await charge(`recovery:${b.email}`, 5, 900);
    const user = await one<any>(
      `select id, email, role, is_active from users
       where lower(email)=lower($1) and is_active=true and role <> 'admin' limit 1`, [b.email]
    );
    if (user?.email) {
      const id = randomUUID();
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await tx(async (c) => {
        await c.query(`update account_recovery_tokens set used_at=now()
                       where user_id=$1 and purpose=$2 and used_at is null`, [user.id, b.purpose]);
        await c.query(`insert into account_recovery_tokens
          (id,user_id,purpose,code_hash,expires_at) values ($1,$2,$3,$4,now()+interval '15 minutes')`,
          [id, user.id, b.purpose, recoveryDigest(id, code)]);
      });
      sendMailAsync({ to: user.email, subject: 'Your Sokoni Hub recovery code', html: recoveryMail(code, b.purpose), kind: 'account_recovery', entityId: id });
      await audit(user.id, 'user.recovery_requested', 'user', user.id, { purpose: b.purpose });
    }
    // 202 is intentional even when email delivery is disabled or the account
    // does not exist. It prevents user enumeration and future-proofs the app.
    res.status(202).json({ ok: true, message: 'If that email can receive recovery messages, a code has been sent.' });
  } catch (e) { next(e); }
});

authRouter.post('/recovery/complete', async (req, res, next) => {
  try {
    const b = z.object({
      email: recoveryEmail, purpose: recoveryPurpose, code: recoveryCode,
      new_password: z.string().min(12).max(72).optional(), new_pin: pinField.optional(),
    }).superRefine((value, ctx) => {
      if (value.purpose === 'password' && (!value.new_password || Buffer.byteLength(value.new_password, 'utf8') > 72))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['new_password'], message: 'Password must be 12–72 UTF-8 bytes' });
      if (value.purpose === 'pin' && !value.new_pin)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['new_pin'], message: 'PIN is required' });
    }).parse(req.body);
    await charge(`recovery-verify:${b.email}`, 10, 900);
    const outcome = await tx(async (c) => {
      const row = (await c.query<any>(`select r.*, u.id as uid, u.phone, u.role
        from account_recovery_tokens r join users u on u.id=r.user_id
        where lower(u.email)=lower($1) and r.purpose=$2 and r.used_at is null
          and r.expires_at>now() and u.is_active=true and u.role <> 'admin'
        order by r.created_at desc limit 1 for update of r`, [b.email, b.purpose])).rows[0];
      if (!row || !recoveryEqual(row.code_hash, recoveryDigest(row.id, b.code))) {
        if (row) await c.query(`update account_recovery_tokens set attempts=attempts+1,
          used_at=case when attempts+1 >= 5 then now() else used_at end where id=$1`, [row.id]);
        return null;
      }
      if (b.purpose === 'pin') {
        const weak = weakPinReason(b.new_pin!, row.phone);
        if (weak) throw new HttpError(422, weak);
        await c.query(`update users set pin_hash=$2, must_change_pin=false, pin_temp_expires_at=null,
          pin_failed_attempts=0, pin_lock_level=0, pin_locked_until=null, sessions_valid_from=now() where id=$1`,
          [row.uid, await hashPin(row.uid, b.new_pin!)]);
      } else {
        await c.query('update users set password_hash=$2, sessions_valid_from=now() where id=$1',
          [row.uid, await bcrypt.hash(b.new_password!, 10)]);
      }
      await c.query('update account_recovery_tokens set used_at=now() where id=$1', [row.id]);
      return { userId: row.uid };
    });
    if (!outcome) throw new HttpError(400, 'Invalid or expired recovery code');
    await audit(outcome.userId, 'user.recovery_completed', 'user', outcome.userId, { purpose: b.purpose });
    res.json({ ok: true });
  } catch (e) { next(e); }
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
    // Accounts that predate required email addresses may not yet have an email.
    // Do not lock those established users out; the migration marks all existing
    // email-bearing accounts as verified, while new registrations always have
    // an email and must verify it before signing in.
    if (user.role !== 'admin' && user.email && !user.email_verified_at)
      throw new HttpError(403, 'Verify your email address before signing in. Open your verification email or request a new link.');

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
