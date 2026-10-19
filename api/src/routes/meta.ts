import { Router } from 'express';
import { query, one } from '../db';
import { moneyModel } from '../moneyModel';

export const metaRouter = Router();


metaRouter.get('/money-model', async (_req, res, next) => {
  try {
    res.json(await moneyModel());
  } catch (e) { next(e); }
});

metaRouter.get('/plan-limits', async (_req, res, next) => {
  try {
    const limitsRow = await one('select value from system_settings where key = $1', ['plan_limits']);
    const pricesRow = await one('select value from system_settings where key = $1', ['plan_prices']);
    res.json({ limits: limitsRow?.value || null, prices: pricesRow?.value || null });
  } catch (e) { next(e); }
});

metaRouter.get('/categories', async (_req, res, next) => {
  try {
    const rows = await query(
      `select id, name, slug, kind from categories where is_banned = false order by sort, name`
    );
    res.json({ categories: rows });
  } catch (e) { next(e); }
});

metaRouter.get('/stats', async (_req, res, next) => {
  try {
    const [row] = await query<any>(`
      select (select count(*) from vendors where status='verified')::int as vendors,
             (select count(*) from listings where status='active')::int  as listings,
             (select count(*) from listings where kind='service' and status='active')::int as services,
             (select count(distinct city) from vendors where status='verified')::int as cities,
            (select count(*) from orders where status='delivered')::int as orders_delivered`);
    res.json({ stats: row });
  } catch (e) { next(e); }
});

metaRouter.get('/policy', (_req, res) => {
  res.json({
    prohibited: ['Cosmetics and skin products', 'Medicine, drugs and pharmaceuticals'],
    payment_methods: ['cash_on_delivery'],
    units: ['kg', 'litre', 'piece', 'bag', 'pack', 'carton', 'bundle'],
  });
});
