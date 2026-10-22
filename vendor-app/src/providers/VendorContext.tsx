import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';

export type VendorTab = 'orders' | 'bookings' | 'availability' | 'account';

/** Fields the vendor app reads from /vendors/me. Written by the API, never invented on the device. */
export type Vendor = {
  id: string;
  business_name: string;
  slug?: string | null;
  description?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  logo_url?: string | null;
  status: 'pending' | 'verified' | 'rejected' | 'suspended';
  rejection_reason?: string | null;
  verified_at?: string | null;
  rating_avg?: number | string | null;
  rating_count?: number | null;
  alerts_enabled: boolean;
};

type VendorCtx = {
  vendor: Vendor | null;
  setVendor: (next: Vendor) => void;
  /** Pending orders and new booking requests, for the app bar and tab badges. */
  attention: { orders: number; bookings: number };
  setAttention: (next: { orders: number; bookings: number }) => void;
  go: (tab: VendorTab) => void;
  setTabHandler: (fn: ((tab: VendorTab) => void) | null) => void;
};

const Ctx = createContext<VendorCtx>(null as never);

export function VendorProvider({ children }: { children: ReactNode }) {
  const [vendor, setVendorState] = useState<Vendor | null>(null);
  const [attention, setAttention] = useState({ orders: 0, bookings: 0 });
  const [handler, setHandler] = useState<((tab: VendorTab) => void) | null>(null);

  useEffect(() => {
    api.get<{ vendor: Vendor }>('/vendors/me').then((r) => setVendorState(r.vendor)).catch(() => {});
  }, []);

  const setVendor = useCallback((next: Vendor) => setVendorState(next), []);
  const go = useCallback((tab: VendorTab) => handler?.(tab), [handler]);
  const setTabHandler = useCallback((fn: ((tab: VendorTab) => void) | null) => setHandler(() => fn), []);

  const value = useMemo(
    () => ({ vendor, setVendor, attention, setAttention, go, setTabHandler }),
    [vendor, setVendor, attention, go, setTabHandler],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useVendor = () => useContext(Ctx);
