import { Router } from 'express';
import { query } from '../db';

export const metaRouter = Router();

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
             (select count(distinct city) from vendors where status='verified')::int as cities`);
    res.json({ stats: row });
  } catch (e) { next(e); }
});

metaRouter.get('/policy', (_req, res) => {
  res.json({
    prohibited: ['Cosmetics and skin products', 'Medicine, drugs and pharmaceuticals'],
    payment_methods: ['cash_on_delivery', 'whatsapp', 'bank_transfer'],
    units: ['kg', 'litre', 'piece', 'bag', 'pack', 'carton', 'bundle'],
  });
});
