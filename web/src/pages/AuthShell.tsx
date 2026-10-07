// Shared split-screen layout for Login, Register and Verify Email (UI only).
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './auth.css'; // adjust the path if auth.css lives elsewhere

// Path to the Sokoni Hub logo file (e.g. web/public/logo.png -> '/logo.png').
// If the file can't be loaded, a built-in "S" mark is shown instead.
const LOGO_SRC = '/logo.png';

export function SokoniLogo({ compact = false }: { compact?: boolean }) {
  const [failed, setFailed] = useState(false);

  return (
    <Link to="/" className={`auth-logo${compact ? ' auth-logo--compact' : ''}`} aria-label="Sokoni Hub – go to homepage">
      <span className="auth-logo-plate">
        {failed ? (
          <span className="auth-logo-fallback" aria-hidden="true">S</span>
        ) : (
          <img src={LOGO_SRC} alt="" onError={() => setFailed(true)} />
        )}
      </span>
      <span className="auth-logo-text">
        <span className="auth-logo-name">Sokoni Hub</span>
        {!compact && <span className="auth-logo-tag">Marketplace for African traders</span>}
      </span>
    </Link>
  );
}

export type AuthVariant = 'login' | 'register' | 'verify';

const COPY: Record<AuthVariant, { title: string; text: string; points: string[] }> = {
  login: {
    title: 'Welcome back to the market.',
    text: 'Pick up where you left off with the traders and service providers in your community.',
    points: [
      'Browse vendors and listings across the marketplace',
      'Manage your orders, shop and messages',
      'A 4-digit PIN protects every sign-in',
    ],
  },
  register: {
    title: 'Open your account and start trading.',
    text: 'Join the marketplace where African traders and service providers in Qatar meet the people looking for them.',
    points: [
      'Buyers find trusted traders and services in one place',
      'Vendors open a shop and reach new customers',
      'Your email and 4-digit PIN keep your account protected',
    ],
  },
  verify: {
    title: 'One quick step to confirm it is you.',
    text: 'Verifying your email keeps your account secure and lets us reach you about your orders.',
    points: [
      'Check your inbox, and your spam folder too',
      'It only takes a minute',
      'Once verified, you can sign in straight away',
    ],
  },
};

export function AuthShell({ variant, children }: { variant: AuthVariant; children: ReactNode }) {
  const c = COPY[variant];

  return (
    <div className={`auth-shell${variant === 'register' ? ' auth-shell--wide' : ''}`}>
      <aside className="auth-aside">
        <div className="auth-awning" aria-hidden="true" />
        <div className="auth-weave" aria-hidden="true" />
        <div className="auth-aside-body">
          <SokoniLogo />
          <h2>{c.title}</h2>
          <p>{c.text}</p>
          <ul className="auth-points">
            {c.points.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-mobile-brand">
          <SokoniLogo compact />
        </div>
        <div className="auth-panel">{children}</div>
      </main>
    </div>
  );
}
