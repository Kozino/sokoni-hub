import { Router } from 'express';
import { z } from 'zod';
import { one, pool, query } from '../db';
import { requireAuth } from '../auth';
import { HttpError, audit, validateUuidParam } from '../utils';
import { isDeliveryKind, loadUsage, normalizeCode, offersReady, type OfferKind } from '../offers';
import { campaignAudienceCounts, campaignTokens, sendCampaignPush } from '../campaignPush';

export const offerRouter = Router();
offerRouter.param('id', validateUuidParam);

/**
 * Offers: coupon codes, automatic discounts, free and reduced delivery. Funded by Sokoni Hub.
 *
 * Public:  GET /offers                       what the app's Offers rail shows (live, listed, not used up)
 * Admin:   /offers/admin/...                 create, edit, switch on and off, see what each one has cost
 *
 * An offer is created OFF (a draft) and only reaches customers once an admin switches it on. Whether it is
 * live, ended or used up is worked out on every read from the clock and the redemption rows. There is no job.
 * How a discount reaches an order, and why vendors and riders are unaffected, is in api/src/offers.ts.
 */

const KINDS = ['percent_off', 'amount_off', 'free_delivery', 'delivery_percent_off', 'delivery_amount_off'] as const;
const ACCENTS = ['green', 'orange', 'violet', 'sky', 'rose', 'amber'] as const;

/** Where tapping an offer takes the customer in the app (sokonihub:// links are routed by the app). */
function offerLink(r: { scope: string; vendor_slug?: string | null; category_slug?: string | null }): string {
  if (r.scope === 'vendor' && r.vendor_slug) return `sokonihub://store/${encodeURIComponent(r.vendor_slug)}`;
  if (r.scope === 'category' && r.category_slug) return `sokonihub://browse?category=${encodeURIComponent(r.category_slug)}`;
  return 'sokonihub://browse';
}

/* ----------------------------------------------------------------------------------- public */
offerRouter.get('/', async (req, res, next) => {
  try {
    if (!(await offersReady())) return res.json({ offers: [] });
    const rows = await query<any>(
      `select o.*, v.business_name as vendor_name, v.slug as vendor_slug, c.name as category_name, c.slug as category_slug
         from offers o
         left join vendors v on v.id = o.vendor_id
         left join categories c on c.id = o.category_id
        where o.is_active and o.show_in_app and o.starts_at <= now() and o.ends_at > now()
        order by o.priority desc, o.ends_at asc
        limit 40`,
    );
    const usage = await loadUsage(pool, rows.map((r) => r.id), { userId: req.user?.id ?? null, phone: '' });
    const offers = rows
      .filter((r) => {
        const u = usage.get(r.id);
        if (!u) return true;
        if (r.usage_limit != null && u.used_total >= r.usage_limit) return false;
        if (r.budget_total != null && u.spent_total >= Number(r.budget_total)) return false;
        // Hide what this signed-in customer has already used up, so the rail only shows things they can still use.
        if (req.user && r.per_customer_limit != null && u.used_by_customer >= r.per_customer_limit) return false;
        return true;
      })
      .map((r) => ({
        id: r.id,
        code: r.code,
        auto: r.code == null,
        title: r.title,
        description: r.description,
        kind: r.kind,
        value: Number(r.value),
        max_discount: r.max_discount == null ? null : Number(r.max_discount),
        min_subtotal: Number(r.min_subtotal),
        scope: r.scope,
        fulfilment: r.fulfilment,
        first_order_only: r.first_order_only,
        ends_at: r.ends_at,
        badge: r.badge,
        accent: r.accent,
        target: r.scope === 'vendor' ? { type: 'vendor', slug: r.vendor_slug, name: r.vendor_name } : r.scope === 'category' ? { type: 'category', slug: r.category_slug, name: r.category_name } : null,
        link: offerLink(r),
      }));
    res.json({ offers });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------------------------ admin */
const adminOnly = requireAuth('admin');

const offerSchema = z.object({
  title: z.string().trim().min(3, 'Give the offer a short title.').max(80),
  description: z.string().trim().max(240).nullable().optional(),
  // Empty or missing = applies automatically. Otherwise customers type it.
  code: z.string().trim().max(24).nullable().optional()
    .transform((v) => normalizeCode(v))
    .refine((v) => v === null || /^[A-Z0-9_-]{3,24}$/.test(v), 'Use 3 to 24 letters, numbers, - or _ for the code.'),
  kind: z.enum(KINDS),
  value: z.number().min(0).max(100000).default(0),
  max_discount: z.number().positive().max(1000000).nullable().optional(),
  min_subtotal: z.number().min(0).max(1000000).default(0),
  scope: z.enum(['all', 'vendor', 'category']).default('all'),
  vendor_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  fulfilment: z.enum(['any', 'delivery', 'pickup']).default('any'),
  first_order_only: z.boolean().default(false),
  usage_limit: z.number().int().positive().max(10_000_000).nullable().optional(),
  per_customer_limit: z.number().int().positive().max(1000).nullable().optional(),
  budget_total: z.number().positive().max(100_000_000).nullable().optional(),
  starts_at: z.string(),
  ends_at: z.string(),
  show_in_app: z.boolean().default(true),
  badge: z.string().trim().max(16).nullable().optional(),
  accent: z.enum(ACCENTS).default('green'),
  priority: z.number().int().min(-100).max(100).default(0),
}).superRefine((b, ctx) => {
  const bad = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (b.kind === 'percent_off' || b.kind === 'delivery_percent_off') {
    if (!(b.value > 0 && b.value <= 100)) bad('value', 'Enter a percentage between 1 and 100.');
  } else if (b.kind !== 'free_delivery' && !(b.value > 0)) {
    bad('value', 'Enter an amount greater than 0.');
  }
  if (b.scope === 'vendor' && !b.vendor_id) bad('vendor_id', 'Choose the store this offer is for.');
  if (b.scope === 'category' && !b.category_id) bad('category_id', 'Choose the category this offer is for.');
  if (isDeliveryKind(b.kind) && b.fulfilment === 'pickup') bad('fulfilment', 'A delivery offer cannot be limited to store collection.');
  const s = Date.parse(b.starts_at);
  const e = Date.parse(b.ends_at);
  if (Number.isNaN(s)) bad('starts_at', 'Enter a valid start date.');
  if (Number.isNaN(e)) bad('ends_at', 'Enter a valid end date.');
  if (!Number.isNaN(s) && !Number.isNaN(e) && e <= s) bad('ends_at', 'The end must be after the start.');
});
type OfferInput = z.infer<typeof offerSchema>;

/** What the admin sees: the stored row plus whether it is draft, paused, scheduled, live, ended or used up. */
type State = 'draft' | 'paused' | 'scheduled' | 'live' | 'expired' | 'exhausted';
function stateOf(r: any, now = new Date()): State {
  if (!r.is_active) return r.activated_at ? 'paused' : 'draft';
  if (new Date(r.ends_at) <= now) return 'expired';
  if (new Date(r.starts_at) > now) return 'scheduled';
  if ((r.usage_limit != null && Number(r.redemptions) >= r.usage_limit) || (r.budget_total != null && Number(r.funded) >= Number(r.budget_total))) return 'exhausted';
  return 'live';
}

const ADMIN_SELECT = `
  select o.*, v.business_name as vendor_name, v.slug as vendor_slug, c.name as category_name, c.slug as category_slug,
         coalesce(s.checkouts, 0)::int as redemptions,
         coalesce(s.funded, 0)::numeric as funded,
         coalesce(s.goods, 0)::numeric as funded_goods,
         coalesce(s.delivery, 0)::numeric as funded_delivery
    from offers o
    left join vendors v on v.id = o.vendor_id
    left join categories c on c.id = o.category_id
    left join lateral (
      select count(distinct r.checkout_key) as checkouts,
             sum(r.goods_discount + r.delivery_discount) as funded,
             sum(r.goods_discount) as goods,
             sum(r.delivery_discount) as delivery
        from offer_redemptions r
        join orders ord on ord.id = r.order_id and ord.status <> 'cancelled'
       where r.offer_id = o.id
    ) s on true`;

const shape = (r: any) => ({
  ...r,
  value: Number(r.value),
  max_discount: r.max_discount == null ? null : Number(r.max_discount),
  min_subtotal: Number(r.min_subtotal),
  budget_total: r.budget_total == null ? null : Number(r.budget_total),
  funded: Number(r.funded),
  funded_goods: Number(r.funded_goods),
  funded_delivery: Number(r.funded_delivery),
  state: stateOf(r),
  link: offerLink(r),
});

async function requireReady() {
  if (!(await offersReady())) throw new HttpError(503, 'Offers are not set up on this server yet. Run the 031_offers.sql migration first.');
}

/** GET /offers/admin: every offer with its state and what it has cost so far. */
offerRouter.get('/admin', adminOnly, async (_req, res, next) => {
  try {
    await requireReady();
    const rows = await query<any>(`${ADMIN_SELECT} order by o.created_at desc limit 300`);
    res.json({ offers: rows.map(shape) });
  } catch (e) { next(e); }
});

/** GET /offers/admin/summary: the headline numbers for the page. Qatar-time days and months. */
offerRouter.get('/admin/summary', adminOnly, async (_req, res, next) => {
  try {
    await requireReady();
    const row = await one<any>(
      `select
         (select count(*) from offers where is_active and starts_at <= now() and ends_at > now())::int as live,
         (select count(*) from offers where is_active and starts_at > now())::int as scheduled,
         (select count(*) from offers where not is_active and activated_at is null)::int as drafts,
         coalesce(sum(r.goods_discount + r.delivery_discount), 0)::numeric as funded_all,
         coalesce(sum(r.goods_discount + r.delivery_discount) filter (
           where (o.created_at at time zone 'Asia/Qatar')::date = (now() at time zone 'Asia/Qatar')::date), 0)::numeric as funded_today,
         coalesce(sum(r.goods_discount + r.delivery_discount) filter (
           where date_trunc('month', o.created_at at time zone 'Asia/Qatar') = date_trunc('month', now() at time zone 'Asia/Qatar')), 0)::numeric as funded_month,
         count(distinct r.checkout_key) filter (
           where date_trunc('month', o.created_at at time zone 'Asia/Qatar') = date_trunc('month', now() at time zone 'Asia/Qatar'))::int as checkouts_month
         from offer_redemptions r
         join orders o on o.id = r.order_id and o.status <> 'cancelled'`,
    );
    res.json({
      live: row.live, scheduled: row.scheduled, drafts: row.drafts, checkouts_month: row.checkouts_month,
      funded_today: Number(row.funded_today), funded_month: Number(row.funded_month), funded_all: Number(row.funded_all),
    });
  } catch (e) { next(e); }
});

async function assertTargets(b: OfferInput) {
  if (b.scope === 'vendor') {
    const v = await one<any>('select id, status, business_name from vendors where id = $1', [b.vendor_id]);
    if (!v) throw new HttpError(404, 'Store not found');
    if (v.status !== 'verified') throw new HttpError(400, `${v.business_name} is ${v.status}. Only verified stores can have an offer.`);
  }
  if (b.scope === 'category' && !(await one('select id from categories where id = $1', [b.category_id]))) throw new HttpError(404, 'Category not found');
}

async function assertCodeFree(code: string | null, exceptId?: string) {
  if (!code) return;
  const clash = await one<any>('select id, title from offers where upper(code) = $1 and ($2::uuid is null or id <> $2::uuid)', [code, exceptId ?? null]);
  if (clash) throw new HttpError(409, `The code ${code} is already used by “${clash.title}”.`);
}

const COLUMNS = (b: OfferInput) => ({
  code: b.code ?? null,
  title: b.title,
  description: b.description || null,
  kind: b.kind as OfferKind,
  value: b.kind === 'free_delivery' ? 0 : b.value,
  max_discount: b.max_discount ?? null,
  min_subtotal: b.min_subtotal,
  scope: b.scope,
  vendor_id: b.scope === 'vendor' ? b.vendor_id : null,
  category_id: b.scope === 'category' ? b.category_id : null,
  fulfilment: b.fulfilment,
  first_order_only: b.first_order_only,
  usage_limit: b.usage_limit ?? null,
  per_customer_limit: b.per_customer_limit ?? null,
  budget_total: b.budget_total ?? null,
  starts_at: new Date(b.starts_at).toISOString(),
  ends_at: new Date(b.ends_at).toISOString(),
  show_in_app: b.show_in_app,
  badge: b.badge || null,
  accent: b.accent,
  priority: b.priority,
});

/** POST /offers/admin: create. Always created OFF: nothing reaches customers until it is switched on. */
offerRouter.post('/admin', adminOnly, async (req, res, next) => {
  try {
    await requireReady();
    const b = offerSchema.parse(req.body);
    // An offer whose end is already behind us could never be switched on: say so now rather than leave a dead draft.
    if (Date.parse(b.ends_at) <= Date.now()) throw new HttpError(400, 'The end date must be in the future.', { ends_at: ['The end date must be in the future.'] });
    await assertTargets(b);
    await assertCodeFree(b.code ?? null);
    const c = COLUMNS(b);
    const keys = Object.keys(c);
    const row = await one<any>(
      `insert into offers (${keys.join(', ')}, is_active, created_by)
       values (${keys.map((_, i) => `$${i + 1}`).join(', ')}, false, $${keys.length + 1}) returning id`,
      [...Object.values(c), req.user!.id],
    );
    await audit(req.user!, 'offer.create', 'offer', row.id, { title: b.title, kind: b.kind, code: b.code ?? null });
    const full = await one<any>(`${ADMIN_SELECT} where o.id = $1`, [row.id]);
    res.status(201).json({ offer: shape(full) });
  } catch (e) { next(e); }
});

/** PATCH /offers/admin/:id: edit. Code and type are locked once anyone has used the offer, so history stays truthful. */
offerRouter.patch('/admin/:id', adminOnly, async (req, res, next) => {
  try {
    await requireReady();
    const b = offerSchema.parse(req.body);
    const existing = await one<any>(`${ADMIN_SELECT} where o.id = $1`, [req.params.id]);
    if (!existing) throw new HttpError(404, 'Offer not found');
    // Editing the wording of an offer that has ended is fine; moving its end date into the past is not.
    if (new Date(b.ends_at).getTime() !== new Date(existing.ends_at).getTime() && Date.parse(b.ends_at) <= Date.now()) {
      throw new HttpError(400, 'The end date must be in the future.', { ends_at: ['The end date must be in the future.'] });
    }
    if (Number(existing.redemptions) > 0 || Number(existing.funded) > 0) {
      if (normalizeCode(existing.code) !== (b.code ?? null)) throw new HttpError(409, 'This offer has been used, so its code can no longer change. Pause it and create a new one.');
      if (existing.kind !== b.kind) throw new HttpError(409, 'This offer has been used, so its type can no longer change. Pause it and create a new one.');
    }
    await assertTargets(b);
    await assertCodeFree(b.code ?? null, req.params.id);
    const c = COLUMNS(b);
    const keys = Object.keys(c);
    await query(
      `update offers set ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} where id = $${keys.length + 1}`,
      [...Object.values(c), req.params.id],
    );
    await audit(req.user!, 'offer.update', 'offer', req.params.id, { title: b.title });
    const full = await one<any>(`${ADMIN_SELECT} where o.id = $1`, [req.params.id]);
    res.json({ offer: shape(full) });
  } catch (e) { next(e); }
});

/** POST /offers/admin/:id/activate: switch ON. Live inside its dates, and never past its limits. */
offerRouter.post('/admin/:id/activate', adminOnly, async (req, res, next) => {
  try {
    await requireReady();
    const o = await one<any>('select id, title, ends_at from offers where id = $1', [req.params.id]);
    if (!o) throw new HttpError(404, 'Offer not found');
    if (new Date(o.ends_at) <= new Date()) throw new HttpError(400, 'This offer has already ended. Change its end date first.');
    await query('update offers set is_active = true, activated_at = coalesce(activated_at, now()) where id = $1', [req.params.id]);
    await audit(req.user!, 'offer.activate', 'offer', req.params.id, { title: o.title });
    res.json({ offer: shape(await one<any>(`${ADMIN_SELECT} where o.id = $1`, [req.params.id])) });
  } catch (e) { next(e); }
});

/** POST /offers/admin/:id/pause: switch OFF straight away. Orders already placed keep their discount. */
offerRouter.post('/admin/:id/pause', adminOnly, async (req, res, next) => {
  try {
    await requireReady();
    const o = await one<any>('select id, title from offers where id = $1', [req.params.id]);
    if (!o) throw new HttpError(404, 'Offer not found');
    await query('update offers set is_active = false where id = $1', [req.params.id]);
    await audit(req.user!, 'offer.pause', 'offer', req.params.id, { title: o.title });
    res.json({ offer: shape(await one<any>(`${ADMIN_SELECT} where o.id = $1`, [req.params.id])) });
  } catch (e) { next(e); }
});

/** DELETE /offers/admin/:id: only an offer nobody has used. A used one is paused instead, so the ledger stays whole. */
offerRouter.delete('/admin/:id', adminOnly, async (req, res, next) => {
  try {
    await requireReady();
    const used = await one<any>('select count(*)::int as n from offer_redemptions where offer_id = $1', [req.params.id]);
    if (used && used.n > 0) throw new HttpError(409, 'This offer has been used, so it cannot be deleted. Pause it instead.');
    const gone = await one<any>('delete from offers where id = $1 returning id, title', [req.params.id]);
    if (!gone) throw new HttpError(404, 'Offer not found');
    await audit(req.user!, 'offer.delete', 'offer', req.params.id, { title: gone.title });
    res.json({ success: true });
  } catch (e) { next(e); }
});

/** GET /offers/admin/:id/redemptions: who used it, on which order, and what it cost. */
offerRouter.get('/admin/:id/redemptions', adminOnly, async (req, res, next) => {
  try {
    await requireReady();
    const rows = await query<any>(
      `select r.id, r.created_at, r.goods_discount, r.delivery_discount,
              o.code as order_code, o.status, o.contact_name, o.total, o.currency, v.business_name
         from offer_redemptions r
         join orders o on o.id = r.order_id
         join vendors v on v.id = o.vendor_id
        where r.offer_id = $1
        order by r.created_at desc
        limit 100`,
      [req.params.id],
    );
    res.json({
      redemptions: rows.map((r) => ({
        ...r,
        goods_discount: Number(r.goods_discount), delivery_discount: Number(r.delivery_discount), total: Number(r.total),
      })),
    });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------------ push campaigns */
const LINK_RE = /^(sokonihub:\/\/|\/)[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]{0,180}$/;
const pushSchema = z.object({
  offer_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(3).max(65),
  body: z.string().trim().min(3).max(178),
  audience: z.enum(['all', 'buyers', 'guests']).default('all'),
  // Only places inside the app: a push can never carry a customer to an outside website.
  link: z.string().trim().regex(LINK_RE, 'The link must open a screen inside the app.').nullable().optional(),
});

/** GET /offers/admin/push/audience: how many devices a campaign would reach. */
offerRouter.get('/admin/push/audience', adminOnly, async (_req, res, next) => {
  try {
    await requireReady();
    res.json(await campaignAudienceCounts());
  } catch (e) { next(e); }
});

/** GET /offers/admin/push/history: campaigns already sent. */
offerRouter.get('/admin/push/history', adminOnly, async (_req, res, next) => {
  try {
    await requireReady();
    const rows = await query<any>(
      `select p.id, p.title, p.body, p.audience, p.recipients, p.link, p.created_at, o.title as offer_title
         from offer_pushes p left join offers o on o.id = p.offer_id
        order by p.created_at desc limit 30`,
    );
    res.json({ pushes: rows });
  } catch (e) { next(e); }
});

/** POST /offers/admin/push: send a campaign to customers. Never to vendors or riders. */
offerRouter.post('/admin/push', adminOnly, async (req, res, next) => {
  try {
    await requireReady();
    const b = pushSchema.parse(req.body);
    let link = b.link ?? null;
    let offer: any = null;
    if (b.offer_id) {
      offer = await one<any>(`${ADMIN_SELECT} where o.id = $1`, [b.offer_id]);
      if (!offer) throw new HttpError(404, 'Offer not found');
      link = link || offerLink(offer);
    }
    // A double click or a retry must not text the same message to every customer twice.
    const recent = await one<any>(`select 1 from offer_pushes where created_at > now() - interval '60 seconds' limit 1`);
    if (recent) throw new HttpError(429, 'A campaign was just sent. Wait a minute before sending another.');

    const tokens = await campaignTokens(b.audience);
    if (!tokens.length) throw new HttpError(400, 'No customer devices have allowed notifications yet.');
    const row = await one<any>(
      `insert into offer_pushes (offer_id, title, body, link, audience, recipients, sent_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning id, created_at`,
      [b.offer_id ?? null, b.title, b.body, link, b.audience, tokens.length, req.user!.id],
    );
    await audit(req.user!, 'offer.push', 'offer', b.offer_id ?? row.id, { title: b.title, audience: b.audience, recipients: tokens.length });
    // Delivery continues after the response so a large audience never holds the admin's request open.
    void sendCampaignPush(tokens, { title: b.title, body: b.body, link, offerId: b.offer_id ?? null });
    res.status(202).json({ push: { id: row.id, recipients: tokens.length, audience: b.audience, link } });
  } catch (e) { next(e); }
});
