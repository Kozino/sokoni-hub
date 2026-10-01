import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import './styles/AnalyticsConsent.css';

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

type Consent = 'accepted' | 'rejected' | null;

const CONSENT_COOKIE = 'sokoni_analytics_consent';
const ONE_YEAR = 60 * 60 * 24 * 365;
const rawContainerId = (import.meta.env.VITE_GTM_CONTAINER_ID || '').trim();

/** A GTM container ID is public but validate it so a mistaken GA4 G- ID never loads. */
export const analyticsConfigured = /^GTM-[A-Z0-9]+$/i.test(rawContainerId);
export const gtmContainerId = analyticsConfigured ? rawContainerId.toUpperCase() : '';

const privatePath = (pathname: string) =>
  pathname === '/login' ||
  pathname === '/register' ||
  pathname === '/verify-email' ||
  pathname === '/account' ||
  pathname === '/delete-account' ||
  pathname.startsWith('/vendor') ||
  pathname.startsWith('/admin');

const readConsent = (): Consent => {
  if (typeof document === 'undefined') return null;
  const value = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${CONSENT_COOKIE}=`))
    ?.split('=')[1];
  return value === 'accepted' || value === 'rejected' ? value : null;
};

const writeConsent = (value: Exclude<Consent, null>) => {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax${secure}`;
};

const clearGoogleAnalyticsCookies = () => {
  // The container ID does not reveal the GA4 measurement ID, so clear the
  // standard first-party cookie names on both host and parent domain forms.
  const root = location.hostname.split('.').slice(-2).join('.');
  const domains = ['', `; Domain=${location.hostname}`, root !== location.hostname ? `; Domain=.${root}` : ''];
  for (const name of ['_ga', '_gid']) {
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; Path=/${domain}`;
  }
  document.cookie.split(';').map((item) => item.trim().split('=')[0]).filter((name) => name.startsWith('_ga_'))
    .forEach((name) => domains.forEach((domain) => { document.cookie = `${name}=; Max-Age=0; Path=/${domain}`; }));
};

let gtmLoaded = false;
let lastPageKey = '';

const loadContainer = () => {
  if (!analyticsConfigured || gtmLoaded || typeof document === 'undefined') return;
  gtmLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmContainerId)}`;
  script.dataset.sokoniGtm = gtmContainerId;
  document.head.appendChild(script);
};

const trackPage = (pathname: string, search: string) => {
  const pageKey = `${pathname}${search}`;
  if (!analyticsConfigured || pageKey === lastPageKey) return;
  lastPageKey = pageKey;
  window.dataLayer = window.dataLayer || [];
  // Configure the GA4 tag in GTM to fire only on this custom event. This
  // prevents GTM from auto-reporting account, sign-in, vendor, or admin views.
  window.dataLayer.push({
    event: 'sokoni_page_view',
    page_path: pathname,
    page_location: `${location.origin}${pageKey}`,
    page_title: document.title,
  });
};

interface AnalyticsContextValue {
  configured: boolean;
  consent: Consent;
  openSettings: () => void;
  choose: (value: Exclude<Consent, null>) => void;
}

const AnalyticsContext = createContext<AnalyticsContextValue>({
  configured: analyticsConfigured,
  consent: null,
  openSettings: () => {},
  choose: () => {},
});

export const useAnalyticsConsent = () => useContext(AnalyticsContext);

function ConsentBanner({ open, onChoose, onClose }: { open: boolean; onChoose: (value: Exclude<Consent, null>) => void; onClose: () => void }) {
  if (!open) return null;
  return (
    <aside className="analytics-consent" role="dialog" aria-modal="false" aria-labelledby="analytics-consent-title">
      <div className="analytics-consent-copy">
        <strong id="analytics-consent-title">Cookie settings</strong>
        <p>We use optional analytics cookies to understand how public marketplace pages are used. They are off unless you accept.</p>
      </div>
      <div className="analytics-consent-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => { onChoose('rejected'); onClose(); }}>Reject analytics</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { onChoose('accepted'); onClose(); }}>Accept analytics</button>
      </div>
    </aside>
  );
}

/**
 * GTM is never in index.html. It is injected only after consent and only sends
 * explicit public-route page-view events. Private/account/dashboard routes are
 * excluded even after the container has been loaded during the same SPA visit.
 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const [consent, setConsent] = useState<Consent>(readConsent);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const excluded = privatePath(pathname);

  const choose = (value: Exclude<Consent, null>) => {
    writeConsent(value);
    setConsent(value);
    window.dataLayer?.push({ event: 'sokoni_analytics_consent', analytics_consent: value });
    if (value === 'rejected') {
      lastPageKey = '';
      clearGoogleAnalyticsCookies();
    }
  };

  useEffect(() => {
    if (!analyticsConfigured || consent !== 'accepted' || excluded) return;
    loadContainer();
    trackPage(pathname, search);
  }, [consent, excluded, pathname, search]);

  const value: AnalyticsContextValue = {
    configured: analyticsConfigured,
    consent,
    openSettings: () => setSettingsOpen(true),
    choose,
  };

  const showFirstVisitBanner = analyticsConfigured && !excluded && consent === null && !settingsOpen;
  const showSettings = analyticsConfigured && !excluded && settingsOpen;

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
      <ConsentBanner open={showFirstVisitBanner || showSettings} onChoose={choose} onClose={() => setSettingsOpen(false)} />
    </AnalyticsContext.Provider>
  );
}
