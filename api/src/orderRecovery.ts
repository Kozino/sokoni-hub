import type { PoolClient } from 'pg';

/**
 * Returns the reserved stock of an order to the listings, once. Shared by
 * every path that cancels an order (vendor, admin), so stock is never
 * returned twice: `stock_restored_at` guards the whole operation.
 */
export async function restoreOrderStock(
  c: PoolClient,
  order: { id: string; vendor_id: string; stock_restored_at: unknown },
  actorId: string | null,
  note = 'Order cancelled by admin',
) {
  if (order.stock_restored_at) return;
  const items = (await c.query(
    'select listing_id, sum(qty)::int as qty from order_items where order_id = $1 and listing_id is not null group by listing_id order by listing_id',
    [order.id],
  )).rows;
  for (const item of items) {
    const stock = (await c.query(
      'update listings set quantity = quantity + $2 where id = $1 and quantity is not null returning quantity',
      [item.listing_id, item.qty],
    )).rows[0];
    if (stock) {
      await c.query(
        `insert into stock_movements (listing_id, vendor_id, delta, balance_after, reason, order_id, actor_id, note)
         values ($1, $2, $3, $4, 'return', $5, $6, $7)`,
        [item.listing_id, order.vendor_id, item.qty, stock.quantity, order.id, actorId, note],
      );
    }
  }
  await c.query('update orders set stock_restored_at = now() where id = $1', [order.id]);
}
