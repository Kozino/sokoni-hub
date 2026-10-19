import type { PoolClient } from 'pg';
import { round2 } from './billing';
import { moneyModel } from './moneyModel';

/**
 * Moves a vendor's money through the wallet when Sokoni Hub holds it.
 *
 * Sokoni Hub holds the money when it collects it: online payments, and cash on delivery
 * that a Sokoni rider collected and handed in. For those orders:
 *   1. When the rider completes the drop-off, the vendor's share is credited to the
 *      wallet as PENDING (sales, less commission when commission mode is on).
 *      The delivery fee belongs to the rider, not the vendor.
 *   2. When the order is final (buyer confirms, or the window passes), the amount moves
 *      to AVAILABLE, and the vendor can request a payout.
 * Vendor-held orders (the vendor collected the cash) keep using vendor statements.
 * Both steps are idempotent, so a retry never double-credits.
 */

/** The configured commission rate, or 0 when the commission switch is off. */
async function activeCommissionRate(c: PoolClient): Promise<number> {
  if (!(await moneyModel()).commission_enabled) return 0;
  const row = (await c.query('select commission_rate from platform_settings where id = true')).rows[0];
  return Number(row?.commission_rate ?? 0);
}

/**
 * Credits the vendor's wallet (pending) for a rider-delivered order. Sokoni Hub holds the
 * cash the rider collects, so Sokoni settles the vendor in both money models. Commission is
 * zero in subscription mode, so the vendor receives the full sales amount there.
 */
export async function creditVendorOnHandover(c: PoolClient, orderId: string): Promise<void> {
  const o = (await c.query(
    `select o.id, o.code, o.vendor_id, o.subtotal, o.delivery_fee, o.wallet_credited
       from orders o where o.id = $1 for update`,
    [orderId],
  )).rows[0];
  if (!o || o.wallet_credited) return;

  // Commission is charged on product lines only (services are never commissioned).
  const goods = (await c.query(
    `select coalesce(sum(line_total), 0)::numeric as goods
       from order_items where order_id = $1 and (kind is distinct from 'service')`,
    [orderId],
  )).rows[0];
  const rate = await activeCommissionRate(c);
  const commission = round2(Math.min(Number(goods.goods), Number(o.subtotal)) * rate);
  const vendorAmount = round2(Number(o.subtotal) - commission);

  await c.query(
    `update orders set funds_collected_by = 'platform', vendor_amount = $2, platform_commission = $3,
            driver_amount = delivery_fee, wallet_credited = true, updated_at = now()
      where id = $1`,
    [orderId, vendorAmount, commission],
  );
  await c.query(`update vendors set wallet_pending = wallet_pending + $2 where id = $1`, [o.vendor_id, vendorAmount]);
  await c.query(
    `insert into wallet_transactions (vendor_id, order_id, amount, type, description)
     values ($1, $2, $3, 'escrow_credit', $4)`,
    [o.vendor_id, orderId, vendorAmount, `Order ${o.code}: held by Sokoni Hub until the order is final`],
  );
}

/** Moves a credited order's amount from pending to available. Call once the order is final. */
export async function releaseVendorFunds(c: PoolClient, orderId: string): Promise<void> {
  const o = (await c.query(
    `select o.id, o.code, o.vendor_id, o.vendor_amount, o.wallet_credited from orders o where o.id = $1 for update`,
    [orderId],
  )).rows[0];
  if (!o || !o.wallet_credited) return;
  const already = (await c.query(
    `select 1 from wallet_transactions where order_id = $1 and type = 'escrow_release' limit 1`,
    [orderId],
  )).rowCount;
  if (already) return;

  const amount = Number(o.vendor_amount);
  await c.query(
    `update vendors set wallet_pending = wallet_pending - $2, wallet_available = wallet_available + $2 where id = $1`,
    [o.vendor_id, amount],
  );
  await c.query(
    `insert into wallet_transactions (vendor_id, order_id, amount, type, description)
     values ($1, $2, $3, 'escrow_release', $4)`,
    [o.vendor_id, orderId, amount, `Order ${o.code}: available for payout`],
  );
}
