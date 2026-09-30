import { PoolClient } from "pg";
import { pool } from "../db";
import { HttpError } from "../utils";
export const LIVE = ["new", "contacted", "confirmed"];
export const DAY = 86400000;
export const defaults = {
  auto_accept: false,
  offers_at_vendor: true,
  offers_home_service: false,
  home_service_notes: null as string | null,
  cancel_notice_hours: 24,
  buffer_mins: 15,
  slot_step_mins: 30,
  min_notice_hours: 2,
  max_advance_days: 30,
};
export type Settings = typeof defaults;
type DB = Pick<PoolClient, "query">;
export const qDate = (d = new Date()) =>
  new Date(d.getTime() + 10800000).toISOString().slice(0, 10);
export const atQatar = (date: string, time = "00:00") =>
  new Date(`${date}T${time}:00+03:00`);
export const durationOf = (n: number | null) => (n && n > 0 ? n : 60);
export const qLong = (d: string | Date) =>
  new Date(d).toLocaleString("en-GB", {
    timeZone: "Asia/Qatar",
    dateStyle: "medium",
    timeStyle: "short",
  });
export function validDate(date: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    isNaN(atQatar(date).getTime()) ||
    qDate(atQatar(date)) !== date
  )
    throw new HttpError(400, "Choose a valid date (YYYY-MM-DD).");
  return date;
}
export async function lockVendor(c: DB, id: string) {
  // Shared by EVERY booking/schedule writer; transaction-scoped, pooler-safe.
  // Serialises the check-and-insert, including gaps that a plain overlap
  // exclusion constraint cannot protect (buffers and legacy agreed times).
  await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `booking-vendor:${id}`,
  ]);
}
export async function settings(id: string, c: DB = pool): Promise<Settings> {
  return {
    ...defaults,
    ...(
      await c.query(
        "select * from vendor_booking_settings where vendor_id=$1",
        [id],
      )
    ).rows[0],
  };
}
export async function calendarEnabled(id: string, c: DB = pool) {
  // Never-configured vendors retain requests. Saving all days closed must NOT
  // silently reopen the diary as a request-only service.
  return (
    (
      await c.query(
        "select 1 from vendor_booking_settings where vendor_id=$1 union all select 1 from vendor_hours where vendor_id=$1 limit 1",
        [id],
      )
    ).rowCount! > 0
  );
}
export async function occupied(
  id: string,
  start: Date,
  end: Date,
  cfg: Settings,
  c: DB = pool,
  exclude: string | null = null,
) {
  const buffer = cfg.buffer_mins * 60000;
  const busy = (
    await c.query(
      `select b.id, coalesce(b.slot_starts_at,b.scheduled_at) as starts_at,
    coalesce(b.slot_ends_at,b.scheduled_at + make_interval(mins=>case when l.duration_mins>0 then l.duration_mins else 60 end)) as ends_at
    from service_bookings b join listings l on l.id=b.listing_id
    where b.vendor_id=$1 and b.status in ('new','contacted','confirmed') and ($4::uuid is null or b.id<>$4)
    and coalesce(b.slot_starts_at,b.scheduled_at)<$3
    and coalesce(b.slot_ends_at,b.scheduled_at + make_interval(mins=>case when l.duration_mins>0 then l.duration_mins else 60 end))>$2`,
      [id, new Date(+start - buffer), new Date(+end + buffer), exclude],
    )
  ).rows;
  const off = (
    await c.query(
      "select starts_at,ends_at from vendor_time_off where vendor_id=$1 and starts_at<$3 and ends_at>$2",
      [id, start, end],
    )
  ).rows;
  return { busy, off };
}
export async function assertFree(
  id: string,
  start: Date,
  end: Date,
  cfg: Settings,
  c: DB,
  exclude: string | null = null,
) {
  const { busy, off } = await occupied(id, start, end, cfg, c, exclude);
  if (busy.length || off.length)
    throw new HttpError(
      409,
      "That time is no longer available. Choose another time.",
    );
}
export async function slots(
  id: string,
  duration: number,
  date: string,
  cfg: Settings,
  c: DB = pool,
) {
  validDate(date);
  const start = atQatar(date),
    end = new Date(+start + DAY);
  const earliest = Date.now() + cfg.min_notice_hours * 3600000,
    latest = Date.now() + cfg.max_advance_days * DAY;
  if (+end <= earliest || +start > latest) return [];
  const weekday = new Date(date + "T00:00:00Z").getUTCDay();
  const hours = (
    await c.query(
      "select opens_at::text,closes_at::text from vendor_hours where vendor_id=$1 and weekday=$2 order by opens_at",
      [id, weekday],
    )
  ).rows;
  const { busy, off } = await occupied(id, start, end, cfg, c);
  const mins = (s: string) =>
    Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const result = new Map<
    number,
    { start: string; end: string; label: string }
  >();
  for (const h of hours) {
    for (
      let t = +start + mins(h.opens_at) * 60000;
      t + duration * 60000 <= +start + mins(h.closes_at) * 60000;
      t += cfg.slot_step_mins * 60000
    ) {
      const e = t + duration * 60000,
        buf = cfg.buffer_mins * 60000;
      if (
        t < earliest ||
        t > latest ||
        busy.some(
          (x) =>
            t < +new Date(x.ends_at) + buf && e > +new Date(x.starts_at) - buf,
        ) ||
        off.some((x) => t < +new Date(x.ends_at) && e > +new Date(x.starts_at))
      )
        continue;
      result.set(t, {
        start: new Date(t).toISOString(),
        end: new Date(e).toISOString(),
        label: new Date(t + 10800000).toISOString().slice(11, 16),
      });
    }
  }
  return [...result.values()].sort((a, b) => a.start.localeCompare(b.start));
}
export function cancellation(b: any, cfg: Settings) {
  const start = b.slot_starts_at || b.scheduled_at;
  const deadline = start
    ? new Date(
        +new Date(start) - cfg.cancel_notice_hours * 3600000,
      ).toISOString()
    : null;
  return {
    cancel_deadline: deadline,
    can_cancel:
      LIVE.includes(b.status) &&
      (!deadline || Date.now() <= +new Date(deadline)),
  };
}
// Accept a Qatar local number or a full international number; never suffix-match.
export function phoneKey(phone: string) {
  let digits = phone.replace(/\D/g, "").replace(/^00/, "");
  if (digits.length === 8) digits = "974" + digits;
  if (!/^\d{9,15}$/.test(digits))
    throw new HttpError(
      400,
      "Enter the full phone number used for the booking.",
    );
  return digits;
}
export const PHONE_SQL = `(case when length(regexp_replace(b.contact_phone,'[^0-9]','','g'))=8 then '974'||regexp_replace(b.contact_phone,'[^0-9]','','g') else regexp_replace(regexp_replace(b.contact_phone,'[^0-9]','','g'),'^00','') end)`;
export function publicBooking(b: any, cfg: Settings) {
  const { vendor_note, first_viewed_at, buyer_id, ...rest } = b;
  return { ...rest, ...cancellation(b, cfg) };
}
