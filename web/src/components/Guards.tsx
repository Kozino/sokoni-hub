import { Navigate, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';
import { useAuth } from '../state/AuthContext';
import { Spinner } from './ui';
import type { Role } from '../types';

export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Vendor routes: must be logged in as vendor AND have completed onboarding. */
export function RequireVendor({ children }: { children: ReactNode }) {
  const { user, vendor, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (user.role === 'admin') return <>{children}</>;
  if (user.role !== 'vendor') return <Navigate to="/sell" replace />;
  if (!vendor) return <Navigate to="/vendor/onboard" replace />;
  return <>{children}</>;
}
