import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Header } from '../../components/Layout';
import { useAuth } from '../../state/AuthContext';
import { api } from '../../lib/api';

export default function AdminLayout() {
  const { user } = useAuth();
  const [counts, setCounts] = useState({ vendors_pending: 0, complaints_open: 0 });

  useEffect(() => {
    const load = () => api.get<any>('/admin/overview')
      .then((r) => setCounts({ vendors_pending: Number(r.stats.vendors_pending), complaints_open: Number(r.stats.complaints_open) }))
      .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const links = [
    { to: '/admin', end: true, ico: '📈', label: 'Overview' },
    { to: '/admin/vendors', ico: '🛡️', label: 'Verification', pill: counts.vendors_pending },
    { to: '/admin/listings', ico: '📦', label: 'Listings' },
    { to: '/admin/orders', ico: '🧾', label: 'Orders' },
    { to: '/admin/complaints', ico: '⚠️', label: 'Complaints', pill: counts.complaints_open },
    { to: '/admin/users', ico: '👥', label: 'Users' },
    { to: '/admin/categories', ico: '🗂️', label: 'Categories' },
    { to: '/admin/audit', ico: '🕘', label: 'Activity log' },
  ];

  return (
    <div className="app">
      <Header />
      <div className="dash">
        <aside className="dash-side">
          <div className="who">
            <strong>{user?.full_name}</strong>
            <span>Administrator</span>
          </div>
          <nav className="dash-nav">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end}>
                <span className="ico">{l.ico}</span>{l.label}
                {!!l.pill && l.pill > 0 && <span className="pill">{l.pill}</span>}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="dash-main"><Outlet /></main>
      </div>
    </div>
  );
}
