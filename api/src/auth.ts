import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { one } from './db';
import { randomUUID } from 'crypto';
import { HttpError } from './utils';

export type Role = 'buyer' | 'vendor' | 'admin';

export interface AuthUser {
  id: string;
  role: Role;
  full_name: string;
  phone: string;
  email: string | null;
  is_active: boolean;
  session_id?: string;
  session_version?: number;
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

export const signToken = async (
 userId: string, role: Role,
 opts?: { expiresIn?: string; impersonatedBy?: string; parentSessionId?: string; label?: string; expectedVersion?: number }
) => {
 const u = await one<any>('select session_version,role,is_active from users where id=$1',[userId]);
 if(!u?.is_active || u.role!==role || (opts?.expectedVersion!==undefined && opts.expectedVersion!==u.session_version)) throw new HttpError(401,'Sign in again');
 const sid=randomUUID();
 const token=jwt.sign({sub:userId,role,ver:u.session_version,sid,...(opts?.impersonatedBy?{imp:opts.impersonatedBy}:{})},
 config.jwtSecret,{algorithm:'HS256',expiresIn:opts?.expiresIn??config.jwtExpires} as jwt.SignOptions);
 const p=jwt.decode(token) as jwt.JwtPayload;
 await one(`insert into auth_sessions(id,user_id,version,expires_at,impersonated_by,parent_session_id,label)
 values($1,$2,$3,to_timestamp($4),$5,$6,$7) returning id`,
 [sid,userId,u.session_version,p.exp,opts?.impersonatedBy??null,opts?.parentSessionId??null,(opts?.label||'Web session').slice(0,120)]);
 return token;
};

async function loadUser(req: Request): Promise<AuthUser | null> {
 const header=req.headers.authorization;
 if(!header?.startsWith('Bearer ')) return null;
 let p: any;
 try {p=jwt.verify(header.slice(7),config.jwtSecret,{algorithms:['HS256']});} catch{return null;}
 if(!p.sid || !Number.isInteger(p.ver) || !p.exp) return null;
 const u=await one<AuthUser & {impersonated_by:string|null}>(`
 select u.id,u.role,u.full_name,u.phone,u.email,u.is_active,u.session_version,
 s.id as session_id,s.impersonated_by from users u join auth_sessions s on s.user_id=u.id
 where u.id=$1 and s.id=$2 and u.session_version=$3 and s.version=$3
 and s.revoked_at is null and s.expires_at>now()
 and (s.impersonated_by is null or exists(
 select 1 from auth_sessions parent join users admin on admin.id=parent.user_id
 where parent.id=s.parent_session_id and parent.user_id=s.impersonated_by
 and parent.revoked_at is null and parent.expires_at>now() and parent.version=admin.session_version
 and admin.is_active and admin.role='admin'))`,[p.sub,p.sid,p.ver]);
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
 * Blocks a specific sensitive action while an admin is viewing as another
 * user. Kept for routers which may also be mounted independently in tests;
 * the application-wide write guard below is the primary protection.
 */
export function blockImpersonation(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.impersonated_by)
    return next(new HttpError(403, 'Not available while viewing as another user'));
  next();
}

/**
 * "View as" is strictly read-only. This is intentionally applied once, after
 * optionalAuth, rather than relying on every individual write route to remember
 * blockImpersonation. GET remains available so an administrator can inspect
 * exactly what the viewed account sees.
 */
export function blockImpersonatedWrites(req: Request, _res: Response, next: NextFunction) {
  if (req.method !== 'GET' && req.user?.impersonated_by)
    return next(new HttpError(403, 'Viewing as another user is read-only'));
  next();
}
