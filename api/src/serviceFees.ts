import type { PoolClient } from 'pg';
import { one } from './db';
import { PHONE_SQL } from './booking/availability';

/**
 * Per-booking fee for service vendors, and the service-only plan switch.
 * Every value is set by the admin on the money-model page (system_settings 'service_fees').
 */
export interface ServiceFeeSettings {
  fee_enabled: boolean;
  amount: number;
  charge_on: 'every_booking' | 'new_clients';
  waive_for_plan: boolean;
  plan_enabled: boolean;
  /** Days after the end of the billing month that a monthly bill is due. */
  due_days: number;
  /** Shown to vendors on their bill: bank name, account, and reference to quote. */
  payment_instructions: string;
}

export const DEFAULT_SERVICE_FEES: ServiceFeeSettings = {
  fee_enabled: false,
  amount: 0,
  charge_on: 'every_booking',
  waive_for_plan: false,
  plan_enabled: false,
  due_days: 14,
  payment_instructions: '',
};

/** Reads the admin's settings, falling back to safe defaults for any missing or invalid value. */
export async function getServiceFeeSettings(): Promise<ServiceFeeSettings> {
  const row = await one<{ value: any }>(`select value from system_settings where key = 'service_fees'`);
  const v = row?.value || {};
  const amount = Number(v.amount);
  return {
    fee_enabled: v.fee_enabled === true,
    amount: Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : 0,
    charge_on: v.charge_on === 'new_clients' ? 'new_clients' : 'every_booking',
    waive_for_plan: v.waive_for_plan === true,
    plan_enabled: v.plan_enabled === true,
    due_days: Number.isInteger(Number(v.due_days)) && Number(v.due_days) >= 1 && Number(v.due_days) <= 90 ? Number(v.due_days) : 14,
    payment_instructions: typeof v.payment_instructions === 'string' ? v.payment_instructions.slice(0, 1000) : '',
  };
}

/** True when the vendor has a paid plan that has not expired. Mirrors getEffectivePlan in listings.ts. */
export async function vendorHasActivePlan(c: PoolClient | null, vendorId: string): Promise<boolean> {
  const sql = `select plan, plan_expires_at from vendors where id = $1`;
  const res = c ? (await c.query(sql, [vendorId])).rows[0] : await one<any>(sql, [vendorId]);
  if (!res || res.plan === 'free') return false;
  return !res.plan_expires_at || new Date(res.plan_expires_at) > new Date();
}

/**
 * Creates the fee for a new service booking when the admin's rules say it is owed.
 * Runs inside the booking transaction so a booking and its fee are saved together.
 * `phone` must be the same normalised phone the booking was saved with.
 */
export async function recordServiceFeeForBooking(
  c: PoolClient,
  args: { bookingId: string; vendorId: string; phone: string },
): Promise<void> {
  const s = await getServiceFeeSettings();
  if (!s.fee_enabled || s.amount <= 0) return;

  if (s.waive_for_plan && (await vendorHasActivePlan(c, args.vendorId))) return;

  if (s.charge_on === 'new_clients') {
    // A returning client is anyone who had a live (not cancelled) booking with this vendor before.
    const prior = (
      await c.query(
        `select 1 from service_bookings b
          where b.vendor_id = $1 and b.id <> $2 and b.status <> 'cancelled' and ${PHONE_SQL} = $3
          limit 1`,
        [args.vendorId, args.bookingId, args.phone],
      )
    ).rows[0];
    if (prior) return;
  }

  // Service fees apply in both money models. Product commission is handled separately.
  await c.query(
    `insert into service_booking_fees (booking_id, vendor_id, amount, charge_on, status)
     values ($1, $2, $3, $4, 'due')
     on conflict (booking_id) do nothing`,
    [args.bookingId, args.vendorId, s.amount, s.charge_on],
  );
}
