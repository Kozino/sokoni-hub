import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../state/ThemeContext';
import { IconSearch, IconBell, IconSettings } from './icons';

export interface DashLink {
  to: string;
  end?: boolean;
  ico: ReactNode;
  label: string;
  pill?: number;
  group?: string;
}

export interface DashNotification {
  id: string;
  tone: 'red' | 'gold' | 'blue' | 'green';
  title: string;
  text: string;
  to: string;
}

const KEY = 'sokoni-sidebar-collapsed';
const TONE_VAR: Record<DashNotification['tone'], string> = {
  red: 'var(--danger)', gold: 'var(--warning)', blue: 'var(--info)', green: 'var(--success)',
};

/** Bell icon-button + click-outside dropdown of the caller's notifications. */
function NotifBell({ items }: { items: DashNotification[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button" className="icon-btn tip" data-tip="Notifications"
        onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Notifications"
      >
        {IconBell}
        {items.length > 0 && <span className="dot" />}
      </button>
      {open && (
        <div className="menu menu-right" role="menu" style={{ width: 300 }}>
          <div className="menu-label">Notifications</div>
          {items.length === 0 && <div className="menu-item" style={{ color: 'var(--text-muted)', cursor: 'default' }}>You're all caught up.</div>}
          {items.map((n) => (
            <Link key={n.id} to={n.to} className="menu-item" role="menuitem" onClick={() => setOpen(false)}
              style={{ alignItems: 'flex-start', whiteSpace: 'normal' }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: TONE_VAR[n.tone], marginTop: 6, flexShrink: 0 }} />
              <span>
                <span style={{ display: 'block', fontWeight: 650, color: 'var(--text)' }}>{n.title}</span>
                <span style={{ display: 'block', fontSize: '.78rem', color: 'var(--text-muted)' }}>{n.text}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Application shell for the admin + vendor dashboards.
 *
 * Desktop  — full sidebar, collapsible to an icon rail (preference persisted).
 * Tablet   — icon rail by default.
 * Mobile   — off-canvas drawer with a scrim; closes on route change and Escape.
 */
export default function DashShell({
  links, who, banner, children, notifications = [], settingsTo,
}: {
  links: DashLink[];
  who: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
  notifications?: DashNotification[];
  settingsTo?: string;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  });
  const [drawer, setDrawer] = useState(false);
  const [query, setQuery] = useState('');
  const { pathname } = useLocation();
  const nav = useNavigate();

  useEffect(() => { setDrawer(false); }, [pathname]);

  useEffect(() => {
    try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  useEffect(() => {
    if (!drawer) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [drawer]);

  // Group links while preserving their declared order.
  const groups: { name: string; items: DashLink[] }[] = [];
  for (const l of links) {
    const name = l.group ?? '';
    const g = groups.find((x) => x.name === name);
    if (g) g.items.push(l); else groups.push({ name, items: [l] });
  }

  const current = links
    .filter((l) => (l.end ? pathname === l.to : pathname.startsWith(l.to)))
    .sort((a, b) => b.to.length - a.to.length)[0];

  const matches = useMemo(
    () => (query.trim() ? links.filter((l) => l.label.toLowerCase().includes(query.trim().toLowerCase())) : []),
    [links, query],
  );
  const goTo = (to: string) => { nav(to); setQuery(''); };

  return (
    <div className="dash" data-collapsed={String(collapsed)} data-drawer={drawer ? 'open' : 'closed'}>
      <div className={`dash-scrim${drawer ? ' show' : ''}`} onClick={() => setDrawer(false)} aria-hidden="true" />

      <aside className="dash-side" aria-label="Dashboard navigation">
        <div className="who">{who}</div>

        {groups.map((g, gi) => (
          <div className="nav-group" key={g.name || gi}>
            {g.name && <div className="nav-group-label">{g.name}</div>}
            <nav className="dash-nav">
              {g.items.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end} data-label={l.label} title={l.label}>
                  <span className="ico" aria-hidden="true">{l.ico}</span>
                  <span className="label">{l.label}</span>
                  {!!l.pill && l.pill > 0 && <span className="pill">{l.pill}</span>}
                </NavLink>
              ))}
            </nav>
          </div>
        ))}

        <div className="dash-side-foot">
          <button
            type="button"
            className="menu-item"
            onClick={() => setCollapsed((c) => !c)}
            aria-pressed={collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="ico" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                   style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}>
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </span>
            <span className="label">Collapse</span>
          </button>
        </div>
      </aside>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="dash-bar">
          <button
            type="button"
            className="icon-btn bordered side-toggle"
            onClick={() => setDrawer((d) => !d)}
            aria-label="Open navigation"
            aria-expanded={drawer}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>

          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span className="sep" aria-hidden="true">/</span>
            <Link to={links[0]?.to ?? '/'}>{pathname.startsWith('/admin') ? 'Admin' : 'Vendor'}</Link>
            {current && current !== links[0] && (
              <>
                <span className="sep" aria-hidden="true">/</span>
                <span className="current">{current.label}</span>
              </>
            )}
          </nav>

          <div className="dash-search grow">
            {IconSearch}
            <input
              type="search"
              placeholder="Search this dashboard…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) goTo(matches[0].to); }}
              aria-label="Search dashboard sections"
            />
            {matches.length > 0 && (
              <div className="menu" role="menu" style={{ left: 0, right: 'auto', top: '100%', width: '100%', maxWidth: 340 }}>
                {matches.map((m) => (
                  <button key={m.to} type="button" className="menu-item" role="menuitem" onClick={() => goTo(m.to)}>
                    <span className="ico" aria-hidden="true">{m.ico}</span>{m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="row" style={{ gap: 4, marginLeft: 'auto' }}>
            <ThemeToggle />
            <NotifBell items={notifications} />
            {settingsTo && (
              <Link to={settingsTo} className="icon-btn tip" data-tip="Settings" aria-label="Settings">
                {IconSettings}
              </Link>
            )}
          </div>
        </div>

        <main className="dash-main">
          {banner}
          {children}
        </main>
      </div>
    </div>
  );
}

/** Media-query-free CSS toggle: hide the drawer button above 768px. */
