import type { PoolClient } from 'pg';
import { one, tx } from './db';
import { HttpError } from './utils';
import { getServiceFeeSettings } from './serviceFees';

/**
 * Monthly bills for service booking fees.
 *
 * Fees are grouped by the Qatar calendar month they were raised in. A month's bill is only
 * created once that month has ended, so no fee can be added to a bill after it is issued.
 * Bills are not deducted from wallet balances here; netting happens when the vendor requests a payout.
 */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** First day of a month, and of the month after it, as YYYY-MM-DD. */
export function monthBounds(month: string): { start: string; end: string } {
  if (!MONTH_RE.test(month)) throw new HttpError(422, 'Choose a month as YYYY-MM.');
  const [y, m] = month.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const next = m === 12 ? [y + 1, 1] : [y, m + 1];
  const end = `${next[0]}-${String(next[1]).padStart(2, '0')}-01`;
  return { start, end };
}

/** The Qatar calendar date (YYYY-MM-DD) of a moment. */
export function qatarDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Creates one bill per vendor for a closed month, and attaches every unbilled fee raised in that month.
 * Safe to run twice: fees already billed are skipped, and a vendor's bill for the month is not duplicated.
 */
export async function generateMonthlyBills(month: string, now: Date = new Date()): Promise<{ bills: number; fees: number }> {
  const { start, end } = monthBounds(month);
  if (qatarDate(now) < end) throw new HttpError(409, 'That month has not ended yet. Bills are issued after the month closes.');

  const { due_days } = await getServiceFeeSettings();

  return tx(async (c) => {
    const due = (
      await c.query<{ id: string; vendor_id: string; amount: string; currency: string }>(
        `select f.id, f.vendor_id, f.amount, f.currency
           from service_booking_fees f
          where f.status = 'due'
            and (f.created_at at time zone 'Asia/Qatar')::date >= $1::date
            and (f.created_at at time zone 'Asia/Qatar')::date <  $2::date
          order by f.vendor_id`,
        [start, end],
      )
    ).rows;

    const byVendor = new Map<string, { ids: string[]; total: number; currency: string }>();
    for (const f of due) {
      const g = byVendor.get(f.vendor_id) ?? { ids: [], total: 0, currency: f.currency };
      g.ids.push(f.id);
      g.total = Math.round((g.total + Number(f.amount)) * 100) / 100;
      byVendor.set(f.vendor_id, g);
    }

    let bills = 0;
    let fees = 0;
    for (const [vendorId, g] of byVendor) {
      const ins = (
        await c.query<{ id: string }>(
          `insert into service_fee_bills (vendor_id, period_start, period_end, amount, currency, due_date)
           values ($1, $2::date, $3::date, $4, $5, ($3::date + make_interval(days => $6)))
           on conflict (vendor_id, period_start) do nothing
           returning id`,
          [vendorId, start, end, g.total, g.currency, due_days],
        )
      ).rows[0];
      if (!ins) continue; // Already billed for this month.
      await c.query(
        `update service_booking_fees set status = 'billed', bill_id = $1 where id = any($2::uuid[])`,
        [ins.id, g.ids],
      );
      bills += 1;
      fees += g.ids.length;
    }
    return { bills, fees };
  });
}

/**
 * Settles the vendor's open bills from their wallet balance, oldest first. Runs inside the payout
 * transaction (the caller holds the vendor row lock). Returns the amount now available for the payout.
 * A bill is only settled in full, and only when the balance covers it. Otherwise it stays open,
 * and the vendor pays it by transfer.
 */
export async function settleBillsFromWallet(c: PoolClient, vendorId: string, available: number): Promise<number> {
  const bills = (
    await c.query(
      `select id, amount, period_start from service_fee_bills
        where vendor_id = $1 and status = 'open' order by period_start for update`,
      [vendorId],
    )
  ).rows;

  let remaining = available;
  for (const b of bills) {
    const amount = Number(b.amount);
    if (amount <= 0 || amount > remaining) continue;
    remaining = Math.round((remaining - amount) * 100) / 100;

    await c.query(`update vendors set wallet_available = wallet_available - $1 where id = $2`, [amount, vendorId]);
    await c.query(
      `insert into wallet_transactions (vendor_id, amount, type, description) values ($1, $2, 'service_fee_bill', $3)`,
      [vendorId, -amount, `Sokoni Hub booking fees, ${String(b.period_start).slice(0, 7)}`],
    );
    await c.query(
      `update service_fee_bills set status = 'paid', paid_at = now(), paid_from_wallet = true where id = $1`,
      [b.id],
    );
    await c.query(
      `update service_booking_fees set status = 'paid', paid_at = now() where bill_id = $1 and status = 'billed'`,
      [b.id],
    );
  }
  return remaining;
}

/** Amount of open bills (not yet paid) for a vendor. Used to tell the vendor what the next payout will deduct. */
export async function openBillTotal(vendorId: string): Promise<number> {
  const r = await one<{ total: number }>(
    `select coalesce(sum(amount), 0)::float as total from service_fee_bills where vendor_id = $1 and status = 'open'`,
    [vendorId],
  );
  return Number(r?.total ?? 0);
}


/**
 * True when the vendor has an open bill whose due date has passed (Qatar date).
 * Such a vendor cannot take new bookings until the bill is paid, or netted from the wallet at payout.
 * A bill the vendor has submitted with a receipt is not blocking, because the admin is still checking it.
 */
export async function hasOverdueServiceFeeBill(c: PoolClient, vendorId: string, now: Date = new Date()): Promise<boolean> {
  const today = qatarDate(now);
  const r = await c.query<{ n: number }>(
    `select count(*)::int as n from service_fee_bills
      where vendor_id = $1 and status = 'open' and due_date < $2::date`,
    [vendorId, today],
  );
  return (r.rows[0]?.n ?? 0) > 0;
}
