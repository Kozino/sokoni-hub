import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { useCart } from '../state/CartContext';
import { ThemeToggle } from '../state/ThemeContext';
import LanguageSwitcher from './LanguageSwitcher';
import { useT } from '../i18n';
import { useAnalyticsConsent } from '../analytics';
import '../styles/MarketplaceTemplate.css';

const initialsOf = (name?: string) =>
  (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** True on phones (same 640px breakpoint the stylesheet uses for the mobile menu). */
function useIsPhone() {
  const query = '(max-width: 640px)';
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setPhone(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  return phone;
}

/** Desktop/tablet: avatar + dropdown. */
function ProfileMenu({ onNavigate }: { onNavigate: () => void }) {
  const { user, vendor, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key); };
  }, [open]);

  if (!user) return null;
  const go = (to: string) => { setOpen(false); onNavigate(); nav(to); };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        style={{ width: 34, height: 34 }}
      >
        <span className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{initialsOf(user.full_name)}</span>
      </button>
      {open && (
        <div className="menu menu-right" role="menu">
          <div className="menu-label">{user.full_name}</div>
          {user.role === 'admin' && <button className="menu-item" role="menuitem" onClick={() => go('/admin')}>Admin dashboard</button>}
          {user.role === 'vendor' && vendor && <button className="menu-item" role="menuitem" onClick={() => go('/vendor')}>My store</button>}
          {user.role === 'vendor' && !vendor && <button className="menu-item" role="menuitem" onClick={() => go('/vendor/onboard')}>Finish setup</button>}
          {user.role === 'vendor' && vendor && <button className="menu-item" role="menuitem" onClick={() => go('/vendor/profile')}>Store profile</button>}
          {user.role === 'buyer' && <button className="menu-item" role="menuitem" onClick={() => go('/account')}>My account</button>}
          <button className="menu-item" role="menuitem" onClick={() => go('/support')}>Support</button>
          <div className="menu-sep" />
          <button className="menu-item danger" role="menuitem" onClick={() => { logout(); setOpen(false); onNavigate(); nav('/'); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

/**
 * Phones only: the account section is part of the menu itself, as plain
 * full-width rows. A dropdown inside a scrolling menu gets clipped, which is
 * what hid "Support" and "Sign out". Sign out is always the last row.
 */
function MobileAccount({ onNavigate }: { onNavigate: () => void }) {
  const { user, vendor, logout } = useAuth();
  const nav = useNavigate();
  if (!user) return null;

  return (
    <div className="nav-account">
      <div className="nav-account-who">
        <span className="avatar">{initialsOf(user.full_name)}</span>
        <div>
          <strong>{user.full_name}</strong>
          <span>{user.role}</span>
        </div>
      </div>

      {user.role === 'admin' && <NavLink to="/admin" onClick={onNavigate}>Admin dashboard</NavLink>}
      {user.role === 'vendor' && vendor && <NavLink to="/vendor" onClick={onNavigate}>My store</NavLink>}
      {user.role === 'vendor' && vendor && <NavLink to="/vendor/profile" onClick={onNavigate}>Store profile</NavLink>}
      {user.role === 'vendor' && !vendor && <NavLink to="/vendor/onboard" onClick={onNavigate}>Finish setup</NavLink>}
      {user.role === 'buyer' && <NavLink to="/account" onClick={onNavigate}>My account</NavLink>}

      <button
        type="button"
        className="linkish danger"
        onClick={() => { logout(); onNavigate(); nav('/'); }}
      >
        Sign out
      </button>
    </div>
  );
}

/** Modern line cart icon (24px grid, 1.9 stroke, round joins). */
function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block' }}>
      <circle cx="8" cy="21" r="1.4" />
      <circle cx="19" cy="21" r="1.4" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
}

/**
 * Cart link with live item badge. Rendered twice by Header: once inside the
 * desktop nav and once beside the burger on phones (CSS shows only one).
 */
function CartLink({ variant, onClick }: { variant: 'desktop' | 'mobile'; onClick?: () => void }) {
  const t = useT();
  const { count } = useCart();
  const label = count > 0 ? `${t('nav.cart')} (${count})` : t('nav.cart');
  return (
    <Link to="/cart" className={`cart-btn cart-btn--${variant}`} onClick={onClick} aria-label={label}>
      <CartIcon />
      {count > 0 && <span className="cart-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
    </Link>
  );
}

export function Header() {
  const t = useT();
  const { user, vendor } = useAuth();
  const isPhone = useIsPhone();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // NavLink ignores the query string, so /browse and /browse?kind=service
  // would both look active. Decide it here instead.
  const { pathname, search } = useLocation();
  const onBrowse = pathname === '/browse';
  const servicesActive = onBrowse && new URLSearchParams(search).get('kind') === 'service';
  const browseActive = onBrowse && !servicesActive;

  return (
    <>
      <div className="market-announcement" role="status">
        <div className="container"><strong>SHOP LOCAL.</strong>&nbsp; Discover verified foodstuff sellers and service providers across Qatar.</div>
      </div>
      <header className="header">
        <div className="container header-inner">
        <Link to="/" className="brand" onClick={close}>
          <img src="/logo.png" alt="Sokoni Hub" />
          <span>Sokoni Hub<small>Sell beyond status</small></span>
        </Link>
        <div className="header-mobile-actions">
          <CartLink variant="mobile" onClick={close} />
          <button className="burger" onClick={() => setOpen((o) => !o)} aria-label={t('nav.menu')} aria-expanded={open}>☰</button>
        </div>
        <nav className={`nav${open ? ' open' : ''}`}>
          <Link to="/browse" className={browseActive ? 'active' : undefined}
                aria-current={browseActive ? 'page' : undefined} onClick={close}>
            {t('nav.browse')}
          </Link>
          <Link to="/browse?kind=service" className={servicesActive ? 'active' : undefined}
                aria-current={servicesActive ? 'page' : undefined} onClick={close}>
            {t('nav.services')}
          </Link>
          <NavLink to="/vendors" onClick={close}>{t('nav.stores')}</NavLink>
          <NavLink to="/support" onClick={close}>{t('nav.support')}</NavLink>
          <CartLink variant="desktop" onClick={close} />

          {!user && (
            <>
              <NavLink to="/login" onClick={close}>{t('nav.login')}</NavLink>
              <Link to="/sell" className="btn btn-primary btn-sm" onClick={close}>{t('nav.startSelling')}</Link>
            </>
          )}

          {/* Role links in the top bar: desktop/tablet only. On phones they live in MobileAccount. */}
          {user && !isPhone && (
            <>
              {user.role === 'admin' && <NavLink to="/admin" onClick={close}>{t('nav.admin')}</NavLink>}
              {user.role === 'vendor' && vendor && <NavLink to="/vendor" onClick={close}>{t('nav.myStore')}</NavLink>}
              {user.role === 'vendor' && !vendor && <NavLink to="/vendor/onboard" onClick={close}>Finish setup</NavLink>}
              {user.role === 'buyer' && <NavLink to="/account" onClick={close}>{t('nav.account')}</NavLink>}
            </>
          )}

          <LanguageSwitcher compact />
          <ThemeToggle />

          {user && (isPhone ? <MobileAccount onNavigate={close} /> : <ProfileMenu onNavigate={close} />)}
          </nav>
        </div>
      </header>
    </>
  );
}

export function Footer() {
  const t = useT();
  const { configured: analyticsConfigured, openSettings } = useAnalyticsConsent();

  const SUPPORT_WHATSAPP = '97466046431'; // no + or spaces — wa.me format
  const supportMsg = encodeURIComponent('Hi, I need help with Sokoni Hub.');

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Link to="/" className="footer-brand" aria-label="Sokoni Hub home">
              <span className="footer-logo">
                <img src="/logo.png" alt="" width={32} height={32} />
              </span>
              <span className="footer-brand-name">Sokoni Hub</span>
            </Link>
            <p style={{ maxWidth: 320 }}>
              {t('footer.blurb')}
            </p>
          </div>

          <div>
            <h4>{t('footer.buy')}</h4>
            <Link to="/browse?kind=product">{t('footer.foodstuff')}</Link>
            <Link to="/browse?kind=service">{t('footer.services')}</Link>
            <Link to="/vendors">{t('footer.verifiedStores')}</Link>
            <Link to="/track">{t('footer.trackOrder')}</Link>
          </div>

          <div>
            <h4>{t('footer.sell')}</h4>
            <Link to="/sell">{t('footer.becomeVendor')}</Link>
            <Link to="/register?role=vendor">{t('footer.createAccount')}</Link>
            <Link to="/login">{t('footer.vendorLogin')}</Link>
          </div>

          <div>
            <h4>{t('footer.help')}</h4>
            <Link to="/support">Contact &amp; Support</Link>
            <Link to="/faq">FAQ</Link>
            <Link to="/terms">Terms of Use</Link>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/cookies">Cookie settings</Link>
            {analyticsConfigured && <button type="button" className="footer-cookie-link" onClick={openSettings}>Change analytics choice</button>}
            <Link to="/delete-account">Account deletion</Link>
            <Link to="/support#track">{t('footer.trackComplaint')}</Link>
            <Link to="/policy">{t('footer.prohibited')}</Link>
            <a
              href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${supportMsg}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              💬 {t('footer.chatSupport')}
            </a>
          </div>
        </div>

        <div className="footer-bottom">
          <span>{t('footer.rightsLine', { year: new Date().getFullYear() })}</span>
          <span>{t('footer.promise')}</span>
        </div>
      </div>
    </footer>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  // The buyer account centre is a dashboard surface, not a marketing page.
  // Its focused account navigation replaces the public-site footer.
  const isUserDashboard = pathname === '/account';

  return (
    <div className="app marketplace-app">
      <Header />
      <main className="page"><Outlet /></main>
      {!isUserDashboard && <Footer />}
    </div>
  );
}

/** Layout without the page padding (for the hero landing page). */
export function BareLayout() {
  return (
    <div className="app marketplace-app">
      <Header />
      <main style={{ flex: 1 }}><Outlet /></main>
      <Footer />
    </div>
  );
}
