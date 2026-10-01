import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { analyticsAvailable, getConsent, isPrivatePath, loadAnalytics, OPEN_EVENT, setConsent, trackPageView, type Consent } from '../lib/analytics';
import './CookieConsent.css';

/** Consent banner + page-view reporting. Renders nothing unless Google Analytics is configured. */
export default function CookieConsent() {
  const { pathname } = useLocation();
  const [consent, setChoice] = useState<Consent>(() => (typeof window === 'undefined' ? null : getConsent()));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!analyticsAvailable) return undefined;
    if (getConsent() === null) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  useEffect(() => { if (consent === 'granted') loadAnalytics(); }, [consent]);
  useEffect(() => { if (consent === 'granted' && !isPrivatePath(pathname)) trackPageView(pathname); }, [consent, pathname]);

  if (!analyticsAvailable || !open) return null;
  const choose = (value: 'granted' | 'denied') => { setConsent(value); setChoice(value); setOpen(false); };

  return (
    <div className="cookie-banner" role="dialog" aria-modal="false" aria-labelledby="cookie-title">
      <div className="cookie-banner-text">
        <strong id="cookie-title">Cookies on Sokoni Hub</strong>
        <p>We use essential storage to keep you signed in and remember your cart. With your permission we also use Google Analytics cookies to see which pages are useful. No advertising cookies. <Link to="/cookies">Cookie Policy</Link></p>
      </div>
      <div className="cookie-banner-actions">
        <button type="button" className="cookie-btn cookie-btn-ghost" onClick={() => choose('denied')}>Essential only</button>
        <button type="button" className="cookie-btn cookie-btn-primary" onClick={() => choose('granted')}>Accept analytics</button>
      </div>
    </div>
  );
}
