import { NavLink, Outlet } from 'react-router-dom';
import { Header } from '../../components/Layout';
import { useAuth } from '../../state/AuthContext';
import { StatusBadge, Alert } from '../../components/ui';

const LINKS = [
  { to: '/vendor', end: true, ico: '📊', label: 'Overview' },
  { to: '/vendor/listings', ico: '📦', label: 'Products & services' },
  { to: '/vendor/listings/new', ico: '➕', label: 'Add listing' },
  { to: '/vendor/orders', ico: '🧾', label: 'Orders' },
  { to: '/vendor/complaints', ico: '⚠️', label: 'Complaints' },
  { to: '/vendor/profile', ico: '🏪', label: 'Store profile' },
];

export default function VendorLayout() {
  const { user, vendor } = useAuth();
  return (
    <div className="app">
      <Header />
      <div className="dash">
        <aside className="dash-side">
          <div className="who">
            <strong>{vendor?.business_name || user?.full_name}</strong>
            <span>Vendor account</span>
            <div className="mt-1">{vendor && <StatusBadge status={vendor.status} />}</div>
          </div>
          <nav className="dash-nav">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end}>
                <span className="ico">{l.ico}</span>{l.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="dash-main">
          {vendor?.status === 'pending' && (
            <Alert kind="warn">
              <strong>Awaiting verification.</strong> An admin is reviewing your store. You can explore
              the dashboard, but you cannot publish listings until you're approved.
            </Alert>
          )}
          {vendor?.status === 'rejected' && (
            <Alert kind="error">
              <strong>Verification rejected.</strong> {vendor.rejection_reason || 'No reason provided.'}{' '}
              Update your store profile and it will be resubmitted automatically.
            </Alert>
          )}
          {vendor?.status === 'suspended' && (
            <Alert kind="error">
              <strong>Store suspended.</strong> {vendor.rejection_reason || 'Contact support for details.'}
            </Alert>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
