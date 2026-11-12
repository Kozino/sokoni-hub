/**
 * Offers engine: coupon codes, automatic discounts, free and reduced delivery.
 *
 * Funded by Sokoni Hub, never by the vendor or the rider. That is achieved by never touching
 * the two numbers they are paid from:
 *
 *   orders.subtotal      goods value        -> vendor wallet credit and statements
 *   orders.delivery_fee  delivery fee       -> rider pay
 *
 * A discount is recorded beside them (orders.discount, orders.delivery_discount) and
 * total = subtotal + delivery_fee - discount - delivery_discount is what the buyer pays and the
 * rider collects. See db/migrations/031_offers.sql.
 *
 * `evaluateOffers` is a pure function so the rules can be tested without a database. Both
 * POST /orders/quote and POST /orders/checkout go through `priceWithOffers`, so the number the
 * buyer is shown is the number that is charged.
 */
import { createHash } from 'crypto';
import { one, pool } from './db';
import { round2, type VendorQuote } from './delivery';
import { charge } from './security';

export type OfferKind = 'percent_off' | 'amount_off' | 'free_delivery' | 'delivery_percent_off' | 'delivery_amount_off';
export const GOODS_KINDS: OfferKind[] = ['percent_off', 'amount_off'];
export const DELIVERY_KINDS: OfferKind[] = ['free_delivery', 'delivery_percent_off', 'delivery_amount_off'];
export const isDeliveryKind = (kind: OfferKind) => DELIVERY_KINDS.includes(kind);

/**
 * A customer never pays less than this per order. The driver app asks the rider to confirm the cash
 * they collected, and the cash ledger rejects a zero amount, so an order must always have something to collect.
 */
export const MIN_PAYABLE = 1;

/* ------------------------------------------------------------------------------------- types */
export interface OfferRow {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  kind: OfferKind;
  value: number;
  max_discount: number | null;
  min_subtotal: number;
  scope: 'all' | 'vendor' | 'category';
  vendor_id: string | null;
  category_id: string | null;
  fulfilment: 'any' | 'delivery' | 'pickup';
  first_order_only: boolean;
  usage_limit: number | null;
  per_customer_limit: number | null;
  budget_total: number | null;
  starts_at: Date;
  ends_at: Date;
  is_active: boolean;
  show_in_app: boolean;
  badge: string | null;
  accent: string;
  priority: number;
  currency: string;
}

export interface OfferUsage {
  /** Checkouts that used the offer (cancelled orders excluded). */
  used_total: number;
  used_by_customer: number;
  /** QAR the platform has funded through it so far. */
  spent_total: number;
}

export interface OfferLine { listing_id: string; category_id: string | null; line: number }
/** One vendor's part of the cart: becomes one order. */
export interface OfferLeg {
  vendor_id: string;
  mode: 'pickup' | 'delivery';
  subtotal: number;
  delivery_fee: number;
  lines: OfferLine[];
}
export interface OfferCustomer {
  /** True when we know who is ordering (an account or a phone number). Limits are only enforced when known. */
  known: boolean;
  has_previous_order: boolean;
}

export interface AppliedOffer {
  offer_id: string;
  code: string | null;
  title: string;
  kind: OfferKind;
  goods_discount: number;
  delivery_discount: number;
}
export interface LegAdjustment {
  vendor_id: string;
  discount: number;
  delivery_discount: number;
  pieces: { offer_id: string; goods: number; delivery: number }[];
}
export interface OfferHint {
  offer_id: string;
  kind: OfferKind;
  title: string;
  text: string;
  /** QAR still to spend. */
  needed: number;
  /** 0..1 */
  progress: number;
}
export interface OfferEvaluation {
  legs: LegAdjustment[];
  applied: AppliedOffer[];
  hints: OfferHint[];
  promo: { code: string; ok: boolean; message: string | null } | null;
}

/* ---------------------------------------------------------------------------------- helpers */
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));
const money = (n: number, currency: string) => `${fmt(round2(n))} ${currency}`;
/** One wording for "no such live code", so a draft, a paused offer and a made-up code look the same, and the quote route can recognise a wrong guess. */
export const CODE_NOT_VALID = 'That code is not valid.';
/**
 * Guessing codes. Wrong guesses are counted per customer (account, or IP for a guest). Once someone is over the limit, EVERY
 * code lookup from them is answered the same way, right or wrong, with the code ignored: a 429 on misses alone would still
 * tell them which guesses were hits. The cart itself keeps working, just without a code, so a shopper with an old saved code
 * is never locked out of their own cart. Valid, expired and used-up codes are never counted.
 */
export const PROMO_MISS_LIMIT = 60;
export const PROMO_MISS_WINDOW_SECONDS = 900;
export const CODE_THROTTLED = 'Too many wrong codes. Please try again in a few minutes.';
const missKey = (identity: string) => `promo-miss:${identity}`;
export async function promoLockedOut(identity: string): Promise<boolean> {
  const hash = createHash('sha256').update(missKey(identity)).digest('hex');
  const row = await one<{ attempts: number }>('select attempts from security_rate_limits where key = $1 and resets_at > now()', [hash]);
  return !!row && row.attempts >= PROMO_MISS_LIMIT;
}
export async function recordPromoMiss(identity: string): Promise<void> {
  // `charge` counts the attempt and throws once the window is over its limit; the count is all we need here.
  await charge(missKey(identity), PROMO_MISS_LIMIT, PROMO_MISS_WINDOW_SECONDS).catch(() => {});
}

export const normalizeCode = (value?: string | null) => {
  const code = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  return code || null;
};

/** Digits of a phone number, Qatar numbers normalised to 974XXXXXXXX, so the same person is the same key. */
export function phoneKey(raw?: string | null): string {
  let digits = String(raw ?? '').replace(/\D/g, '').replace(/^00/, '');
  if (digits.length === 8) digits = `974${digits}`;
  return digits;
}
/** Forms an older order may have stored the same number in. */
export function phoneVariants(key: string): string[] {
  if (!key) return [];
  return key.length === 11 && key.startsWith('974') ? [key, key.slice(3)] : [key];
}

/** Splits `total` over `weights` in whole cents (largest remainder), so the parts always add up exactly. */
export function allocate(total: number, weights: number[]): number[] {
  const cents = Math.round(total * 100);
  const sum = weights.reduce((a, b) => a + b, 0);
  if (cents <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (cents * w) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let left = cents - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors.map((c) => c / 100);
}

/* --------------------------------------------------------------------------------- the engine */
type Eligible =
  | { ok: true; legs: { leg: OfferLeg; lines: OfferLine[] }[]; eligibleSubtotal: number }
  | { ok: false; reason: string; needed?: number; progress?: number };

export function evaluateOffers(input: {
  now: Date;
  offers: OfferRow[];
  usage: Map<string, OfferUsage>;
  legs: OfferLeg[];
  customer: OfferCustomer;
  currency: string;
  code?: string | null;
}): OfferEvaluation {
  const { now, offers, usage, legs, customer, currency } = input;
  const entered = normalizeCode(input.code);
  const nowMs = now.getTime();
  const usageOf = (o: OfferRow): OfferUsage => usage.get(o.id) ?? { used_total: 0, used_by_customer: 0, spent_total: 0 };
  const remainingBudget = (o: OfferRow) => (o.budget_total == null ? null : Math.max(0, round2(o.budget_total - usageOf(o).spent_total)));

  const check = (o: OfferRow): Eligible => {
    const u = usageOf(o);
    if (o.currency !== currency) return { ok: false, reason: 'This offer is not available for this order.' };
    if (!o.is_active || o.starts_at.getTime() > nowMs) return { ok: false, reason: CODE_NOT_VALID };
    if (o.ends_at.getTime() <= nowMs) return { ok: false, reason: 'This offer has ended.' };
    if (o.usage_limit != null && u.used_total >= o.usage_limit) return { ok: false, reason: 'This offer has been fully claimed.' };
    if (o.budget_total != null && u.spent_total >= o.budget_total) return { ok: false, reason: 'This offer has been fully claimed.' };
    if (customer.known && o.per_customer_limit != null && u.used_by_customer >= o.per_customer_limit) {
      return { ok: false, reason: o.per_customer_limit === 1 ? 'You have already used this offer.' : 'You have reached the limit for this offer.' };
    }
    if (o.first_order_only && customer.has_previous_order) return { ok: false, reason: 'This offer is for first orders only.' };

    const modeOk = (leg: OfferLeg) => o.fulfilment === 'any' || o.fulfilment === leg.mode;
    const lineOk = (leg: OfferLeg, line: OfferLine) =>
      o.scope === 'all' || (o.scope === 'vendor' && leg.vendor_id === o.vendor_id) || (o.scope === 'category' && line.category_id === o.category_id);
    let eligible = legs
      .map((leg) => ({ leg, lines: modeOk(leg) ? leg.lines.filter((line) => lineOk(leg, line)) : [] }))
      .filter((entry) => entry.lines.length > 0);
    if (!eligible.length) {
      return {
        ok: false,
        reason: o.fulfilment === 'delivery' ? 'This offer is for delivery orders only.'
          : o.fulfilment === 'pickup' ? 'This offer is for store collection only.'
          : 'This offer does not apply to the items in your cart.',
      };
    }
    const eligibleSubtotal = round2(eligible.reduce((sum, entry) => sum + entry.lines.reduce((s, l) => s + l.line, 0), 0));

    if (isDeliveryKind(o.kind)) {
      const withFee = eligible.filter((entry) => entry.leg.mode === 'delivery' && entry.leg.delivery_fee > 0);
      if (!withFee.length) {
        const anyDelivery = eligible.some((entry) => entry.leg.mode === 'delivery');
        return { ok: false, reason: anyDelivery ? 'Your order already has free delivery.' : 'This offer is for delivery orders only.' };
      }
      eligible = withFee;
    }
    if (eligibleSubtotal < o.min_subtotal) {
      const needed = round2(o.min_subtotal - eligibleSubtotal);
      return { ok: false, reason: `Add ${money(needed, currency)} more to use this offer.`, needed, progress: Math.max(0, Math.min(1, eligibleSubtotal / o.min_subtotal)) };
    }
    return { ok: true, legs: eligible, eligibleSubtotal };
  };

  /** What an eligible offer would save, split over the legs it applies to. */
  const price = (o: OfferRow, e: Extract<Eligible, { ok: true }>): { total: number; perLeg: Map<string, number> } => {
    const budget = remainingBudget(o);
    const cap = (value: number) => {
      let v = value;
      if (o.max_discount != null) v = Math.min(v, o.max_discount);
      if (budget != null) v = Math.min(v, budget);
      return Math.max(0, round2(v));
    };
    const perLeg = new Map<string, number>();
    if (!isDeliveryKind(o.kind)) {
      const raw = o.kind === 'percent_off' ? round2((e.eligibleSubtotal * o.value) / 100) : Math.min(o.value, e.eligibleSubtotal);
      const total = Math.min(cap(raw), e.eligibleSubtotal);
      const weights = e.legs.map((entry) => entry.lines.reduce((s, l) => s + l.line, 0));
      const parts = allocate(total, weights);
      e.legs.forEach((entry, i) => perLeg.set(entry.leg.vendor_id, parts[i]));
      return { total: round2(parts.reduce((a, b) => a + b, 0)), perLeg };
    }
    const wanted = e.legs.map(({ leg }) => {
      const fee = leg.delivery_fee;
      if (o.kind === 'free_delivery') return fee;
      if (o.kind === 'delivery_percent_off') return round2((fee * o.value) / 100);
      return Math.min(o.value, fee);
    });
    const uncapped = round2(wanted.reduce((a, b) => a + b, 0));
    const total = cap(uncapped);
    const parts = total < uncapped ? allocate(total, wanted) : wanted;
    e.legs.forEach((entry, i) => perLeg.set(entry.leg.vendor_id, parts[i]));
    return { total: round2(parts.reduce((a, b) => a + b, 0)), perLeg };
  };

  // ---- candidates: automatic offers plus the code the buyer typed
  const byCode = entered ? offers.find((o) => o.code != null && normalizeCode(o.code) === entered) : undefined;
  const automatic = offers.filter((o) => o.code == null);
  // held in an object: it is assigned inside the closure below, which TypeScript's flow analysis cannot see
  const state: { promo: OfferEvaluation['promo'] } = { promo: null };
  if (entered && !byCode) state.promo = { code: entered, ok: false, message: CODE_NOT_VALID };

  type Pick = { offer: OfferRow; eligible: Extract<Eligible, { ok: true }>; priced: ReturnType<typeof price> };
  const best: { goods: Pick | null; delivery: Pick | null } = { goods: null, delivery: null };
  const hintsRaw: OfferHint[] = [];

  const consider = (o: OfferRow, isEntered: boolean) => {
    const result = check(o);
    if (!result.ok) {
      if (isEntered) state.promo = { code: entered as string, ok: false, message: result.reason };
      else if (result.needed != null) hintsRaw.push({ offer_id: o.id, kind: o.kind, title: o.title, needed: result.needed, progress: result.progress ?? 0, text: hintText(o, result.needed, currency) });
      return;
    }
    const priced = price(o, result);
    if (priced.total <= 0) {
      if (isEntered) state.promo = { code: entered as string, ok: false, message: 'This offer does not apply to your order.' };
      return;
    }
    const slot = isDeliveryKind(o.kind) ? 'delivery' : 'goods';
    const current = best[slot];
    const candidate: Pick = { offer: o, eligible: result, priced };
    const beats = !current
      || (isEntered && !(current.offer.code != null && normalizeCode(current.offer.code) === entered))
      || (!(current.offer.code != null && normalizeCode(current.offer.code) === entered)
        && (priced.total > current.priced.total || (priced.total === current.priced.total && o.priority > current.offer.priority)));
    if (beats) best[slot] = candidate;
    if (isEntered) state.promo = { code: entered as string, ok: true, message: `${o.title} applied` };
  };

  if (byCode) consider(byCode, true);
  [...automatic].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)).forEach((o) => consider(o, false));

  // ---- apply: at most one goods offer and one delivery offer per order
  const adjustments = new Map<string, LegAdjustment>(legs.map((leg) => [leg.vendor_id, { vendor_id: leg.vendor_id, discount: 0, delivery_discount: 0, pieces: [] }]));
  const addPiece = (slot: 'goods' | 'delivery', pick: Pick | null) => {
    if (!pick) return;
    for (const [vendorId, amount] of pick.priced.perLeg) {
      if (amount <= 0) continue;
      const adj = adjustments.get(vendorId) as LegAdjustment;
      if (slot === 'goods') adj.discount = round2(adj.discount + amount);
      else adj.delivery_discount = round2(adj.delivery_discount + amount);
      adj.pieces.push({ offer_id: pick.offer.id, goods: slot === 'goods' ? amount : 0, delivery: slot === 'delivery' ? amount : 0 });
    }
  };
  addPiece('goods', best.goods);
  addPiece('delivery', best.delivery);

  // ---- floor: never charge less than MIN_PAYABLE for an order (trim goods first, then delivery)
  for (const leg of legs) {
    const adj = adjustments.get(leg.vendor_id) as LegAdjustment;
    const gross = round2(leg.subtotal + leg.delivery_fee);
    const room = round2(gross - Math.min(MIN_PAYABLE, gross));
    const total = round2(adj.discount + adj.delivery_discount);
    if (total <= room) continue;
    let excess = round2(total - room);
    const cutGoods = Math.min(adj.discount, excess);
    adj.discount = round2(adj.discount - cutGoods);
    excess = round2(excess - cutGoods);
    adj.delivery_discount = round2(adj.delivery_discount - excess);
    // keep the per-offer pieces consistent with the trimmed totals
    let goodsLeft = adj.discount;
    let deliveryLeft = adj.delivery_discount;
    for (const piece of adj.pieces) {
      if (piece.goods > 0) { piece.goods = Math.min(piece.goods, goodsLeft); goodsLeft = round2(goodsLeft - piece.goods); }
      if (piece.delivery > 0) { piece.delivery = Math.min(piece.delivery, deliveryLeft); deliveryLeft = round2(deliveryLeft - piece.delivery); }
    }
    adj.pieces = adj.pieces.filter((p) => p.goods > 0 || p.delivery > 0);
  }

  // ---- what was applied, per offer
  const appliedMap = new Map<string, AppliedOffer>();
  const titleOf = new Map(offers.map((o) => [o.id, o]));
  for (const adj of adjustments.values()) {
    for (const piece of adj.pieces) {
      const offer = titleOf.get(piece.offer_id) as OfferRow;
      const row = appliedMap.get(piece.offer_id) ?? { offer_id: offer.id, code: offer.code, title: offer.title, kind: offer.kind, goods_discount: 0, delivery_discount: 0 };
      row.goods_discount = round2(row.goods_discount + piece.goods);
      row.delivery_discount = round2(row.delivery_discount + piece.delivery);
      appliedMap.set(piece.offer_id, row);
    }
  }
  const applied = [...appliedMap.values()].filter((a) => a.goods_discount > 0 || a.delivery_discount > 0);
  // if trimming removed the typed code's saving entirely, say so rather than claim it applied
  if (state.promo?.ok && byCode && !appliedMap.has(byCode.id)) {
    state.promo = { code: entered as string, ok: false, message: 'This offer does not apply to your order.' };
  }

  // ---- hints: the nearest automatic offers the buyer could still unlock (only for a kind not already applied)
  const hints = hintsRaw
    .filter((h) => (isDeliveryKind(h.kind) ? !best.delivery : !best.goods))
    .sort((a, b) => a.needed - b.needed)
    .slice(0, 2);

  return { legs: [...adjustments.values()], applied, hints, promo: state.promo };
}

function hintText(o: OfferRow, needed: number, currency: string): string {
  const more = `Add ${money(needed, currency)} more`;
  switch (o.kind) {
    case 'free_delivery': return `${more} for FREE delivery`;
    case 'delivery_percent_off': return `${more} for ${fmt(o.value)}% off delivery`;
    case 'delivery_amount_off': return `${more} to save ${money(o.value, currency)} on delivery`;
    case 'percent_off': return `${more} to get ${fmt(o.value)}% off`;
    default: return `${more} to save ${money(o.value, currency)}`;
  }
}

/* ----------------------------------------------------------------------------- database layer */
/** Anything with a pg-style query: the shared pool, or the client of an open transaction. */
type Db = { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> };

let readyCache: { ok: boolean; at: number } | null = null;
/**
 * True once migration 031 has been applied. Until then every offers feature stays off and checkout
 * behaves exactly as before, so deploying this code ahead of the migration cannot break ordering.
 */
export async function offersReady(): Promise<boolean> {
  if (readyCache?.ok) return true;
  if (readyCache && Date.now() - readyCache.at < 30_000) return false;
  try {
    const r = await pool.query(
      `select to_regclass('public.offers') is not null as t,
              exists(select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'orders' and column_name = 'offers_applied') as c`,
    );
    readyCache = { ok: !!(r.rows[0].t && r.rows[0].c), at: Date.now() };
  } catch {
    readyCache = { ok: false, at: Date.now() };
  }
  return readyCache.ok;
}

export const toOffer = (r: any): OfferRow => ({
  id: r.id,
  code: r.code,
  title: r.title,
  description: r.description,
  kind: r.kind,
  value: Number(r.value),
  max_discount: r.max_discount == null ? null : Number(r.max_discount),
  min_subtotal: Number(r.min_subtotal),
  scope: r.scope,
  vendor_id: r.vendor_id,
  category_id: r.category_id,
  fulfilment: r.fulfilment,
  first_order_only: r.first_order_only,
  usage_limit: r.usage_limit,
  per_customer_limit: r.per_customer_limit,
  budget_total: r.budget_total == null ? null : Number(r.budget_total),
  starts_at: new Date(r.starts_at),
  ends_at: new Date(r.ends_at),
  is_active: r.is_active,
  show_in_app: r.show_in_app,
  badge: r.badge,
  accent: r.accent,
  priority: r.priority,
  currency: r.currency,
});

/** Redemption counts and platform spend per offer. Cancelled orders do not count: a cancelled order frees its use. */
export async function loadUsage(db: Db, offerIds: string[], who: { userId: string | null; phone: string }): Promise<Map<string, OfferUsage>> {
  const out = new Map<string, OfferUsage>();
  if (!offerIds.length) return out;
  const variants = phoneVariants(who.phone);
  const { rows } = await db.query(
    `select r.offer_id,
            count(distinct r.checkout_key)::int as used_total,
            coalesce(sum(r.goods_discount + r.delivery_discount), 0)::numeric as spent_total,
            count(distinct r.checkout_key) filter (
              where ($2::uuid is not null and r.user_id = $2::uuid)
                 or (cardinality($3::text[]) > 0 and r.phone_key = any($3::text[]))
            )::int as used_by_customer
       from offer_redemptions r
       join orders o on o.id = r.order_id and o.status <> 'cancelled'
      where r.offer_id = any($1::uuid[])
      group by r.offer_id`,
    [offerIds, who.userId, variants],
  );
  for (const r of rows) out.set(r.offer_id, { used_total: r.used_total, used_by_customer: r.used_by_customer, spent_total: Number(r.spent_total) });
  return out;
}

async function hasPreviousOrder(db: Db, who: { userId: string | null; phone: string }): Promise<boolean> {
  const variants = phoneVariants(who.phone);
  if (!who.userId && !variants.length) return false;
  const { rows } = await db.query(
    `select 1 from orders
      where status <> 'cancelled'
        and (($1::uuid is not null and buyer_id = $1::uuid)
          or (cardinality($2::text[]) > 0 and regexp_replace(contact_phone, '\\D', '', 'g') = any($2::text[])))
      limit 1`,
    [who.userId, variants],
  );
  return rows.length > 0;
}

export interface OfferContext { code?: string | null; userId: string | null; phone?: string | null; lock?: boolean }

export async function loadOfferInputs(db: Db, ctx: OfferContext) {
  const code = normalizeCode(ctx.code);
  const key = phoneKey(ctx.phone);
  const candidates = `(
      (code is null and is_active and starts_at <= now() and ends_at > now())
      or ($1::text is not null and code is not null and upper(code) = $1::text)
    )`;
  if (ctx.lock) {
    // Offers with limits are locked for the length of the checkout, so two buyers cannot both take the last use or overspend the budget.
    await db.query(
      `select id from offers
        where ${candidates} and (usage_limit is not null or budget_total is not null or per_customer_limit is not null)
        order by id for update`,
      [code],
    );
  }
  const { rows } = await db.query(`select * from offers where ${candidates} order by priority desc, id`, [code]);
  const offers = rows.map(toOffer);
  const who = { userId: ctx.userId, phone: key };
  const usage = await loadUsage(db, offers.map((o) => o.id), who);
  const customer: OfferCustomer = {
    known: !!(ctx.userId || key),
    has_previous_order: offers.some((o) => o.first_order_only) ? await hasPreviousOrder(db, who) : false,
  };
  return { offers, usage, customer };
}

/* ------------------------------------------------------------------- pricing a cart with offers */
export interface PricedVendor {
  quote: VendorQuote;
  lines: { r: any; qty: number; line: number }[];
}
export interface OfferedVendor { discount: number; delivery_discount: number; total: number; pieces: LegAdjustment['pieces'] }
export interface OfferedPricing {
  byVendor: Map<string, OfferedVendor>;
  evaluation: OfferEvaluation;
  totals: { subtotal: number; delivery_fee: number; discount: number; delivery_discount: number; total: number; currency: string };
}

export async function priceWithOffers(db: Db, priced: PricedVendor[], ctx: OfferContext): Promise<OfferedPricing> {
  const currency = priced[0]?.quote.currency || 'QAR';
  const legs: OfferLeg[] = priced.map((p) => ({
    vendor_id: p.quote.vendor_id,
    mode: p.quote.mode,
    subtotal: p.quote.subtotal,
    delivery_fee: p.quote.delivery_fee,
    lines: p.lines.map((l) => ({ listing_id: l.r.id, category_id: l.r.category_id ?? null, line: l.line })),
  }));
  const inputs = await loadOfferInputs(db, ctx);
  const evaluation = evaluateOffers({ now: new Date(), offers: inputs.offers, usage: inputs.usage, legs, customer: inputs.customer, currency, code: ctx.code });

  const byVendor = new Map<string, OfferedVendor>();
  const totals = { subtotal: 0, delivery_fee: 0, discount: 0, delivery_discount: 0, total: 0, currency };
  for (const p of priced) {
    const adj = evaluation.legs.find((l) => l.vendor_id === p.quote.vendor_id) as LegAdjustment;
    const total = round2(p.quote.subtotal + p.quote.delivery_fee - adj.discount - adj.delivery_discount);
    byVendor.set(p.quote.vendor_id, { discount: adj.discount, delivery_discount: adj.delivery_discount, total, pieces: adj.pieces });
    totals.subtotal = round2(totals.subtotal + p.quote.subtotal);
    totals.delivery_fee = round2(totals.delivery_fee + p.quote.delivery_fee);
    totals.discount = round2(totals.discount + adj.discount);
    totals.delivery_discount = round2(totals.delivery_discount + adj.delivery_discount);
    totals.total = round2(totals.total + total);
  }
  return { byVendor, evaluation, totals };
}

/** The quote the buyer sees when offers are on: the base quote plus the discount lines. */
export function offeredQuoteResponse(quotes: VendorQuote[], offered: OfferedPricing) {
  return {
    vendors: quotes.map((q) => {
      const o = offered.byVendor.get(q.vendor_id) as OfferedVendor;
      return { ...q, discount: o.discount, delivery_discount: o.delivery_discount, total: o.total };
    }),
    ...offered.totals,
    applied_offers: offered.evaluation.applied,
    hints: offered.evaluation.hints,
    promo: offered.evaluation.promo,
  };
}
