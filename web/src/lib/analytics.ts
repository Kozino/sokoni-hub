/**
 * Google Analytics 4, loaded only after the visitor accepts analytics cookies.
 * Nothing is loaded and no banner is shown unless VITE_GA_MEASUREMENT_ID is set at build time.
 */
export const GA_ID = ((import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || '').trim();
export const analyticsAvailable = /^G-[A-Z0-9]{4,}$/i.test(GA_ID);

const KEY = 'sokoni-consent';
export const OPEN_EVENT = 'sokoni-cookie-settings';
export type Consent = 'granted' | 'denied' | null;

export function getConsent(): Consent {
  try { const v = window.localStorage.getItem(KEY); return v === 'granted' || v === 'denied' ? v : null; } catch { return null; }
}
export function setConsent(value: 'granted' | 'denied') {
  try { window.localStorage.setItem(KEY, value); } catch { /* private mode: choice lasts for this page view only */ }
  if (value === 'denied') disableAnalytics();
}
export const openCookieSettings = () => window.dispatchEvent(new Event(OPEN_EVENT));

/** Pages that are private or carry tokens are never reported. */
const PRIVATE = ['/admin', '/vendor', '/account', '/delete-account', '/verify-email', '/login', '/register'];
export const isPrivatePath = (path: string) => PRIVATE.some((p) => path === p || path.startsWith(`${p}/`));

declare global { interface Window { dataLayer: unknown[]; gtag: (...args: unknown[]) => void; [k: string]: unknown } }

let loaded = false;
export function loadAnalytics() {
  if (!analyticsAvailable || loaded || typeof document === 'undefined') return;
  loaded = true;
  window[`ga-disable-${GA_ID}`] = false;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, {
    send_page_view: false,
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(script);
}

export function trackPageView(path: string) {
  if (!analyticsAvailable || !loaded || typeof window.gtag !== 'function') return;
  window.gtag('event', 'page_view', { page_path: path, page_location: `${window.location.origin}${path}`, page_title: document.title });
}

/** Stops measurement and removes the Google cookies this site may have set. */
export function disableAnalytics() {
  if (!analyticsAvailable) return;
  window[`ga-disable-${GA_ID}`] = true;
  const host = window.location.hostname;
  const parts = host.split('.');
  const domains = ['', host, `.${host}`, parts.length > 2 ? `.${parts.slice(-2).join('.')}` : ''];
  document.cookie.split(';').map((c) => c.trim().split('=')[0]).filter((n) => n === '_ga' || n.startsWith('_ga_')).forEach((name) => {
    domains.forEach((d) => { document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d ? `; domain=${d}` : ''}`; });
  });
}
