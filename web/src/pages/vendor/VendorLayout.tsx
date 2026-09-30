import { Outlet } from 'react-router-dom';
import { Header, Footer } from '../../components/Layout';
import DashShell, { DashLink, DashNotification } from '../../components/DashShell';
import { useAuth } from '../../state/AuthContext';
import { StatusBadge, Alert } from '../../components/ui';
import { VendorDashboardProvider, useVendorDashboard } from '../../state/VendorDashboardContext';
import './vendor-classic.css';
import { IconChart, IconBox, IconPlus, IconReceipt, IconAlert, IconStore, IconHistory } from '../../components/icons';
import { EnglishScope } from '../../i18n';

export default function VendorLayout() {
  return <VendorDashboardProvider><VendorConsole /></VendorDashboardProvider>;
}
function VendorConsole() {
  const { user, vendor } = useAuth();
  const name = vendor?.business_name || user?.full_name || 'V';
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const { data, bookings } = useVendorDashboard();
  const alerts = {
    out_of_stock: Number(data?.stats.out_of_stock || 0),
    low_stock: Number(data?.stats.low_stock || 0),
    open_complaints: Number(data?.stats.open_complaints || 0),
    new_bookings: bookings?.new || 0,
    sells_products: Number(data?.stats.products_tracked || 0) > 0,
  };

  const notifications: DashNotification[] = [
    ...(alerts.out_of_stock > 0 ? [{
      id: 'oos', tone: 'red' as const,
      title: `${alerts.out_of_stock} product${alerts.out_of_stock === 1 ? '' : 's'} out of stock`,
      text: 'Buyers can see them but cannot order. Restock or pause.', to: '/vendor/inventory',
    }] : []),
    ...(alerts.low_stock > 0 ? [{
      id: 'low', tone: 'gold' as const,
      title: `${alerts.low_stock} product${alerts.low_stock === 1 ? '' : 's'} running low`,
      // No hardcoded "5" any more: the trigger is the vendor's own reorder
      // point, which they can set per product.
      text: 'At or below your reorder point.', to: '/vendor/inventory',
    }] : []),
    ...(alerts.open_complaints > 0 ? [{
      id: 'cx', tone: 'red' as const,
      title: `${alerts.open_complaints} open complaint${alerts.open_complaints === 1 ? '' : 's'}`,
      text: 'A buyer is waiting on a response.', to: '/vendor/complaints',
    }] : []),
    ...(alerts.new_bookings > 0 ? [{
      id: 'bk', tone: 'gold' as const,
      title: `${alerts.new_bookings} new booking request${alerts.new_bookings === 1 ? '' : 's'}`,
      text: 'A customer is waiting to agree a time with you.', to: '/vendor/bookings',
    }] : []),
  ];

  const links: DashLink[] = [
    { to: '/vendor', end: true, ico: IconChart, label: 'Overview', group: 'Store' },
    { to: '/vendor/listings', ico: IconBox, label: 'Products & services', pill: alerts.out_of_stock, group: 'Catalogue' },
    { to: '/vendor/listings/new', ico: IconPlus, label: 'Add listing', group: 'Catalogue' },
    // Products only. Hidden outright for a services-only vendor.
    ...(alerts.sells_products
      ? [{ to: '/vendor/inventory', ico: IconBox, label: 'Inventory',
           pill: alerts.out_of_stock + alerts.low_stock, group: 'Catalogue' as const }]
      : []),
    { to: '/vendor/orders', ico: IconReceipt, label: 'Orders', group: 'Sales' },
    { to: '/vendor/bookings', ico: IconHistory, label: 'Bookings', pill: alerts.new_bookings, group: 'Sales' },
    { to: '/vendor/availability', ico: IconHistory, label: 'Availability', group: 'Sales' },
    { to: '/vendor/complaints', ico: IconAlert, label: 'Complaints', pill: alerts.open_complaints, group: 'Sales' },
    { to: '/vendor/statements', ico: IconReceipt, label: 'Statements', group: 'Sales' },
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
    <>
      {/* Dashboards stay English and LTR: translation is a buyer feature,
          and flipping an unchecked console into RTL is worse than not
          offering it. */}
      <EnglishScope />
      <div className="app vendor-console">
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
      <Footer />
    </div>
  </>
  );
}
