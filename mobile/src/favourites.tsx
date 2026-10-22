import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Listing } from './types';

const KEY = 'sokoni_mobile_favourites';
const LIMIT = 100;

const FavouritesContext = createContext<{
  items: Listing[]; has: (id: string) => boolean; toggle: (listing: Listing) => boolean;
  remove: (ids: string[]) => void; refresh: (fresh: Listing[]) => void;
}>({ items: [], has: () => false, toggle: () => false, remove: () => {}, refresh: () => {} });
export const useFavourites = () => useContext(FavouritesContext);

/** Saved listings live on the device (like the cart); the server stays the source of truth for price and stock. */
export function FavouritesProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Listing[]>([]);
  useEffect(() => { AsyncStorage.getItem(KEY).then((raw) => { if (raw) setItems(JSON.parse(raw)); }).catch(() => {}); }, []);
  const has = useCallback((id: string) => items.some((item) => item.id === id), [items]);
  const toggle = useCallback((listing: Listing) => {
    const saved = items.some((item) => item.id === listing.id);
    const next = saved ? items.filter((item) => item.id !== listing.id) : [listing, ...items].slice(0, LIMIT);
    setItems(next);
    void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
    return !saved;
  }, [items]);
  /** Drop several saved listings at once (bulk "remove" and "move to cart"). */
  const remove = useCallback((ids: string[]) => {
    setItems((current) => {
      const next = current.filter((item) => !ids.includes(item.id));
      void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  /** Replace saved snapshots with current API data (price, stock, photos), keeping the buyer's order. */
  const refresh = useCallback((fresh: Listing[]) => {
    setItems((current) => {
      const byId = new Map(fresh.map((l) => [l.id, l]));
      let changed = false;
      const next = current.map((item) => {
        const latest = byId.get(item.id);
        if (!latest) return item;
        if (JSON.stringify([latest.price, latest.quantity, latest.images, latest.rating_avg, latest.rating_count, latest.options]) !== JSON.stringify([item.price, item.quantity, item.images, item.rating_avg, item.rating_count, item.options])) changed = true;
        return { ...item, ...latest };
      });
      if (changed) void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return changed ? next : current;
    });
  }, []);
  const value = useMemo(() => ({ items, has, toggle, remove, refresh }), [items, has, toggle, remove, refresh]);
  return <FavouritesContext.Provider value={value}>{children}</FavouritesContext.Provider>;
}
