import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import type { CartItem } from '../types';

const KEY = 'sokoni_cart';

interface CartState {
  items: CartItem[];
  add: (i: CartItem) => void;
  setQty: (listing_id: string, qty: number, option?: string) => void;
  remove: (listing_id: string, option?: string) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  currency: string;
  byVendor: { vendor_id: string; vendor_name: string; items: CartItem[]; subtotal: number }[];
}

const Ctx = createContext<CartState>(null as any);
export const useCart = () => useContext(Ctx);

// A cart line is identified by listing + chosen option. The same listing in two
// sizes is two lines. Missing and empty options are treated as the same thing.
const sameLine = (p: { listing_id: string; option?: string }, id: string, option?: string) =>
  p.listing_id === id && (p.option || '') === (option || '');

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      // Services are booked, never bought. Drop any that a previous build of
      // the app left in a returning visitor's saved cart, otherwise they would
      // reach checkout and be charged for something that is arranged and paid
      // for directly with the provider.
      const saved: CartItem[] = JSON.parse(localStorage.getItem(KEY) || '[]');
      return saved.filter((i) => i.kind !== 'service');
    } catch { return []; }
  });

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(items)); }, [items]);

  const add: CartState['add'] = (i) =>
    setItems((prev) => {
      // Guard rather than assert: a service reaching here is a bug in the
      // caller, and silently ignoring it is safer than charging for it.
      if (i.kind === 'service') return prev;
      const found = prev.some((p) => sameLine(p, i.listing_id, i.option));
      if (found)
        return prev.map((p) =>
          sameLine(p, i.listing_id, i.option)
            // Refresh the price too, so re-adding picks up the current one.
            ? { ...p, price: i.price, qty: Math.min(p.qty + i.qty, p.max ?? Infinity) }
            : p
        );
      return [...prev, i];
    });

  const setQty: CartState['setQty'] = (id, qty, option) =>
    setItems((prev) =>
      prev.map((p) =>
        sameLine(p, id, option)
          ? { ...p, qty: Math.max(1, Math.min(qty, p.max ?? Infinity)) }
          : p
      )
    );

  const remove: CartState['remove'] = (id, option) =>
    setItems((prev) => prev.filter((p) => !sameLine(p, id, option)));

  const clear = () => setItems([]);

  const value = useMemo<CartState>(() => {
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const groups = new Map<string, { vendor_id: string; vendor_name: string; items: CartItem[]; subtotal: number }>();
    for (const i of items) {
      const g = groups.get(i.vendor_id) ?? { vendor_id: i.vendor_id, vendor_name: i.vendor_name, items: [], subtotal: 0 };
      g.items.push(i); g.subtotal += i.price * i.qty;
      groups.set(i.vendor_id, g);
    }
    return {
      items, add, setQty, remove, clear,
      count: items.reduce((s, i) => s + i.qty, 0),
      subtotal,
      currency: items[0]?.currency || 'QAR',
      byVendor: [...groups.values()],
    };
  }, [items]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
