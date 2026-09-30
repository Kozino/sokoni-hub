import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Listing } from './types';

const KEY = 'sokoni_mobile_favourites';
const LIMIT = 100;

const FavouritesContext = createContext<{
  items: Listing[]; has: (id: string) => boolean; toggle: (listing: Listing) => boolean;
}>({ items: [], has: () => false, toggle: () => false });
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
  const value = useMemo(() => ({ items, has, toggle }), [items, has, toggle]);
  return <FavouritesContext.Provider value={value}>{children}</FavouritesContext.Provider>;
}
