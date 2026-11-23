/** Qatar mobile (Ooredoo / Vodafone). Keep in step with api/src/phoneQa.ts. */
export const QA_CC = '974';
export const QA_MOBILE_ERROR =
  'Use a Qatar mobile number (Ooredoo or Vodafone), for example 5512 3456.';

export function digitsOnly(raw: string): string {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  return d;
}

export function qatarNationalMobile(raw: string): string | null {
  let d = digitsOnly(raw);
  if (d.startsWith(QA_CC)) d = d.slice(QA_CC.length);
  if (d.length === 9 && d.startsWith('0')) d = d.slice(1);
  if (!/^[3567]\d{7}$/.test(d)) return null;
  return d;
}

export function canonicalQatarMobile(raw: string): string | null {
  const n = qatarNationalMobile(raw);
  return n ? QA_CC + n : null;
}

export function isQatarMobile(raw: string): boolean {
  return canonicalQatarMobile(raw) !== null;
}
