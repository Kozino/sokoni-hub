/**
 * Server-priced cart quote, shared by POST /orders/quote and Sokoni Assistant.
 * Kept out of routes/orders.ts so the assistant does not import the orders router.
 */
import { pool, query } from './db';
import {
  quoteVendorOrder, cartTotals, round2, DEFAULT_CURRENCY,
  type FulfilmentMode, type VendorDeliverySettings,
} from './delivery';
import { HttpError } from './utils';
import { CODE_THROTTLED, normalizeCode, offeredQuoteResponse, offersReady, priceWithOffers, promoLockedOut } from './offers';

export type QuoteCartItem = { listing_id: string; qty: number; option?: string };

async function loadCart(items: QuoteCartItem[]) {
  const ids = Array.from(new Set(items.map((i) => i.listing_id)));
  const rows = await query<any>(
    `select l.*, v.id as vid, v.slug as vendor_slug, v.business_name, v.whatsapp, v.status as vendor_status,
            v.lat as vlat, v.lng as vlng,
            s.offers_pickup, s.offers_delivery, s.delivery_fee as v_delivery_fee,
            s.free_delivery_over, s.delivery_radius_km, s.pickup_address, s.delivery_notes
     from listings l
     join categories cat on cat.id=l.category_id
     join vendors v on v.id = l.vendor_id
     left join vendor_delivery_settings s on s.vendor_id = v.id
     where l.id = any($1::uuid[]) and cat.is_banned=false
     order by l.id`,
    [ids],
  );
  if (rows.length !== ids.length) throw new HttpError(400, 'One or more items are no longer available');

  for (const r of rows) {
    if (r.kind === 'service')
      throw new HttpError(422, `"${r.title}" is a service. Request a booking for it instead of adding it to your cart.`);
    if (r.status !== 'active' || r.vendor_status !== 'verified')
      throw new HttpError(400, `"${r.title}" is no longer available`);
    if (r.vlat === null || r.vlat === undefined || r.vlng === null || r.vlng === undefined)
      throw new HttpError(422, `${r.business_name} has not set its store location yet, so it cannot take orders. Please try again later.`);
    const want = items.filter((i) => i.listing_id === r.id).reduce((sum, i) => sum + i.qty, 0);
    if (r.quantity !== null && r.quantity < want)
      throw new HttpError(409, `Only ${r.quantity} left of "${r.title}"`);
  }

  const byVendor = new Map<string, any[]>();
  for (const r of rows) {
    const list = byVendor.get(r.vid) ?? [];
    list.push(r);
    byVendor.set(r.vid, list);
  }
  return byVendor;
}

const settingsOf = (r: any): VendorDeliverySettings | null =>
  r.offers_pickup === null || r.offers_pickup === undefined
    ? null
    : {
        vendor_id: r.vid,
        offers_pickup: r.offers_pickup,
        offers_delivery: r.offers_delivery,
        delivery_fee: r.v_delivery_fee,
        free_delivery_over: r.free_delivery_over,
        delivery_radius_km: r.delivery_radius_km,
        pickup_address: r.pickup_address,
        delivery_notes: r.delivery_notes,
      };

function resolveOption(r: any, option?: string): { unitPrice: number; optionName?: string } {
  let opts: any[] = [];
  try {
    const raw = typeof r.options === 'string' ? JSON.parse(r.options) : r.options;
    opts = Array.isArray(raw) ? raw : [];
  } catch { opts = []; }

  if (opts.length === 0) {
    if (option) throw new HttpError(400, `"${r.title}" no longer has the option "${option}". Please remove it from your cart and add it again.`);
    return { unitPrice: Number(r.price) };
  }
  if (!option) throw new HttpError(400, `Please choose a size/option for "${r.title}".`);

  const o = opts.find((x: any) => x?.name === option);
  if (!o) throw new HttpError(400, `The option "${option}" is no longer available for "${r.title}". Please remove it from your cart and add it again.`);

  const unitPrice = Number(o.price || r.price);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new HttpError(400, `"${r.title}" (${option}) has no valid price.`);
  return { unitPrice, optionName: o.name };
}

function priceCart(byVendor: Map<string, any[]>, items: QuoteCartItem[], mode: FulfilmentMode) {
  const quotes = [];
  for (const [vendorId, vItems] of byVendor) {
    let subtotal = 0;
    const vendorItems = items.filter((i) => vItems.some((v) => v.id === i.listing_id));
    const lines = vendorItems.map((i) => {
      const r = vItems.find((v) => v.id === i.listing_id)!;
      const { unitPrice, optionName } = resolveOption(r, i.option);
      const title = optionName ? `${r.title} (${optionName})` : r.title;
      const line = round2(unitPrice * i.qty);
      subtotal = round2(subtotal + line);
      return { r: { ...r, price: unitPrice, title }, qty: i.qty, line, option: optionName };
    });
    const q = quoteVendorOrder({
      vendor_id: vendorId,
      vendor_name: vItems[0].business_name,
      subtotal,
      currency: vItems[0].currency || DEFAULT_CURRENCY,
      mode,
      settings: settingsOf(vItems[0]),
    });
    quotes.push({ quote: q, lines, vItems });
  }
  return quotes;
}

/** Same pricing rules as POST /orders/quote. Does not place an order. */
export async function quoteBuyerCart(
  items: QuoteCartItem[],
  opts: {
    fulfilment_mode?: FulfilmentMode;
    offers?: boolean;
    promo_code?: string;
    userId?: string | null;
    phone?: string | null;
  } = {},
) {
  const mode = opts.fulfilment_mode || 'delivery';
  const byVendor = await loadCart(items);
  const priced = priceCart(byVendor, items, mode);
  const quotes = priced.map((p) => p.quote);
  if ((opts.offers === true || opts.promo_code) && (await offersReady())) {
    const identity = String(opts.userId || 'assistant');
    const locked = !!opts.promo_code && (await promoLockedOut(identity));
    const offered = await priceWithOffers(pool, priced, {
      code: locked ? undefined : opts.promo_code,
      userId: opts.userId ?? null,
      phone: opts.phone ?? null,
    });
    const response = offeredQuoteResponse(quotes, offered);
    if (locked) response.promo = { code: normalizeCode(opts.promo_code) ?? '', ok: false, message: CODE_THROTTLED };
    return response;
  }
  return { vendors: quotes, ...cartTotals(quotes) };
}
