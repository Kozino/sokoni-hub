import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '../../components/Layout';
import DashShell, { DashLink, DashNotification } from '../../components/DashShell';
import { useAuth } from '../../state/AuthContext';
import { StatusBadge, Alert } from '../../components/ui';
import { api } from '../../lib/api';
import { IconChart, IconBox, IconPlus, IconReceipt, IconAlert, IconStore } from '../../components/icons';

export default function VendorLayout() {
  const { user, vendor } = useAuth();
  const name = vendor?.business_name || user?.full_name || 'V';
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const [alerts, setAlerts] = useState({ out_of_stock: 0, low_stock: 0, open_complaints: 0 });
  useEffect(() => {
    if (!vendor) return;
    const load = () => api.get<any>('/vendors/dashboard')
      .then((r) => setAlerts({
        out_of_stock: Number(r.stats.out_of_stock || 0),
        low_stock: Number(r.stats.low_stock || 0),
        open_complaints: Number(r.stats.open_complaints || 0),
      }))
      .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [vendor]);

  const notifications: DashNotification[] = [
    ...(alerts.out_of_stock > 0 ? [{
      id: 'oos', tone: 'red' as const,
      title: `${alerts.out_of_stock} listing${alerts.out_of_stock === 1 ? '' : 's'} out of stock`,
      text: 'Restock or pause to keep your storefront accurate.', to: '/vendor/listings',
    }] : []),
    ...(alerts.low_stock > 0 ? [{
      id: 'low', tone: 'gold' as const,
      title: `${alerts.low_stock} listing${alerts.low_stock === 1 ? '' : 's'} running low`,
      text: '5 or fewer units left.', to: '/vendor/listings',
    }] : []),
    ...(alerts.open_complaints > 0 ? [{
      id: 'cx', tone: 'red' as const,
      title: `${alerts.open_complaints} open complaint${alerts.open_complaints === 1 ? '' : 's'}`,
      text: 'A buyer is waiting on a response.', to: '/vendor/complaints',
    }] : []),
  ];

  const links: DashLink[] = [
    { to: '/vendor', end: true, ico: IconChart, label: 'Overview', group: 'Store' },
    { to: '/vendor/listings', ico: IconBox, label: 'Products & services', pill: alerts.out_of_stock, group: 'Catalogue' },
    { to: '/vendor/listings/new', ico: IconPlus, label: 'Add listing', group: 'Catalogue' },
    { to: '/vendor/orders', ico: IconReceipt, label: 'Orders', group: 'Sales' },
    { to: '/vendor/complaints', ico: IconAlert, label: 'Complaints', pill: alerts.open_complaints, group: 'Sales' },
    { to: '/vendor/profile', ico: IconStore, label: 'Store profile', group: 'Settings' },
  ];

  const banner = (
    <>
      {vendor?.status === 'pending' && (
        <Alert kind="warn">
          <span>
            <strong>Awaiting verification.</strong> An admin is reviewing your store. You can explore
            the dashboard, but you cannot publish listings until you're approved.
          </span>
        </Alert>
      )}
      {vendor?.status === 'rejected' && (
        <Alert kind="error">
          <span>
            <strong>Verification rejected.</strong> {vendor.rejection_reason || 'No reason provided.'}{' '}
            Update your store profile and it will be resubmitted automatically.
          </span>
        </Alert>
      )}
      {vendor?.status === 'suspended' && (
        <Alert kind="error">
          <span><strong>Store suspended.</strong> {vendor.rejection_reason || 'Contact support for details.'}</span>
        </Alert>
      )}
    </>
  );

  return (
    <div className="app">
      <Header />
      <DashShell
        links={links}
        banner={banner}
        notifications={notifications}
        settingsTo="/vendor/profile"
        who={
          <>
            <span className="avatar" aria-hidden="true">{initials}</span>
            <span className="who-text" style={{ minWidth: 0 }}>
              <strong>{name}</strong>
              {vendor ? <StatusBadge status={vendor.status} /> : <span>Vendor account</span>}
            </span>
          </>
        }
      >
        <Outlet />
      </DashShell>
    </div>
  );
}
