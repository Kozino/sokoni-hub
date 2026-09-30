import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import type { Vendor } from '../types';

type Numeric = number | string;
export interface DashboardData {
  stats: Record<string, Numeric>;
  salesTrend: { day: string; revenue: number; orders: number }[];
  topListings: { id: string; title: string; kind: string; views: Numeric; price: Numeric; quantity: Numeric | null; unit: string | null; units_sold: Numeric; revenue: Numeric }[];
  byStatus: { status: string; count: number }[];
  recentOrders: { id: string; code: string; status: string; total: Numeric; currency: string; contact_name: string; city: string; payment_method: string; created_at: string }[];
  // loadVendor intentionally returns only the middleware identity fields.
  // Slug and ratings come from AuthContext's full /auth/me profile.
  vendor: Pick<Vendor, 'id' | 'status' | 'business_name'> & { low_stock_threshold?: number };
}
interface State {
  data: DashboardData | null;
  bookings: { new: number; confirmed: number; total: number } | null;
  loading: boolean; error: string; bookingError: string; updatedAt: Date | null;
  refresh: () => Promise<void>;
}
const Context = createContext<State | null>(null);
export function VendorDashboardProvider({ children }: { children: ReactNode }) {
  const { vendor } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [bookings, setBookings] = useState<State['bookings']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (!vendor?.id) { setLoading(false); setError('No vendor profile is available for this account.'); return; }
    if (busy.current) return;
    busy.current = true;
    const current = generation.current;
    const alive = () => current === generation.current;
    setLoading(true);
    try {
      const result = await api.get<DashboardData>('/vendors/dashboard');
      if (alive()) { setData(result); setError(''); setUpdatedAt(new Date()); }
    } catch (e) {
      if (alive()) setError(e instanceof Error ? e.message : 'Could not load dashboard.');
    }
    // Independent failure handling: bookings still load if commerce fails.
    if (alive()) {
      try {
        const result = await api.get<NonNullable<State['bookings']>>('/bookings/vendor/counts');
        if (alive()) { setBookings(result); setBookingError(''); }
      } catch {
        if (alive()) setBookingError('Booking counts could not be refreshed.');
      }
    }
    if (alive()) { busy.current = false; setLoading(false); }
  }, [vendor?.id]);
  useEffect(() => {
    generation.current += 1;
    busy.current = false;
    setData(null); setBookings(null); setUpdatedAt(null); setError(''); setBookingError('');
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 60_000);
    return () => { generation.current += 1; clearInterval(timer); };
  }, [refresh]);
  return <Context.Provider value={{ data, bookings, loading, error, bookingError, updatedAt, refresh }}>{children}</Context.Provider>;
}
export function useVendorDashboard() {
  const context = useContext(Context);
  if (!context) throw new Error('Vendor dashboard provider is missing');
  return context;
}
