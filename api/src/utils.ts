import type { RequestParamHandler } from 'express';
import type { AuthUser } from './auth';
import { query } from './db';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Shared UUID route-param guard. Register this on every router that exposes
 * `:id` so malformed IDs fail as a client error before PostgreSQL sees them.
 */
export const validateUuidParam: RequestParamHandler = (_req, _res, next, value) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    return next(new HttpError(400, 'Invalid ID parameter'));
  next();
};

/**
 * Compare secrets without an early-exit string comparison. Hashing first gives
 * timingSafeEqual same-size buffers even when a supplied secret has a different
 * length from the configured one.
 */
export const secretsEqual = (expected: string, supplied: string) =>
  timingSafeEqual(
    createHash('sha256').update(expected).digest(),
    createHash('sha256').update(supplied).digest()
  );

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'item';

export const randomCode = (prefix: string) =>
  `${prefix}-${randomBytes(16).toString('hex').toUpperCase()}`;

/** Normalise a phone to digits only, keeping country code. */
export const normalizePhone = (p: string) => p.replace(/[^\d]/g, '');

let cache: { words: string[]; at: number } = { words: [], at: 0 };

export async function bannedKeywords(): Promise<string[]> {
  if (Date.now() - cache.at < 5 * 60_000 && cache.words.length) return cache.words;
  const rows = await query<{ word: string }>('select word from banned_keywords');
  cache = { words: rows.map((r) => r.word.toLowerCase()), at: Date.now() };
  return cache.words;
}

/** Returns the offending word if prohibited content is detected. */
export async function screenProhibited(...texts: (string | null | undefined)[]): Promise<string | null> {
  const hay = texts.filter(Boolean).join(' ').toLowerCase();
  for (const w of await bannedKeywords()) {
    const re = new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i');
    if (re.test(hay)) return w;
  }
  return null;
}

type AuditActor = Pick<AuthUser, 'id' | 'impersonated_by'>;

/**
 * Record an auditable action. For an impersonated session actor_id remains the
 * effective account, while impersonated_by identifies the administrator who
 * actually initiated the request. Audit readers render that relationship
 * explicitly instead of attributing the action to the viewed account.
 */
export async function audit(
  actor: string | AuditActor | null,
  action: string,
  entity: string,
  entityId?: string | null,
  meta: Record<string, unknown> = {}
) {
  const actorId = typeof actor === 'string' ? actor : actor?.id ?? null;
  const impersonatedBy = typeof actor === 'string' ? null : actor?.impersonated_by ?? null;
  try {
    await query(
      `insert into audit_log (actor_id, impersonated_by, action, entity, entity_id, meta)
       values ($1,$2,$3,$4,$5,$6)`,
      [actorId, impersonatedBy, action, entity, entityId ?? null, JSON.stringify(meta)]
    );
  } catch (e) {
    console.error('[audit] failed', (e as Error).message);
  }
}

export const waLink = (phone: string, text: string) =>
  `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
