/**
 * Delivery fee calculation — the single source of truth.
 *
 * Both POST /orders/quote (what the buyer is shown) and POST /orders/checkout
 * (what the buyer is charged) call `quoteVendorOrder`. They cannot drift,
 * which is the whole point: the number on the button is the number in the row.
 *
 * Sokoni Hub handles delivery. Admin sets the fee and radius; vendors only
 * choose collection vs Sokoni delivery, and their pickup address.
 */
import { one, query } from './db';

export type FulfilmentMode = 'pickup' | 'delivery';

export interface VendorDeliverySettings {
  vendor_id: string;
  offers_pickup: boolean;
  offers_delivery: boolean;
  delivery_fee: number | string;
  free_delivery_over: number | string | null;
  delivery_radius_km: number | string | null;
  pickup_address: string | null;
  delivery_notes: string | null;
}

/** Money is 2dp. Avoids 0.1 + 0.2 drifting into the stored total. */
/** Fallback when a cart somehow carries no currency. */
export const DEFAULT_CURRENCY = 'QAR';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const num = (v: number | string | null | undefined, fallback = 0): number => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Default settings for a vendor with no row yet — pickup only, no delivery.
 * Conservative: we never invent a delivery capability a vendor didn't opt into.
 * Fee and radius always come from platformDelivery(), not these defaults.
 */
export const defaultSettings = (vendor_id: string): VendorDeliverySettings => ({
  vendor_id,
  offers_pickup: true,
  offers_delivery: false,
  delivery_fee: 0,
  free_delivery_over: null,
  delivery_radius_km: null,
  pickup_address: null,
  delivery_notes: null,
});

export type PlatformDelivery = {
  delivery_fee: number;
  delivery_radius_km: number | null;
  free_delivery_over: number | null;
};

export const DEFAULT_PLATFORM_DELIVERY: PlatformDelivery = {
  delivery_fee: 0,
  delivery_radius_km: null,
  free_delivery_over: null,
};

export function normalizePlatformDelivery(raw: Partial<PlatformDelivery> | null | undefined): PlatformDelivery {
  const fee = round2(Math.max(0, num(raw?.delivery_fee, 0)));
  const radiusRaw = raw?.delivery_radius_km as number | string | null | undefined;
  const freeRaw = raw?.free_delivery_over as number | string | null | undefined;
  const radius = radiusRaw === null || radiusRaw === undefined || radiusRaw === '' ? NaN : num(radiusRaw, NaN);
  const free = freeRaw === null || freeRaw === undefined || freeRaw === '' ? NaN : num(freeRaw, NaN);
  return {
    delivery_fee: fee,
    delivery_radius_km: Number.isFinite(radius) && radius > 0 ? round2(radius) : null,
    free_delivery_over: Number.isFinite(free) && free >= 0 ? round2(free) : null,
  };
}

export async function platformDelivery(): Promise<PlatformDelivery> {
  const row = await one<{ value: Partial<PlatformDelivery> }>("select value from system_settings where key = 'delivery'").catch(() => null);
  return normalizePlatformDelivery(row?.value);
}

export async function savePlatformDelivery(next: PlatformDelivery): Promise<PlatformDelivery> {
  const value = normalizePlatformDelivery(next);
  await query(
    `insert into system_settings (key, value, updated_at) values ('delivery', $1::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(value)],
  );
  await query(
    `update vendor_delivery_settings
        set delivery_fee = $1,
            delivery_radius_km = $2,
            free_delivery_over = $3,
            updated_at = now()`,
    [value.delivery_fee, value.delivery_radius_km, value.free_delivery_over],
  );
  return value;
}

/** Overlay admin fee/radius onto a vendor's fulfilment flags and pickup address. */
export function applyPlatformDelivery(settings: VendorDeliverySettings | null, platform: PlatformDelivery): VendorDeliverySettings | null {
  if (!settings) return null;
  return {
    ...settings,
    delivery_fee: platform.delivery_fee,
    delivery_radius_km: platform.delivery_radius_km,
    free_delivery_over: platform.free_delivery_over,
  };
}

/** Stamp platform fee/radius onto a joined vendor/listing row used by quote and checkout. */
export function overlayPlatformOnRow(row: Record<string, unknown>, platform: PlatformDelivery) {
  row.v_delivery_fee = platform.delivery_fee;
  row.delivery_fee = platform.delivery_fee;
  row.free_delivery_over = platform.free_delivery_over;
  row.delivery_radius_km = platform.delivery_radius_km;
  return row;
}

/**
 * Delivery fee for one vendor's portion of a cart.
 *
 *  - pickup                      -> 0
 *  - vendor doesn't deliver      -> 0 (caller should reject the mode instead)
 *  - subtotal >= free threshold  -> 0
 *  - otherwise                   -> the platform flat fee (admin)
 */
export function deliveryFeeFor(
  settings: VendorDeliverySettings | null,
  subtotal: number,
  mode: FulfilmentMode
): number {
  if (mode === 'pickup') return 0;
  if (!settings || !settings.offers_delivery) return 0;

  const threshold = settings.free_delivery_over;
  if (threshold !== null && threshold !== undefined && threshold !== '') {
    const t = num(threshold, Infinity);
    // A threshold of 0 would mean "always free", which is a legitimate choice.
    if (subtotal >= t) return 0;
  }

  return round2(Math.max(0, num(settings.delivery_fee)));
}

export interface VendorQuote {
  vendor_id: string;
  vendor_name: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  currency: string;
  mode: FulfilmentMode;
  offers_pickup: boolean;
  offers_delivery: boolean;
  free_delivery_over: number | null;
  delivery_radius_km: number | null;
  pickup_address: string | null;
  delivery_notes: string | null;
  /** Set when the requested mode isn't available from this vendor. */
  unavailable?: string;
}

/**
 * Price one vendor's lines. `subtotal` is computed by the caller from
 * authoritative DB prices — never from the client.
 */
export function quoteVendorOrder(input: {
  vendor_id: string;
  vendor_name: string;
  subtotal: number;
  currency: string;
  mode: FulfilmentMode;
  settings: VendorDeliverySettings | null;
}): VendorQuote {
  const s = input.settings ?? defaultSettings(input.vendor_id);
  const subtotal = round2(input.subtotal);

  // Fall back to a mode the vendor actually supports rather than silently
  // charging for a service they don't offer.
  let mode = input.mode;
  let unavailable: string | undefined;

  if (mode === 'delivery' && !s.offers_delivery) {
    unavailable = 'This store does not deliver — collection only.';
    mode = 'pickup';
  } else if (mode === 'pickup' && !s.offers_pickup) {
    unavailable = 'This store does not offer collection — delivery only.';
    mode = 'delivery';
  }

  const delivery_fee = deliveryFeeFor(s, subtotal, mode);

  return {
    vendor_id: input.vendor_id,
    vendor_name: input.vendor_name,
    subtotal,
    delivery_fee,
    total: round2(subtotal + delivery_fee),
    currency: input.currency,
    mode,
    offers_pickup: s.offers_pickup,
    offers_delivery: s.offers_delivery,
    free_delivery_over:
      s.free_delivery_over === null || s.free_delivery_over === undefined
        ? null
        : num(s.free_delivery_over),
    delivery_radius_km:
      s.delivery_radius_km === null || s.delivery_radius_km === undefined
        ? null
        : num(s.delivery_radius_km),
    pickup_address: s.pickup_address,
    delivery_notes: s.delivery_notes,
    ...(unavailable ? { unavailable } : {}),
  };
}

/** Roll per-vendor quotes into cart-level figures. */
export function cartTotals(quotes: VendorQuote[]) {
  return {
    subtotal: round2(quotes.reduce((s, q) => s + q.subtotal, 0)),
    delivery_fee: round2(quotes.reduce((s, q) => s + q.delivery_fee, 0)),
    total: round2(quotes.reduce((s, q) => s + q.total, 0)),
    currency: quotes[0]?.currency || DEFAULT_CURRENCY,
  };
}

/* ------------------------------------------------------------------ */
/* Geo                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Haversine distance in km, as a SQL fragment.
 *
 * The acos argument is clamped to [-1, 1]: floating-point rounding can push it
 * fractionally outside that range for near-identical points, and Postgres
 * throws `input is out of range` rather than returning 0. Do not remove the
 * least/greatest.
 */
export const distanceKmSql = (latParam: string, lngParam: string, latCol = 'v.lat', lngCol = 'v.lng') => `
  (6371 * acos(
     least(1, greatest(-1,
       cos(radians(${latParam})) * cos(radians(${latCol}))
         * cos(radians(${lngCol}) - radians(${lngParam}))
       + sin(radians(${latParam})) * sin(radians(${latCol}))
     ))
   ))`;
