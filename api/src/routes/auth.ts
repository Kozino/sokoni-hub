import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, query } from '../db';
import { signToken, requireAuth } from '../auth';
import { HttpError, audit, normalizePhone } from '../utils';

export const authRouter = Router();

const registerSchema = z.object({
  full_name: z.string().min(2).max(120),
  phone: z.string().min(7).max(20),
  email: z.string().email().optional().nullable(),
  password: z.string().min(6).max(100),
  role: z.enum(['buyer', 'vendor']).default('buyer'),
});

authRouter.post('/register', async (req, res, next) => {
  try {
    const b = registerSchema.parse(req.body);
    const phone = normalizePhone(b.phone);
    const exists = await one('select id from users where phone = $1', [phone]);
    if (exists) throw new HttpError(409, 'An account with this phone number already exists');
    if (b.email) {
      const e = await one('select id from users where lower(email) = lower($1)', [b.email]);
      if (e) throw new HttpError(409, 'An account with this email already exists');
    }
    const hash = await bcrypt.hash(b.password, 10);
    const user = await one<any>(
      `insert into users (full_name, phone, email, password_hash, role)
       values ($1,$2,$3,$4,$5::user_role)
       returning id, full_name, phone, email, role, created_at`,
      [b.full_name.trim(), phone, b.email || null, hash, b.role]
    );
    await audit(user.id, 'user.register', 'user', user.id, { role: b.role });
    res.status(201).json({ token: signToken(user.id, user.role), user });
  } catch (e) {
    next(e);
  }
});

const loginSchema = z.object({
  identifier: z.string().min(3), // phone or email
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const b = loginSchema.parse(req.body);
    const phone = normalizePhone(b.identifier);
    const user = await one<any>(
      `select * from users where phone = $1 or lower(email) = lower($2) limit 1`,
      [phone, b.identifier]
    );
    if (!user) throw new HttpError(401, 'Invalid credentials');
    if (!(await bcrypt.compare(b.password, user.password_hash)))
      throw new HttpError(401, 'Invalid credentials');
    if (!user.is_active) throw new HttpError(403, 'Account disabled. Contact support.');

    const vendor = await one('select id, status, business_name, slug from vendors where user_id = $1', [
      user.id,
    ]);
    delete user.password_hash;
    await audit(user.id, 'user.login', 'user', user.id);
    res.json({ token: signToken(user.id, user.role), user, vendor });
  } catch (e) {
    next(e);
  }
});

authRouter.get('/me', requireAuth(), async (req, res, next) => {
  try {
    const vendor = await one('select * from vendors where user_id = $1', [req.user!.id]);
    res.json({ user: req.user, vendor });
  } catch (e) {
    next(e);
  }
});

authRouter.patch('/me', requireAuth(), async (req, res, next) => {
  try {
    const b = z
      .object({ full_name: z.string().min(2).optional(), email: z.string().email().nullable().optional() })
      .parse(req.body);
    const user = await one(
      `update users set full_name = coalesce($2, full_name), email = coalesce($3, email)
       where id = $1 returning id, full_name, phone, email, role`,
      [req.user!.id, b.full_name ?? null, b.email ?? null]
    );
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/change-password', requireAuth(), async (req, res, next) => {
  try {
    const b = z
      .object({ current_password: z.string(), new_password: z.string().min(6) })
      .parse(req.body);
    const row = await one<any>('select password_hash from users where id = $1', [req.user!.id]);
    if (!(await bcrypt.compare(b.current_password, row.password_hash)))
      throw new HttpError(400, 'Current password is incorrect');
    await query('update users set password_hash = $2 where id = $1', [
      req.user!.id,
      await bcrypt.hash(b.new_password, 10),
    ]);
    await audit(req.user!.id, 'user.password_change', 'user', req.user!.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
