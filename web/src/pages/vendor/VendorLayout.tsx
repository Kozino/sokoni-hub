import { Outlet } from 'react-router-dom';
import { Header } from '../../components/Layout';
import DashShell, { DashLink } from '../../components/DashShell';
import { useAuth } from '../../state/AuthContext';
import { StatusBadge, Alert } from '../../components/ui';
import { IconChart, IconBox, IconPlus, IconReceipt, IconAlert, IconStore } from '../../components/icons';

const LINKS: DashLink[] = [
  { to: '/vendor', end: true, ico: IconChart, label: 'Overview', group: 'Store' },
  { to: '/vendor/listings', ico: IconBox, label: 'Products & services', group: 'Catalogue' },
  { to: '/vendor/listings/new', ico: IconPlus, label: 'Add listing', group: 'Catalogue' },
  { to: '/vendor/orders', ico: IconReceipt, label: 'Orders', group: 'Sales' },
  { to: '/vendor/complaints', ico: IconAlert, label: 'Complaints', group: 'Sales' },
  { to: '/vendor/profile', ico: IconStore, label: 'Store profile', group: 'Settings' },
];

export default function VendorLayout() {
  const { user, vendor } = useAuth();
  const name = vendor?.business_name || user?.full_name || 'V';
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

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
        links={LINKS}
        banner={banner}
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
