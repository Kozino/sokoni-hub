/**
 * Qatar mobile numbers (Ooredoo or Vodafone).
 *
 * CRA closed plan: +974 + 8-digit national number. Mobile ranges start with
 * 3, 5, 6 or 7 (Ooredoo historically 33/55/66, Vodafone 77 and later 3/5/7
 * blocks). Landlines start with 4 and are rejected. Number portability means
 * a prefix is not proof of today's operator, but every consumer mobile in
 * Qatar is one of those two networks.
 */
import { HttpError } from './utils';

export const QA_CC = '974';
export const QA_MOBILE_ERROR =
  'Use a Qatar mobile number (Ooredoo or Vodafone), for example +974 5512 3456.';

export function digitsOnly(raw: string): string {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  return d;
}

/** 8-digit national mobile, or null if this is not a Qatar Ooredoo/Vodafone mobile. */
export function qatarNationalMobile(raw: string): string | null {
  let d = digitsOnly(raw);
  if (d.startsWith(QA_CC)) d = d.slice(QA_CC.length);
  if (d.length === 9 && d.startsWith('0')) d = d.slice(1);
  if (!/^[3567]\d{7}$/.test(d)) return null;
  return d;
}

/** Canonical stored form: 974XXXXXXXX. */
export function canonicalQatarMobile(raw: string): string | null {
  const n = qatarNationalMobile(raw);
  return n ? QA_CC + n : null;
}

export function isQatarMobile(raw: string): boolean {
  return canonicalQatarMobile(raw) !== null;
}

export function requireQatarMobile(raw: string): string {
  const c = canonicalQatarMobile(raw);
  if (!c) throw new HttpError(422, QA_MOBILE_ERROR);
  return c;
}

/** Forms that may already be stored for this number (8-digit local and 974…). */
export function phoneLookupValues(raw: string): string[] {
  const d = digitsOnly(raw);
  const out = new Set<string>();
  if (d) out.add(d);
  const c = canonicalQatarMobile(raw);
  if (c) {
    out.add(c);
    out.add(c.slice(QA_CC.length));
  }
  return [...out];
}
