/**
 * Small, dependency-free formatting helpers shared by every screen.
 *
 * Dates are rendered in Qatar time (UTC+3, no daylight saving) without relying on Intl time-zone
 * support, so a booking or order reads the same for the buyer and the seller wherever the phone is.
 */
import type { Listing } from './types';

const QATAR_OFFSET_MS = 3 * 3_600_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const valid = (value?: string | number | Date | null): value is string | number | Date => {
  if (value === undefined || value === null || value === '') return false;
  return !Number.isNaN(new Date(value).getTime());
};
/** A Date whose UTC fields hold the Qatar wall-clock time. */
const wall = (value: string | number | Date) => new Date(new Date(value).getTime() + QATAR_OFFSET_MS);
const dayNumber = (value: string | number | Date) => Math.floor(wall(value).getTime() / 86_400_000);

/** "38", "37.50", "1,250" — whole numbers drop the decimals, everything else keeps two. */
export function num(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0';
  const text = Number.isInteger(n) ? String(n) : n.toFixed(2);
  const [whole, fraction] = text.split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? `.${fraction}` : '');
}
/** "38 QAR" */
export const money = (value: number | string | null | undefined, currency = 'QAR') => `${num(value)} ${currency}`;

export const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** "Doha, Qatar" -> "Doha"; collapses the stray whitespace some sellers typed into their city. */
export const cleanCity = (value?: string | null) => String(value ?? '').replace(/\s+/g, ' ').trim();

/**
 * The API matches `city` with ILIKE and no wildcards, so "Doha" would miss a seller saved as "Doha ".
 * A trailing % makes the filter forgiving while still being exactly the city the buyer picked.
 */
export const cityParam = (value?: string | null) => {
  const city = cleanCity(value);
  return city ? `${city.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : '';
};

/** Unique, trimmed, sorted city names (the API returns "Doha" and "Doha " as two rows). */
export function uniqueCities(raw: string[]): string[] {
  const seen = new Map<string, string>();
  raw.forEach((city) => {
    const clean = cleanCity(city);
    if (clean && !seen.has(clean.toLowerCase())) seen.set(clean.toLowerCase(), clean);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function initials(name?: string | null, fallback = 'S') {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/* ---------------------------------------------------------------------------------------- dates */
export function time12(value?: string | null) {
  if (!valid(value)) return '';
  const d = wall(value);
  const h = d.getUTCHours();
  return `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
export function time24(value?: string | null) {
  if (!valid(value)) return '';
  const d = wall(value);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
/** "Oct 24" (adds the year when it is not the current one). */
export function shortDate(value?: string | null) {
  if (!valid(value)) return '';
  const d = wall(value);
  const sameYear = d.getUTCFullYear() === wall(Date.now()).getUTCFullYear();
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${sameYear ? '' : `, ${d.getUTCFullYear()}`}`;
}
/** "Saturday, Oct 28" */
export function longDate(value?: string | null) {
  if (!valid(value)) return '';
  const d = wall(value);
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
/** "today", "yesterday", "tomorrow" or "Oct 24". */
export function relativeDay(value?: string | null) {
  if (!valid(value)) return '';
  const diff = dayNumber(value) - dayNumber(Date.now());
  if (diff === 0) return 'today';
  if (diff === -1) return 'yesterday';
  if (diff === 1) return 'tomorrow';
  return shortDate(value);
}
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** "Placed today · 2:40 PM" */
export const placedLabel = (value?: string | null, verb = 'Placed') => (valid(value) ? `${verb} ${relativeDay(value)} · ${time12(value)}` : '');
/** "Today · 2:40 PM", "Oct 24 · 2:40 PM" */
export const dayTime = (value?: string | null) => (valid(value) ? `${cap(relativeDay(value))} · ${time12(value)}` : '');

/** "5 min ago", "3 h ago", "Yesterday", "Oct 24". */
export function timeAgo(value?: string | null) {
  if (!valid(value)) return '';
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 12 || dayNumber(value) === dayNumber(Date.now())) return `${Math.floor(mins / 60)} h ago`;
  return cap(relativeDay(value));
}

/** 90 -> "1 hr 30 min", 210 -> "3.5 hrs", 45 -> "45 min". */
export function durationLabel(mins?: number | string | null) {
  const total = Number(mins);
  if (!Number.isFinite(total) || total <= 0) return '';
  if (total < 60) return `${Math.round(total)} min`;
  const hours = total / 60;
  if (Number.isInteger(hours)) return hours === 1 ? '1 hr' : `${hours} hrs`;
  if (total % 30 === 0) return `${hours} hrs`;
  return `${Math.floor(hours)} hr ${Math.round(total % 60)} min`;
}
export const minutesBetween = (from?: string | null, to?: string | null) =>
  valid(from) && valid(to) ? Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000) : 0;

/* ------------------------------------------------------------------------------------- ratings */
/** A listing's own rating when it has reviews, otherwise its seller's. null when nobody has rated yet. */
export function ratingOf(listing: Partial<Listing>): { avg: number; count: number } | null {
  const own = Number(listing.rating_count || 0);
  if (own > 0) return { avg: Number(listing.rating_avg || 0), count: own };
  const vendor = Number(listing.vendor_rating_count || 0);
  if (vendor > 0) return { avg: Number(listing.vendor_rating_avg || 0), count: vendor };
  return null;
}

/* -------------------------------------------------------------------------------------- phones */
export function phoneDigits(phone?: string | null) {
  let digits = String(phone ?? '').replace(/\D/g, '').replace(/^00/, '');
  if (digits.length === 8) digits = `974${digits}`; // a bare Qatar number
  return digits;
}
export const whatsappUrl = (phone?: string | null, text?: string) => {
  const digits = phoneDigits(phone);
  return digits.length >= 9 ? `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}` : '';
};
export const telUrl = (phone?: string | null) => {
  const digits = phoneDigits(phone);
  return digits ? `tel:+${digits}` : '';
};

/* ------------------------------------------------------------------------------------ distance */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const distanceLabel = (km: number) => (km < 1 ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`);
