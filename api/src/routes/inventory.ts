import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db';
import { requireAuth, loadVendor, requireVerifiedVendor } from '../auth';
import { HttpError, audit, validateUuidParam } from '../utils';

export const inventoryRouter = Router();
inventoryRouter.param('id', validateUuidParam);

const vendorOnly = [requireAuth('vendor'), loadVendor, requireVerifiedVendor] as const;

/** Reasons a vendor may give. 'sale' is excluded: only checkout writes those. */
const MANUAL_REASONS = ['restock', 'adjustment', 'return', 'damage'] as const;

/**
 * Sorted by urgency, not alphabetically. A vendor opening this page wants the
 * thing that is costing them sales at the top: out of stock first, then low,
 * and inside each group the fastest-selling product first, because that is the
 * one that will stay out of stock the longest if ignored.
 */
const URGENCY = `
  order by case stock_state when 'out' then 0 when 'low' then 1 when 'ok' then 2 else 3 end,
           sold_30d desc, title asc`;

/** GET /inventory — every product this vendor stocks, with its state. */
inventoryRouter.get('/', ...vendorOnly, async (req, res, next) => {
  try {
    const p = z.object({
      state: z.enum(['all', 'needs_attention', 'out', 'low', 'ok', 'untracked']).default('all'),
      q: z.string().trim().max(120).optional(),
    }).parse(req.query);

    const where: string[] = ['vendor_id = $1'];
    const args: any[] = [req.vendor!.id];

    if (p.state === 'needs_attention') where.push(`stock_state in ('out','low')`);
    else if (p.state !== 'all') { args.push(p.state); where.push(`stock_state = $${args.length}`); }

    if (p.q) { args.push(`%${p.q}%`); where.push(`title ilike $${args.length}`); }

    const items = await query(
      `select * from vendor_inventory where ${where.join(' and ')} ${URGENCY}`, args);

    res.json({ items, threshold_default: req.vendor!.low_stock_threshold });
  } catch (e) { next(e); }
});

/**
 * GET /inventory/summary — counts for the nav badge and the overview card.
 *
 * `tracked` is what tells the UI whether to show inventory at all. A vendor with
 * no products (a hair salon, a nail tech) must never see a stock alert, and
 * counting zeros is not the same as having nothing to count.
 */
inventoryRouter.get('/summary', ...vendorOnly, async (req, res, next) => {
  try {
    const s = await one<any>(
      `select
         count(*) filter (where stock_state = 'out')       as out_of_stock,
         count(*) filter (where stock_state = 'low')       as low_stock,
         count(*) filter (where stock_state = 'untracked') as untracked,
         count(*)                                          as products,
         coalesce(sum(reorder_qty) filter (where stock_state in ('out','low')), 0) as units_to_reorder
       from vendor_inventory where vendor_id = $1`,
      [req.vendor!.id]
    );
    const products = Number(s?.products ?? 0);
    res.json({
      out_of_stock: Number(s?.out_of_stock ?? 0),
      low_stock: Number(s?.low_stock ?? 0),
      untracked: Number(s?.untracked ?? 0),
      products,
      units_to_reorder: Number(s?.units_to_reorder ?? 0),
      // The single flag the client needs. Anything stock-related is hidden when
      // this is false.
      sells_products: products > 0,
      threshold_default: req.vendor!.low_stock_threshold,
    });
  } catch (e) { next(e); }
});

/** GET /inventory/movements — the vendor's whole ledger, newest first. */
inventoryRouter.get('/movements', ...vendorOnly, async (req, res, next) => {
  try {
    const p = z.object({
      listing_id: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);

    const args: any[] = [req.vendor!.id];
    let filter = '';
    if (p.listing_id) { args.push(p.listing_id); filter = `and m.listing_id = $${args.length}`; }
    args.push(p.limit);

    const rows = await query(
      `select m.*, l.title, l.unit, u.full_name as actor_name, o.code as order_code
         from stock_movements m
         join listings l on l.id = m.listing_id
         left join users u on u.id = m.actor_id
         left join orders o on o.id = m.order_id
        where m.vendor_id = $1 ${filter}
        order by m.created_at desc
        limit $${args.length}`,
      args
    );
    res.json({ movements: rows });
  } catch (e) { next(e); }
});

/**
 * POST /inventory/:id/adjust — move stock and record why.
 *
 * Takes a delta ("received 50"), not a new total. A vendor restocking thinks in
 * deltas, and a delta is safe against a concurrent sale: two people working the
 * same product cannot silently overwrite each other the way `set quantity = 50`
 * would. `set_to` is still accepted for a stock count, and is converted to a
 * delta inside the same transaction so the arithmetic cannot race.
 */
inventoryRouter.post('/:id/adjust', ...vendorOnly, async (req, res, next) => {
  try {
    const b = z.object({
      delta: z.number().int().optional(),
      set_to: z.number().int().nonnegative().optional(),
      reason: z.enum(MANUAL_REASONS),
      note: z.string().trim().max(500).optional(),
    }).refine((v) => (v.delta === undefined) !== (v.set_to === undefined),
      { message: 'Provide either delta or set_to, not both' })
      .parse(req.body);

    const result = await tx(async (c) => {
      // Locked: the balance written to the ledger must be the balance that was
      // actually stored, even if checkout is decrementing the same row.
      const cur = await c.query(
        `select id, quantity, kind, title from listings
          where id = $1 and vendor_id = $2 for update`,
        [req.params.id, req.vendor!.id]
      );
      const l = cur.rows[0];
      if (!l) throw new HttpError(404, 'Product not found');
      if (l.kind !== 'product')
        throw new HttpError(400, 'Services do not carry stock');

      const before: number | null = l.quantity;
      // A previously untracked product starts counting from zero the moment the
      // vendor first touches it, rather than refusing the edit.
      const base = before ?? 0;
      const delta = b.delta ?? (b.set_to! - base);

      if (delta === 0)
        throw new HttpError(400, 'That leaves the stock unchanged');

      const after = base + delta;
      if (after < 0)
        throw new HttpError(400, `Only ${base} in stock — cannot remove ${Math.abs(delta)}`);

      await c.query('update listings set quantity = $2 where id = $1', [l.id, after]);
      const mv = await c.query(
        `insert into stock_movements
           (listing_id, vendor_id, delta, balance_after, reason, note, actor_id)
         values ($1,$2,$3,$4,$5,$6,$7) returning *`,
        [l.id, req.vendor!.id, delta, after, b.reason, b.note ?? null, req.user!.id]
      );
      return { before, after, delta, movement: mv.rows[0], title: l.title };
    });

    await audit(req.user!, 'inventory.adjust', 'listing', req.params.id, {
      delta: result.delta, reason: b.reason, before: result.before, after: result.after,
    });

    const item = await one(`select * from vendor_inventory where id = $1`, [req.params.id]);
    res.json({ item, movement: result.movement });
  } catch (e) { next(e); }
});

/**
 * PATCH /inventory/:id/settings — per-product reorder rules.
 * Every field is nullable: clearing the override returns the product to the
 * vendor default rather than pinning it to whatever the default happened to be.
 */
inventoryRouter.patch('/:id/settings', ...vendorOnly, async (req, res, next) => {
  try {
    const b = z.object({
      low_stock_threshold: z.number().int().nonnegative().nullable().optional(),
      reorder_to: z.number().int().positive().nullable().optional(),
      supplier_note: z.string().trim().max(500).nullable().optional(),
    }).parse(req.body);

    if (Object.keys(b).length === 0) throw new HttpError(400, 'Nothing to update');

    const sets: string[] = [];
    const args: any[] = [req.params.id, req.vendor!.id];
    for (const [k, v] of Object.entries(b)) { args.push(v); sets.push(`${k} = $${args.length}`); }

    const l = await one(
      `update listings set ${sets.join(', ')}
        where id = $1 and vendor_id = $2 and kind = 'product' returning id`,
      args
    );
    if (!l) throw new HttpError(404, 'Product not found');

    const item = await one(`select * from vendor_inventory where id = $1`, [req.params.id]);
    res.json({ item });
  } catch (e) { next(e); }
});

/** PATCH /inventory/settings — the vendor-wide default threshold. */
inventoryRouter.patch('/settings', ...vendorOnly, async (req, res, next) => {
  try {
    const b = z.object({ low_stock_threshold: z.number().int().nonnegative().max(100000) })
      .parse(req.body);
    await one(`update vendors set low_stock_threshold = $2 where id = $1 returning id`,
      [req.vendor!.id, b.low_stock_threshold]);
    await audit(req.user!, 'inventory.default_threshold', 'vendor', req.vendor!.id, b);
    res.json({ threshold_default: b.low_stock_threshold });
  } catch (e) { next(e); }
});
