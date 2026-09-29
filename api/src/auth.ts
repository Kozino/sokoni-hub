import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { one } from './db';
import { HttpError } from './utils';

export type Role = 'buyer' | 'vendor' | 'admin';

export interface AuthUser {
  id: string;
  role: Role;
  full_name: string;
  phone: string;
  email: string | null;
  is_active: boolean;
  /** Set when an admin is viewing as this user; holds the admin's user id. */
  impersonated_by?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      vendor?: { id: string; status: string; business_name: string; low_stock_threshold: number };
    }
  }
}

export const signToken = (
  userId: string,
  role: Role,
  opts?: { expiresIn?: string; impersonatedBy?: string }
) =>
  jwt.sign(
    { sub: userId, role, ...(opts?.impersonatedBy ? { imp: opts.impersonatedBy } : {}) },
    config.jwtSecret,
    { expiresIn: opts?.expiresIn ?? config.jwtExpires } as jwt.SignOptions
  );

async function loadUser(req: Request): Promise<AuthUser | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;

  // A bad, expired or forged token is genuinely "not authenticated".
  let payload: { sub: string; imp?: string };
  try {
    payload = jwt.verify(header.slice(7), config.jwtSecret) as { sub: string; imp?: string };
  } catch {
    return null;
  }

  // A database failure is NOT an authentication failure, and must not be
  // swallowed into a null. The web client clears the stored token on any 401,
  // so reporting a transient DB blip as 401 silently signs every active user
  // out — exactly when the database is already struggling. Let it throw and
  // surface as a 5xx the client will retry instead.
  const u = await one<AuthUser>(
    'select id, role, full_name, phone, email, is_active from users where id = $1',
    [payload.sub]
  );
  if (u && payload.imp) u.impersonated_by = payload.imp;
  return u;
}

/** Attaches req.user when a valid token is present, never fails. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const u = await loadUser(req);
    if (u && u.is_active) req.user = u;
  } catch {
    // Public routes must stay up even if the user lookup fails; the request
    // simply proceeds as anonymous. Routes that require a user call
    // requireAuth, which re-runs the lookup and propagates the real error.
  }
  next();
}

export function requireAuth(...roles: Role[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const u = req.user ?? (await loadUser(req));
      if (!u) throw new HttpError(401, 'Authentication required');
      if (!u.is_active) throw new HttpError(403, 'Account disabled');
      if (roles.length && !roles.includes(u.role)) throw new HttpError(403, 'Insufficient permissions');
      req.user = u;
      next();
    } catch (e) {
      next(e);
    }
  };
}

/** Must come after requireAuth('vendor'). Loads the vendor profile. */
export async function loadVendor(req: Request, _res: Response, next: NextFunction) {
  try {
    const v = await one<{ id: string; status: string; business_name: string; low_stock_threshold: number }>(
      'select id, status, business_name, low_stock_threshold from vendors where user_id = $1',
      [req.user!.id]
    );
    if (!v) throw new HttpError(404, 'Vendor profile not found. Complete onboarding first.');
    req.vendor = v;
    next();
  } catch (e) {
    next(e);
  }
}

/** Blocks vendors that are not verified from write actions. */
export function requireVerifiedVendor(req: Request, _res: Response, next: NextFunction) {
  const s = req.vendor?.status;
  if (s === 'verified') return next();
  const msg =
    s === 'pending'
      ? 'Your store is awaiting admin verification. You cannot publish yet.'
      : s === 'rejected'
      ? 'Your verification was rejected. Please update your details and resubmit.'
      : 'Your store is suspended. Contact support.';
  next(new HttpError(403, msg));
}

/**
 * Must come after requireAuth. Blocks sensitive actions (password, email,
 * payout details) while an admin is viewing as another user.
 */
export function blockImpersonation(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.impersonated_by)
    return next(new HttpError(403, 'Not available while viewing as another user'));
  next();
}
