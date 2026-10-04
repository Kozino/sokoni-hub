import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '../../components/Layout';
import DashShell, { DashLink, DashNotification } from '../../components/DashShell';
import { useAuth } from '../../state/AuthContext';
import { api } from '../../lib/api';
import { IconChart, IconShield, IconBox, IconAlert, IconReceipt, IconUsers, IconFolder, IconHistory, IconStar } from '../../components/icons';
import { EnglishScope } from '../../i18n';

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

  const links: DashLink[] = [
    { to: '/admin', end: true, ico: IconChart, label: 'Overview', group: 'Analytics' },
    { to: '/admin/vendors', ico: IconShield, label: 'Verification', pill: counts.vendors_pending, group: 'Moderation' },
    { to: '/admin/listings', ico: IconBox, label: 'Listings', group: 'Moderation' },
    { to: '/admin/complaints', ico: IconAlert, label: 'Complaints', pill: counts.complaints_open, group: 'Moderation' },
    { to: '/admin/orders', ico: IconReceipt, label: 'Orders', group: 'Commerce' },
    { to: '/admin/users', ico: IconUsers, label: 'Users', group: 'Commerce' },
    { to: '/admin/billing', ico: IconReceipt, label: 'Billing', group: 'Commerce' },
    { to: '/admin/subscriptions', ico: IconReceipt, label: 'Subscriptions', group: 'Commerce' },
    { to: '/admin/plan-limits', ico: IconFolder, label: 'Plan Limits', group: 'Configuration' },
    { to: '/admin/bookings', ico: IconHistory, label: 'Service bookings', group: 'Commerce' },
    { to: '/admin/promotions', ico: IconStar, label: 'Placements', group: 'Commerce' },
    { to: '/admin/categories', ico: IconFolder, label: 'Categories', group: 'Configuration' },
    { to: '/admin/deletion', ico: IconShield, label: 'Privacy requests', group: 'Moderation' },
    { to: '/admin/audit', ico: IconHistory, label: 'Activity log', group: 'Configuration' },
  ];

  const initials = (user?.full_name || 'A').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const notifications: DashNotification[] = [
    ...(counts.vendors_pending > 0 ? [{
      id: 'vp', tone: 'gold' as const,
      title: `${counts.vendors_pending} vendor${counts.vendors_pending === 1 ? '' : 's'} awaiting verification`,
      text: 'Review documents and approve or reject.', to: '/admin/vendors',
    }] : []),
    ...(counts.complaints_open > 0 ? [{
      id: 'co', tone: 'red' as const,
      title: `${counts.complaints_open} open complaint${counts.complaints_open === 1 ? '' : 's'}`,
      text: 'Buyers are waiting on a ruling.', to: '/admin/complaints',
    }] : []),
  ];

  return (
    <>
      {/* Dashboards stay English and LTR: translation is a buyer feature,
          and flipping an unchecked console into RTL is worse than not
          offering it. */}
      <EnglishScope />
      <div className="app">
      <Header />
      <DashShell
        links={links}
        notifications={notifications}
        settingsTo="/admin/categories"
        who={
          <>
            <span className="avatar" aria-hidden="true">{initials}</span>
            <span className="who-text" style={{ minWidth: 0 }}>
              <strong>{user?.full_name}</strong>
              <span>Administrator</span>
            </span>
          </>
        }
      >
        <Outlet />
      </DashShell>
    </div>
  </>
  );
}
