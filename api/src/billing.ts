/**
 * Settlement maths for vendor statements.
 *
 * Kept free of database and Express so it can be tested directly.
 *
 * The important modelling decision is DIRECTION. On a marketplace that holds
 * the buyer's money, the platform owes the vendor (sales minus commission).
 * Sokoni Hub today takes cash on delivery, WhatsApp and bank transfer, so the
 * VENDOR holds the money and owes the platform commission. Both cases fall out
 * of one calculation, so adding a payment gateway later changes no logic here.
 */

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type FundsHolder = 'vendor' | 'platform';

export interface SettleableOrder {
  id: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  funds_collected_by: FundsHolder;
  /**
   * The part of `subtotal` that is product lines. Commission is charged on this,
   * not on `subtotal`, because service work is never commissioned — service
   * vendors pay a fee before approval instead.
   *
   * Equal to `subtotal` for every order written since migration 005, when
   * services stopped being able to enter the cart at all. It differs only for
   * historical orders placed before that.
   */
  goods_subtotal: number;
}

export interface StatementTotals {
  order_count: number;
  goods_subtotal: number;
  delivery_total: number;
  gross_sales: number;
  commission_rate: number;
  commission_base: number;
  commission_amount: number;
  collected_by_vendor: number;
  collected_by_platform: number;
  net_due_to_platform: number;
  net_due_to_vendor: number;
  /** Per-order commission, so a statement can show its workings line by line. */
  lines: { order_id: string; gross: number; commission_amount: number }[];
}

/**
 * Commission is charged on PRODUCT goods only — never on the delivery fee, and
 * never on service work.
 *
 * Delivery: the vendor performs it and sets the fee themselves; it reimburses
 * their fuel and time rather than representing margin the platform helped
 * create. Taking a cut would tax the vendor's costs and push them to quote
 * delivery off-platform.
 *
 * Services: the agreed monetisation is a flat fee charged before approval, not
 * a cut of the work. Bookings never become orders, so new service work cannot
 * reach this function at all; `goods_subtotal` is what excludes the historical
 * orders placed before services left the cart.
 *
 * This is why `goods_subtotal` and `commission_base` are reported separately
 * rather than being the same number: a vendor reading a statement can see the
 * service revenue was counted as sales and then excluded from the charge.
 */
export function computeStatement(orders: SettleableOrder[], commissionRate: number): StatementTotals {
  if (commissionRate < 0 || commissionRate > 1)
    throw new Error(`commission_rate must be between 0 and 1, got ${commissionRate}`);

  let goods = 0, base = 0, delivery = 0, gross = 0, byVendor = 0, byPlatform = 0;
  const lines: StatementTotals['lines'] = [];

  for (const o of orders) {
    // Defensive: a caller that has not been updated to supply goods_subtotal
    // would otherwise silently commission nothing at all, which is a far worse
    // failure than commissioning too much.
    const commissionable = Number(o.goods_subtotal ?? o.subtotal);
    if (commissionable < 0 || commissionable > Number(o.subtotal) + 0.005)
      throw new Error(
        `order ${o.id}: goods_subtotal ${commissionable} is not a valid part of subtotal ${o.subtotal}`);

    goods = round2(goods + Number(o.subtotal));
    base = round2(base + commissionable);
    delivery = round2(delivery + Number(o.delivery_fee));
    gross = round2(gross + Number(o.total));
    if (o.funds_collected_by === 'platform') byPlatform = round2(byPlatform + Number(o.total));
    else byVendor = round2(byVendor + Number(o.total));

    lines.push({
      order_id: o.id,
      gross: round2(Number(o.total)),
      // Rounded per line so the lines always re-add to the header total.
      commission_amount: round2(commissionable * commissionRate),
    });
  }

  // Sum the rounded lines rather than rounding the sum, otherwise a statement
  // can show lines that do not add up to its own total.
  const commission = round2(lines.reduce((a, l) => a + l.commission_amount, 0));

  // What the vendor has earned, less our cut, less what they already hold.
  // Positive => we owe them. Negative => they owe us.
  const balance = round2(round2(gross - commission) - byVendor);

  return {
    order_count: orders.length,
    goods_subtotal: goods,
    delivery_total: delivery,
    gross_sales: gross,
    commission_rate: commissionRate,
    commission_base: base,
    commission_amount: commission,
    collected_by_vendor: byVendor,
    collected_by_platform: byPlatform,
    net_due_to_platform: balance < 0 ? round2(-balance) : 0,
    net_due_to_vendor: balance > 0 ? round2(balance) : 0,
    lines,
  };
}

/** First and last day of a month, as YYYY-MM-DD. */
export function monthPeriod(year: number, month1to12: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const last = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  return {
    period_start: `${year}-${pad(month1to12)}-01`,
    period_end: `${year}-${pad(month1to12)}-${pad(last)}`,
  };
}

export const formatMoney = (amount: number | string, currency = 'QAR') =>
  `${currency} ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
