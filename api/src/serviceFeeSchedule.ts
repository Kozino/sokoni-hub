import { one, query, pool } from './db';
import { generateMonthlyBills } from './serviceFeeBills';

/**
 * Scheduled monthly bill run for service booking fees.
 *
 * The admin turns the schedule ON or OFF and chooses when it runs: a day of the month and an hour,
 * in Qatar time. Once a month, after that day and hour, the job issues the bills for the previous
 * month and records the run. The run is idempotent, and a Postgres advisory lock stops two server
 * instances from running it at the same time, so a missed or repeated tick never double-bills.
 */

export const SCHEDULE_KEY = 'service_fee_bill_schedule';
const LOCK_KEY = 73652110;
const TICK_MS = 5 * 60 * 1000;

export interface BillSchedule {
  enabled: boolean;
  /** Day of the month the run is allowed from (1 to 28, so every month has it). */
  day_of_month: number;
  /** Hour of the day, Qatar time (0 to 23). */
  hour: number;
  last_run_month: string | null;
  last_run_at: string | null;
  last_result: { bills: number; fees: number } | null;
  last_error: string | null;
}

export const DEFAULT_SCHEDULE: BillSchedule = {
  enabled: false,
  day_of_month: 1,
  hour: 6,
  last_run_month: null,
  last_run_at: null,
  last_result: null,
  last_error: null,
};

export async function getSchedule(): Promise<BillSchedule> {
  const row = await one<{ value: any }>(`select value from system_settings where key = $1`, [SCHEDULE_KEY]);
  const v = row?.value || {};
  const day = Number(v.day_of_month);
  const hour = Number(v.hour);
  return {
    enabled: v.enabled === true,
    day_of_month: Number.isInteger(day) && day >= 1 && day <= 28 ? day : DEFAULT_SCHEDULE.day_of_month,
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_SCHEDULE.hour,
    last_run_month: typeof v.last_run_month === 'string' ? v.last_run_month : null,
    last_run_at: typeof v.last_run_at === 'string' ? v.last_run_at : null,
    last_result: v.last_result ?? null,
    last_error: typeof v.last_error === 'string' ? v.last_error : null,
  };
}

/** Saves the admin's ON/OFF and timing. Keeps the run history. */
export async function saveScheduleSettings(input: { enabled: boolean; day_of_month: number; hour: number }): Promise<BillSchedule> {
  const current = await getSchedule();
  const next = { ...current, ...input };
  await query(
    `insert into system_settings (key, value, updated_at) values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [SCHEDULE_KEY, JSON.stringify(next)],
  );
  return getSchedule();
}

async function writeRunState(patch: Partial<BillSchedule>): Promise<void> {
  const current = await getSchedule();
  await query(
    `insert into system_settings (key, value, updated_at) values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [SCHEDULE_KEY, JSON.stringify({ ...current, ...patch })],
  );
}

/** Qatar wall-clock parts of a moment, so the schedule is read in Qatar time whatever the server's zone. */
export function qatarParts(now: Date): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Qatar',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') };
}

/** The bill month a run on this date is for: the calendar month before it. */
export function billMonthFor(now: Date): string {
  const { year, month } = qatarParts(now);
  const prev = month === 1 ? [year - 1, 12] : [year, month - 1];
  return `${prev[0]}-${String(prev[1]).padStart(2, '0')}`;
}

export type TickOutcome =
  | { ran: false; reason: 'off' | 'not_due' | 'already_ran' | 'locked' }
  | { ran: true; month: string; result: { bills: number; fees: number } }
  | { ran: true; month: string; error: string };

/**
 * Runs the bill job if it is ON, the day and hour have passed this month, and it has not yet run for the
 * bill month. Failures are recorded and retried on the next tick.
 */
export async function runScheduledBillsIfDue(now: Date = new Date()): Promise<TickOutcome> {
  const s = await getSchedule();
  if (!s.enabled) return { ran: false, reason: 'off' };

  const local = qatarParts(now);
  if (local.day < s.day_of_month || (local.day === s.day_of_month && local.hour < s.hour)) {
    return { ran: false, reason: 'not_due' };
  }

  const month = billMonthFor(now);
  if (s.last_run_month === month) return { ran: false, reason: 'already_ran' };

  // Only one instance runs the job at a time.
  const lock = await pool.connect();
  try {
    const got = (await lock.query<{ ok: boolean }>(`select pg_try_advisory_lock($1) as ok`, [LOCK_KEY])).rows[0].ok;
    if (!got) return { ran: false, reason: 'locked' };
    try {
      // Re-read under the lock, in case another instance finished the run a moment ago.
      const fresh = await getSchedule();
      if (fresh.last_run_month === month) return { ran: false, reason: 'already_ran' };

      const result = await generateMonthlyBills(month, now);
      await writeRunState({
        last_run_month: month,
        last_run_at: now.toISOString(),
        last_result: result,
        last_error: null,
      });
      return { ran: true, month, result };
    } catch (e: any) {
      const message = String(e?.message || e).slice(0, 300);
      await writeRunState({ last_error: message, last_run_at: now.toISOString() });
      return { ran: true, month, error: message };
    } finally {
      await lock.query(`select pg_advisory_unlock($1)`, [LOCK_KEY]);
    }
  } finally {
    lock.release();
  }
}

/** Starts the background check. Called once at server start. */
export function startServiceFeeBillScheduler(): void {
  const tick = () => {
    runScheduledBillsIfDue()
      .then((o) => {
        if (o.ran) console.log(`[bills] ${o.month}:`, 'error' in o ? `failed: ${o.error}` : o.result);
      })
      .catch((e) => console.error('[bills] schedule check failed', e?.message));
  };
  setTimeout(tick, 30_000).unref();
  setInterval(tick, TICK_MS).unref();
}

