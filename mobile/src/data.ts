/**
 * Shared data hooks. Everything here reads the existing Sokoni Hub API — nothing is invented on the
 * device. Where the API does not return something a screen wants (for example order thumbnails), the
 * screen degrades to a tidy placeholder instead of showing made-up content.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { api, ApiError, query } from './api';
import { cityParam, phoneDigits, ratingOf, uniqueCities } from './format';
import { useAuth } from './providers';
import type { Booking, CartItem, CartQuote, Category, FulfilmentMode, Listing, Order } from './types';

export const errorMessage = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong. Please try again.';

const MINUTE = 60_000;

/* ----------------------------------------------------------------------------- reference data */
/** Categories for filters. A category an admin renamed "(BANNED)" must never be offered to buyers. */
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    staleTime: 10 * MINUTE,
    queryFn: async () => (await api.get<{ categories: Category[] }>('/meta/categories')).categories.filter((c) => !/\bbanned\b/i.test(c.name)),
  });
}

/**
 * Categories that currently have at least one listing. An empty category is a dead end for a buyer, so it is
 * hidden — but only when one request shows the whole catalogue (60 listings or fewer). Past that we cannot be
 * sure which categories are empty, so every category is offered.
 */
export function useActiveCategories() {
  const categories = useCategories();
  const probe = useQuery({
    queryKey: ['category-probe'],
    staleTime: 5 * MINUTE,
    queryFn: async () => {
      const result = await api.get<{ listings: Listing[]; total: number }>(`/listings${query({ limit: 60, sort: 'popular' })}`);
      rememberImages(result.listings);
      return result;
    },
  });
  return useMemo(() => {
    const all = categories.data ?? [];
    const seen = probe.data;
    if (!seen || seen.total > seen.listings.length || !seen.listings.length) return { ...categories, data: all };
    const used = new Set(seen.listings.map((l) => l.category_slug));
    return { ...categories, data: all.filter((c) => used.has(c.slug)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.data, categories.isLoading, probe.data]);
}

export type PlatformStats = { vendors: number; listings: number; services: number; cities: number; orders_delivered: number };
export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    staleTime: 10 * MINUTE,
    queryFn: async () => (await api.get<{ stats: PlatformStats }>('/meta/stats')).stats,
  });
}

export function useCityList() {
  return useQuery({
    queryKey: ['cities'],
    staleTime: 10 * MINUTE,
    queryFn: async () => uniqueCities((await api.get<{ cities: string[] }>('/listings/cities')).cities || []),
  });
}

/** Public store directory (logo, rating, slug). Used to dress order and booking cards with the seller's real logo. */
export type DirectoryVendor = {
  id: string; business_name: string; slug: string; logo_url: string | null; city: string | null;
  rating_avg: number | string; rating_count: number; listing_count: number;
  offers_delivery?: boolean; offers_pickup?: boolean; delivery_fee?: number | string | null; free_delivery_over?: number | string | null;
};
export function useVendorDirectory() {
  const result = useQuery({
    queryKey: ['vendor-directory'],
    staleTime: 10 * MINUTE,
    queryFn: async () => {
      const all: DirectoryVendor[] = [];
      for (let page = 0; page < 4; page += 1) {
        const { vendors } = await api.get<{ vendors: DirectoryVendor[] }>(`/vendors${query({ limit: 60, offset: page * 60 })}`);
        all.push(...vendors);
        if (vendors.length < 60) break;
      }
      return all;
    },
  });
  return useMemo(() => {
    const list = result.data ?? [];
    const byId = new Map(list.map((v) => [v.id, v]));
    const byName = new Map(list.map((v) => [v.business_name.trim().toLowerCase(), v]));
    return { list, byId, byName, loading: result.isLoading };
  }, [result.data, result.isLoading]);
}

/** Which sellers hold a paid VIP / Featured placement. Read-only: impressions are only counted by the Explore rails. */
export function usePromoSet() {
  const result = useQuery({
    queryKey: ['promo-set'],
    staleTime: 5 * MINUTE,
    queryFn: async () => {
      const data = await api.get<{ vip?: { vendor_id: string }[]; featured?: { vendor_id: string }[] }>('/promotions');
      return { vip: new Set((data.vip || []).map((p) => p.vendor_id)), featured: new Set((data.featured || []).map((p) => p.vendor_id)) };
    },
  });
  return result.data ?? { vip: new Set<string>(), featured: new Set<string>() };
}

/* ------------------------------------------------------------------- remembered listing photos */
/**
 * `/orders/mine` and `/bookings/mine` carry no photos. Every listing the buyer has seen on this phone
 * is remembered here (id -> first photo), so past orders and bookings can show real thumbnails
 * without extra API calls or inflating a listing's view counter.
 */
const THUMB_KEY = 'sokoni_mobile_thumbs';
const THUMB_LIMIT = 400;
let thumbs: Record<string, string> = {};
let thumbsLoaded = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const thumbListeners = new Set<() => void>();
const emitThumbs = () => thumbListeners.forEach((l) => l());
const loadThumbs = () => {
  if (thumbsLoaded) return;
  thumbsLoaded = true;
  AsyncStorage.getItem(THUMB_KEY).then((raw) => {
    if (!raw) return;
    try { thumbs = { ...JSON.parse(raw), ...thumbs }; emitThumbs(); } catch { /* ignore a corrupt cache */ }
  }).catch(() => {});
};
loadThumbs();

export function rememberImages(rows: { id?: string | null; listing_id?: string | null; images?: string[] | null; image?: string | null }[]) {
  let changed = false;
  for (const row of rows) {
    const id = row.id ?? row.listing_id;
    const image = row.images?.[0] ?? row.image;
    if (!id || !image || thumbs[id] === image) continue;
    delete thumbs[id]; // re-insert so the newest entries survive trimming
    thumbs[id] = image;
    changed = true;
  }
  if (!changed) return;
  const keys = Object.keys(thumbs);
  if (keys.length > THUMB_LIMIT) keys.slice(0, keys.length - THUMB_LIMIT).forEach((k) => { delete thumbs[k]; });
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => { void AsyncStorage.setItem(THUMB_KEY, JSON.stringify(thumbs)).catch(() => {}); }, 900);
  emitThumbs();
}
export function useRememberedImage(listingId?: string | null): string | undefined {
  return useSyncExternalStore(
    (listener) => { thumbListeners.add(listener); return () => { thumbListeners.delete(listener); }; },
    () => (listingId ? thumbs[listingId] : undefined),
    () => undefined,
  );
}

/* ----------------------------------------------------------------------- orders and bookings */
export const CLOSED_ORDER_STATES = ['delivered', 'cancelled'];
export const LIVE_BOOKING_STATES = ['new', 'contacted', 'confirmed'];
export const isActiveOrder = (status: string) => !CLOSED_ORDER_STATES.includes(status);
export const bookingTime = (b: Pick<Booking, 'slot_starts_at' | 'scheduled_at' | 'preferred_at'>) => b.slot_starts_at || b.scheduled_at || b.preferred_at || null;
/** A booking that is still to come: live status and not already in the past (a little grace for running late). */
export const isUpcomingBooking = (b: Booking) => {
  if (!LIVE_BOOKING_STATES.includes(b.status)) return false;
  const at = bookingTime(b);
  return !at || new Date(at).getTime() > Date.now() - 3 * 3_600_000;
};

/** The signed-in buyer's orders. Shared so the header dot, Orders and Profile all read one cache. */
export function useMyOrders() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['orders-mine', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => (await api.get<{ orders: Order[] }>('/orders/mine')).orders,
  });
}
export function useMyBookings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['bookings-mine', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => (await api.get<{ bookings: Booking[] }>('/bookings/mine')).bookings,
  });
}


/** Full order (items, rider, payment) for one row of "my orders". `/orders/mine` itself has no line items. */
export function useOrderDetail(order?: Pick<Order, 'code' | 'contact_phone'> | null, enabled = true) {
  const result = useQuery({
    queryKey: ['order-detail', order?.code],
    enabled: enabled && !!order?.code && !!order?.contact_phone,
    staleTime: MINUTE,
    retry: false,
    queryFn: async () => (await api.get<{ order: Order }>(`/orders/track${query({ code: order!.code, phone: order!.contact_phone })}`)).order,
  });
  useEffect(() => { if (result.data?.items) rememberImages(result.data.items); }, [result.data]);
  return result;
}

/** Price, address, WhatsApp and cancel rules for a booking. `/bookings/mine` is intentionally slim. */
export function useBookingDetail(booking?: Pick<Booking, 'code' | 'contact_phone'> | null, enabled = true) {
  const { user } = useAuth();
  const phone = booking?.contact_phone || user?.phone || '';
  return useQuery({
    queryKey: ['booking-detail', booking?.code],
    enabled: enabled && !!booking?.code && phoneDigits(phone).length >= 9,
    staleTime: MINUTE,
    retry: false,
    queryFn: async () => (await api.get<{ booking: Booking }>(`/bookings/track${query({ code: booking!.code, phone })}`)).booking,
  });
}

/* ------------------------------------------------------------------------------- cart quote */
export const cartLineKey = (item: Pick<CartItem, 'listing_id' | 'option'>) => `${item.listing_id}::${item.option ?? ''}`;
/** Request body shared by /orders/quote and /orders/checkout. `option` is required for listings with sizes. */
export const quoteItems = (items: CartItem[]) => items.map((i) => ({ listing_id: i.listing_id, qty: i.qty, ...(i.option ? { option: i.option } : {}) }));

/** Server-priced quote (delivery fees, free-delivery threshold, availability) for the current cart. */
export function useCartQuote(items: CartItem[], mode: FulfilmentMode) {
  const key = items.map((i) => `${cartLineKey(i)}:${i.qty}`).join(',');
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const ticket = useRef(0);
  const reload = useCallback(async () => {
    if (!items.length) { setQuote(null); setError(''); return; }
    const mine = ++ticket.current;
    setLoading(true); setError('');
    try {
      const result = await api.post<CartQuote>('/orders/quote', { items: quoteItems(items), fulfilment_mode: mode });
      if (mine === ticket.current) setQuote(result);
    } catch (e) {
      if (mine === ticket.current) { setQuote(null); setError(errorMessage(e)); }
    } finally { if (mine === ticket.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mode]);
  useEffect(() => { void reload(); }, [reload]);
  return { quote, error, loading, reload };
}

/* ----------------------------------------------------------------------------- market listing */
export type SortKey = 'popular' | 'newest' | 'price_asc' | 'price_desc' | 'rating';
export const SORT_LABELS: Record<SortKey, string> = {
  popular: 'Popular', newest: 'Newest', price_asc: 'Price: low to high', price_desc: 'Price: high to low', rating: 'Top rated',
};
export type MarketFilters = { q: string; kind: '' | 'product' | 'service'; category: string; sort: SortKey; min: string; max: string; city: string };

const byRating = (a: Listing, b: Listing) => {
  const ra = ratingOf(a); const rb = ratingOf(b);
  return (rb?.avg ?? 0) - (ra?.avg ?? 0) || (rb?.count ?? 0) - (ra?.count ?? 0);
};

/**
 * Paged listing search shared by Categories and Services. The API cannot sort by rating, so "Top rated"
 * loads the largest page it allows and orders those results on the phone.
 */
export function useMarket(filters: MarketFilters, pageSize = 20) {
  const { q, kind, category, sort, min, max, city } = filters;
  const [items, setItems] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(0);
  const size = sort === 'rating' ? 60 : pageSize;

  const fetchPage = useCallback(async (offset: number) => {
    const ticket = ++latest.current;
    const result = await api.get<{ listings: Listing[]; total: number }>(
      `/listings${query({ q, kind, category, city: cityParam(city), sort: sort === 'rating' ? 'popular' : sort, min, max, limit: size, offset })}`,
    );
    return ticket === latest.current ? result : null; // ignore answers to an older search
  }, [q, kind, category, city, sort, min, max, size]);

  const reload = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const result = await fetchPage(0);
      if (result) { setItems(sort === 'rating' ? [...result.listings].sort(byRating) : result.listings); setTotal(result.total); rememberImages(result.listings); }
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [fetchPage, sort]);
  useEffect(() => { void reload(); }, [reload]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || items.length >= total) return;
    setLoadingMore(true);
    try {
      const result = await fetchPage(items.length);
      if (result) {
        setItems((old) => { const next = [...old, ...result.listings.filter((l) => !old.some((o) => o.id === l.id))]; return sort === 'rating' ? next.sort(byRating) : next; });
        setTotal(result.total); rememberImages(result.listings);
      }
    } catch { /* keep what is shown; pull to refresh retries */ }
    finally { setLoadingMore(false); }
  }, [fetchPage, items.length, loading, loadingMore, sort, total]);

  return { items, total, loading, loadingMore, refreshing, error, reload, loadMore };
}

/** Debounces a fast-changing value (the search box) before it hits the network. */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return debounced;
}
