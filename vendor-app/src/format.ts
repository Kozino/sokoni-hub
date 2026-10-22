/** Shared display helpers. Money is always shown as "QAR 1,420" (whole riyals unless there are fils). */

export function qar(value: number | string | null | undefined): string {
  const n = Number(value || 0);
  const sign = n < 0 ? '-' : '';
  const [whole, frac] = Math.abs(n).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `QAR ${sign}${grouped}${frac === '00' ? '' : `.${frac}`}`;
}

/** Qatar is UTC+3 all year, so a fixed offset is exact and avoids Intl time-zone support. */
const DOHA_OFFSET_MS = 3 * 60 * 60 * 1000;

/** The Doha calendar day of an ISO timestamp, as YYYY-MM-DD. */
export function dohaDay(iso: string | Date): string {
  const t = typeof iso === 'string' ? new Date(iso).getTime() : iso.getTime();
  return new Date(t + DOHA_OFFSET_MS).toISOString().slice(0, 10);
}

export function dohaToday(now = Date.now()): string {
  return dohaDay(new Date(now));
}

/** Short time in Doha, e.g. "16:00". */
export function dohaTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + DOHA_OFFSET_MS);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** Initials for an avatar: "Bella Hairs" -> "BH". */
export function initialsOf(text: string): string {
  return text.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || 'S';
}
