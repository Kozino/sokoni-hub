import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import type { CartItem } from '../types';

const KEY = 'sokoni_cart';

interface CartState {
  items: CartItem[];
  add: (i: CartItem) => void;
  setQty: (listing_id: string, qty: number) => void;
  remove: (listing_id: string) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  currency: string;
  byVendor: { vendor_id: string; vendor_name: string; items: CartItem[]; subtotal: number }[];
}

const Ctx = createContext<CartState>(null as any);
export const useCart = () => useContext(Ctx);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  });

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(items)); }, [items]);

  const add: CartState['add'] = (i) =>
    setItems((prev) => {
      const found = prev.find((p) => p.listing_id === i.listing_id);
      if (found)
        return prev.map((p) =>
          p.listing_id === i.listing_id
            ? { ...p, qty: Math.min(p.qty + i.qty, p.max ?? Infinity) }
            : p
        );
      return [...prev, i];
    });

  const setQty: CartState['setQty'] = (id, qty) =>
    setItems((prev) =>
      prev.map((p) => (p.listing_id === id ? { ...p, qty: Math.max(1, Math.min(qty, p.max ?? Infinity)) } : p))
    );

  const remove: CartState['remove'] = (id) => setItems((prev) => prev.filter((p) => p.listing_id !== id));
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
      currency: items[0]?.currency || 'USD',
      byVendor: [...groups.values()],
    };
  }, [items]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
