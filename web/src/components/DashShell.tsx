import { ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

export interface DashLink {
  to: string;
  end?: boolean;
  ico: ReactNode;
  label: string;
  pill?: number;
  group?: string;
}

const KEY = 'sokoni-sidebar-collapsed';

/**
 * Application shell for the admin + vendor dashboards.
 *
 * Desktop  — full sidebar, collapsible to an icon rail (preference persisted).
 * Tablet   — icon rail by default.
 * Mobile   — off-canvas drawer with a scrim; closes on route change and Escape.
 */
export default function DashShell({
  links, who, banner, children,
}: {
  links: DashLink[];
  who: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  });
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();

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

          <nav className="breadcrumb grow" aria-label="Breadcrumb">
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
