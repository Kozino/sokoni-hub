import { query } from './db';

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'item';

export const randomCode = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

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

export async function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  meta: Record<string, unknown> = {}
) {
  try {
    await query(
      'insert into audit_log (actor_id, action, entity, entity_id, meta) values ($1,$2,$3,$4,$5)',
      [actorId, action, entity, entityId ?? null, JSON.stringify(meta)]
    );
  } catch (e) {
    console.error('[audit] failed', (e as Error).message);
  }
}

export const waLink = (phone: string, text: string) =>
  `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
