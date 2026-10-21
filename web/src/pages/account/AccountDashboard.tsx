import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Header } from '../../components/Layout';
import DashShell, { DashLink } from '../../components/DashShell';
import SessionManager from '../../components/SessionManager';
import { useAuth } from '../../state/AuthContext';
import { api, ApiError, setToken } from '../../lib/api';
import { Alert, Field, StatusBadge } from '../../components/ui';
import { money, dateTime } from '../../lib/format';
import { qWhen } from '../../lib/booking';
import type { Order } from '../../types';
import { IconBox, IconHistory, IconSettings, IconTrash } from '../../components/icons';
import '../admin/admin-classic.css';
import './account-dashboard.css';

/* Buyer account dashboard. Uses the same sidebar shell and skin as the
   admin console. Pages are real routes under /account so the sidebar
   navigates normally and the mobile drawer closes on each tap. */

export function AccountLayout() {
  const { user, logout } = useAuth();
  const initials = (user?.full_name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const links: DashLink[] = [
    { to: '/account', end: true, ico: IconSettings, label: 'Profile & security', group: 'Account' },
    { to: '/account/bookings', ico: IconHistory, label: 'My bookings', group: 'Account' },
    { to: '/account/orders', ico: IconBox, label: 'My orders', group: 'Account' },
    { to: '/account/delete-account', ico: IconTrash, label: 'Account deletion', group: 'Account' },
  ];

  return (
    <div className="app admin-console account-console">
      <Header />
      <DashShell
        links={links}
        breadcrumbLabel="Account"
        onSignOut={() => { void logout(); }}
        who={
          <>
            <span className="avatar" aria-hidden="true">{initials}</span>
            <span className="who-text" style={{ minWidth: 0 }}>
              <strong>{user?.full_name}</strong>
              <span>{user?.phone}</span>
            </span>
          </>
        }
      >
        <Outlet />
      </DashShell>
    </div>
  );
}

/* Profile & security ------------------------------------------------ */
export function AccountProfile() {
  const { user, refresh } = useAuth();
  const [msg, setMsg] = useState('');
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [name, setName] = useState(user?.full_name || '');

  return (
    <>
      <div className="dash-title">
        <p className="eyebrow">Account centre</p>
        <h1>My account</h1>
        <p>Manage your profile, bookings, orders and security in one place.</p>
      </div>

      {msg && <Alert kind="success">{msg}</Alert>}

      <SessionManager />

      <div id="profile" className="card card-pad mt-3">
        <h3>Profile</h3>
        <form onSubmit={async (e) => { e.preventDefault(); await api.patch('/auth/me', { full_name: name }); await refresh(); setMsg('Profile updated'); }}>
          <Field label="Full name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Phone"><input value={user?.phone || ''} disabled /></Field>
          <button className="btn btn-outline">Save</button>
        </form>
      </div>

      <div className="card card-pad mt-3">
        <h3>Change password</h3>
        <form onSubmit={async (e) => {
          e.preventDefault();
          try { const r = await api.post<{ token: string }>('/auth/change-password', pw); setToken(r.token); setMsg('Password changed'); setPw({ current_password: '', new_password: '' }); }
          catch (er) { setMsg(er instanceof ApiError ? er.message : 'Failed'); }
        }}>
          <div className="form-row">
            <Field label="Current password"><input type="password" required value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
            <Field label="New password"><input type="password" required minLength={12} maxLength={72} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
          </div>
          <button className="btn btn-outline">Update password</button>
        </form>
      </div>
    </>
  );
}

/* My bookings ------------------------------------------------------- */
export function AccountBookings() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [historyError, setHistoryError] = useState('');
  useEffect(() => {
    api.get<{ bookings: any[] }>('/bookings/mine').then((r) => setBookings(r.bookings)).catch((e) => setHistoryError(e.message));
  }, []);

  return (
    <>
      <div className="dash-title">
        <h1>My bookings</h1>
        <p>Bookings made while signed in appear here. Guest bookings remain accessible through <Link to="/track">Track booking</Link>.</p>
      </div>
      <div className="card card-pad">
        {historyError && <p role="alert">{historyError}</p>}
        {!historyError && !bookings.length && <p>No signed-in bookings yet.</p>}
        {bookings.map((b) => (
          <div key={b.id} className="booking-row">
            <strong>{b.listing_title}</strong> — {b.business_name}
            <div className="booking-meta">
              <code>{b.code}</code> <StatusBadge status={b.status} />
              <span>{b.slot_starts_at || b.scheduled_at ? qWhen(b.slot_starts_at || b.scheduled_at) + ' (Qatar time)' : 'Awaiting agreed time'}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* My orders --------------------------------------------------------- */
export function AccountOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => { api.get<{ orders: Order[] }>('/orders/mine').then((r) => setOrders(r.orders)).catch(() => {}); }, []);

  return (
    <>
      <div className="dash-title"><h1>My orders</h1></div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Code</th><th>Store</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {orders.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No orders yet</td></tr>}
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="td-mono">{o.code}</td>
                  <td>{o.business_name}</td>
                  <td className="td-strong">{money(o.total, o.currency)}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>{dateTime(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

