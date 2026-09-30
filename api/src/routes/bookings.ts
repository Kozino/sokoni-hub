/** One vendor diary across ALL service listings. No orders, stock or payment writes. */
import { Router } from "express";
import { z } from "zod";
import { one, query, tx } from "../db";
import { requireAuth, loadVendor } from "../auth";
import {
  HttpError,
  audit,
  randomCode,
  waLink,
  screenProhibited,
} from "../utils";
import { DEFAULT_CURRENCY } from "../delivery";
import {
  LIVE,
  DAY,
  defaults,
  settings,
  calendarEnabled,
  slots,
  durationOf,
  lockVendor,
  assertFree,
  cancellation,
  publicBooking,
  phoneKey,
  PHONE_SQL,
  qDate,
  qLong,
  validDate,
  atQatar,
} from "../booking/availability";
export const bookingRouter = Router();
bookingRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  next();
});
const SELECT = `select b.*,l.title as listing_title,l.slug as listing_slug,l.kind as listing_kind,l.duration_mins,
 v.business_name,v.whatsapp as vendor_whatsapp,v.city as vendor_city,v.address as vendor_address
 from service_bookings b join listings l on l.id=b.listing_id join vendors v on v.id=b.vendor_id`;
const uuid = z.string().uuid();
const statuses = z.enum([
  "new",
  "contacted",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);
const createSchema = z.object({
  listing_id: uuid,
  contact_name: z.string().trim().min(2).max(120),
  contact_phone: z.string().min(7).max(25),
  contact_email: z.string().email().max(160).optional().or(z.literal("")),
  preferred_at: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.literal("")),
  preferred_note: z.string().max(500).optional(),
  slot_start: z.string().datetime({ offset: true }).optional(),
  location_type: z.enum(["vendor", "home"]).optional(),
  address: z.string().trim().max(300).optional(),
});
bookingRouter.post("/", async (req, res, next) => {
  try {
    const b = createSchema.parse(req.body),
      phone = phoneKey(b.contact_phone);
    const bad = await screenProhibited(b.preferred_note, b.contact_name);
    if (bad)
      throw new HttpError(
        422,
        "Please revise your booking note or contact name.",
      );
    const result = await tx(async (c) => {
      // Global phone lock precedes vendor lock for a race-safe upcoming limit.
      await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `booking-phone:${phone}`,
      ]);
      const vendorId = (
        await c.query("select vendor_id from listings where id=$1", [
          b.listing_id,
        ])
      ).rows[0]?.vendor_id;
      if (!vendorId) throw new HttpError(404, "Service not found.");
      await lockVendor(c, vendorId);
      const l = (
        await c.query(
          `select l.*,v.status as vendor_status,v.user_id as vendor_user_id,v.business_name,v.whatsapp
    from listings l join vendors v on v.id=l.vendor_id where l.id=$1 for share of l,v`,
          [b.listing_id],
        )
      ).rows[0];
      if (l.kind !== "service")
        throw new HttpError(422, "Products go through the cart, not bookings.");
      if (l.status !== "active" || l.vendor_status !== "verified")
        throw new HttpError(409, "This service is not currently available.");
      if (req.user?.id === l.vendor_user_id)
        throw new HttpError(403, "You cannot book your own service.");
      const cfg = await settings(vendorId, c),
        calendar = await calendarEnabled(vendorId, c);
      let start: string | null = null,
        end: string | null = null;
      const location =
        b.location_type || (cfg.offers_at_vendor ? "vendor" : "home");
      if (
        location === "home" &&
        (!cfg.offers_home_service || !b.address || b.address.length < 5)
      )
        throw new HttpError(
          422,
          "Home service must be offered and a full address is required.",
        );
      if (location === "vendor" && !cfg.offers_at_vendor)
        throw new HttpError(422, "This provider only offers home visits.");
      if (calendar) {
        if (!b.slot_start)
          throw new HttpError(422, "Please choose an available time.");
        const chosen = new Date(b.slot_start).toISOString();
        const offered = await slots(
          vendorId,
          durationOf(l.duration_mins),
          qDate(new Date(chosen)),
          cfg,
          c,
        );
        const slot = offered.find((s) => s.start === chosen);
        if (!slot)
          throw new HttpError(
            409,
            "That time is no longer available. Choose another time.",
          );
        start = slot.start;
        end = slot.end;
      } else if (b.preferred_at && +new Date(b.preferred_at) < Date.now())
        throw new HttpError(422, "Choose a preferred time in the future.");
      const count = (
        await c.query(
          `select count(*)::int as n from service_bookings b where ${PHONE_SQL}=$1 and status in ('new','contacted','confirmed') and (coalesce(slot_starts_at,scheduled_at,preferred_at)>now() or (slot_starts_at is null and scheduled_at is null and preferred_at is null))`,
          [phone],
        )
      ).rows[0].n;
      if (count >= 5)
        throw new HttpError(
          429,
          "You already have five open or upcoming bookings.",
        );
      let row: any;
      for (let attempt = 0; attempt < 3 && !row; attempt++) {
        row = (
          await c.query(
            `insert into service_bookings(code,listing_id,vendor_id,buyer_id,contact_name,contact_phone,contact_email,
    preferred_at,preferred_note,scheduled_at,slot_starts_at,slot_ends_at,location_type,address,status,quoted_price,quoted_price_type,currency)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    on conflict(code) do nothing returning *`,
            [
              randomCode("BKG"),
              l.id,
              vendorId,
              req.user?.id ?? null,
              b.contact_name,
              phone,
              b.contact_email || null,
              start || b.preferred_at || null,
              b.preferred_note || null,
              start && cfg.auto_accept ? start : null,
              start,
              end,
              location,
              location === "home" ? b.address : null,
              start && cfg.auto_accept ? "confirmed" : "new",
              l.price,
              l.price_type,
              l.currency || DEFAULT_CURRENCY,
            ],
          )
        ).rows[0];
      }
      if (!row) throw new HttpError(503, "Please try your booking again.");
      return {
        booking: publicBooking(row, cfg),
        auto_confirmed: row.status === "confirmed",
        whatsapp: l.whatsapp
          ? waLink(
              l.whatsapp,
              `Hello ${l.business_name}, my booking for ${l.title} is ${row.code}. ${start ? qLong(start) + " (Qatar time)." : ""}`,
            )
          : null,
      };
    });
    res.status(201).json(result);
  } catch (e: any) {
    next(
      e.code === "23P01"
        ? new HttpError(409, "That time was just taken. Choose another time.")
        : e,
    );
  }
});
bookingRouter.get("/slots", async (req, res, next) => {
  try {
    const id = uuid.parse(req.query.listing_id),
      date = validDate(String(req.query.date || ""));
    const l = await one<any>(
      `select l.*,v.address as vendor_address from listings l join vendors v on v.id=l.vendor_id
 where l.id=$1 and l.kind='service' and l.status='active' and v.status='verified'`,
      [id],
    );
    if (!l) throw new HttpError(404, "Service not available.");
    const cfg = await settings(l.vendor_id),
      enabled = await calendarEnabled(l.vendor_id);
    res.json({
      mode: enabled ? "calendar" : "request",
      slots: enabled
        ? await slots(l.vendor_id, durationOf(l.duration_mins), date, cfg)
        : [],
      duration_mins: durationOf(l.duration_mins),
      options: { ...cfg, vendor_address: l.vendor_address },
      today: qDate(),
    });
  } catch (e) {
    next(e);
  }
});

async function lookup(code: unknown, phone: unknown) {
  const key = z.string().trim().min(4).max(40).parse(code).toUpperCase();
  const digits = phoneKey(z.string().max(25).parse(phone));
  const b = await one<any>(
    `${SELECT} where upper(b.code)=$1 and ${PHONE_SQL}=$2`,
    [key, digits],
  );
  if (!b)
    throw new HttpError(
      404,
      "No booking found with that code and full phone number.",
    );
  return b;
}
bookingRouter.get("/track", async (req, res, next) => {
  try {
    const b = await lookup(req.query.code, req.query.phone);
    res.json({ booking: publicBooking(b, await settings(b.vendor_id)) });
  } catch (e) {
    next(e);
  }
});
bookingRouter.get(
  "/mine",
  requireAuth("buyer", "vendor", "admin"),
  async (req, res, next) => {
    try {
      const rows = await query<any>(
        `${SELECT} where b.buyer_id=$1 order by b.created_at desc limit 100`,
        [req.user!.id],
      );
      res.json({
        bookings: await Promise.all(
          rows.map(async (b) => publicBooking(b, await settings(b.vendor_id))),
        ),
      });
    } catch (e) {
      next(e);
    }
  },
);
async function cancel(b: any, reason: string, admin = false) {
  return tx(async (c) => {
    await lockVendor(c, b.vendor_id);
    const current = (
      await c.query("select * from service_bookings where id=$1 for update", [
        b.id,
      ])
    ).rows[0];
    if (!current) throw new HttpError(404, "Booking not found.");
    if (!LIVE.includes(current.status))
      throw new HttpError(409, "This booking is already closed.");
    const cfg = await settings(b.vendor_id, c);
    if (!admin && !cancellation(current, cfg).can_cancel)
      throw new HttpError(
        403,
        `Cancellation closes ${cfg.cancel_notice_hours} hours before the appointment. Please contact the provider.`,
      );
    const row = (
      await c.query(
        `update service_bookings set status='cancelled',cancel_reason=$2,cancelled_by='buyer',updated_at=now() where id=$1 returning *`,
        [b.id, reason],
      )
    ).rows[0];
    return publicBooking(row, cfg);
  });
}
bookingRouter.post("/cancel", async (req, res, next) => {
  try {
    const b = z
      .object({
        code: z.string(),
        phone: z.string(),
        reason: z.string().max(300).optional(),
      })
      .parse(req.body);
    res.json({
      booking: await cancel(
        await lookup(b.code, b.phone),
        b.reason || "Cancelled by buyer",
      ),
    });
  } catch (e) {
    next(e);
  }
});
bookingRouter.post(
  "/:id/cancel",
  requireAuth("buyer", "vendor", "admin"),
  async (req, res, next) => {
    try {
      const b = await one<any>("select * from service_bookings where id=$1", [
        uuid.parse(req.params.id),
      ]);
      if (!b) throw new HttpError(404, "Booking not found.");
      if (req.user!.role !== "admin" && b.buyer_id !== req.user!.id)
        throw new HttpError(403, "That is not your booking.");
      const reason =
        z.string().max(300).optional().parse(req.body.reason) ||
        "Cancelled by buyer";
      res.json({
        booking: await cancel(b, reason, req.user!.role === "admin"),
      });
    } catch (e) {
      next(e);
    }
  },
);
bookingRouter.get("/ics", async (req, res, next) => {
  try {
    const b = await lookup(req.query.code, req.query.phone),
      start = b.slot_starts_at || b.scheduled_at;
    if (!start || !LIVE.includes(b.status))
      throw new HttpError(
        409,
        "Only active bookings with an agreed time can be added to a calendar.",
      );
    const fmt = (d: any) =>
      new Date(d)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    const esc = (s: string) =>
      s
        .replace(/\\/g, "\\\\")
        .replace(/\r?\n|\r/g, "\\n")
        .replace(/[,;]/g, "\\$&");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Sokoni Hub//Appointments//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${b.id}@sokoni-hub`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(b.slot_ends_at || new Date(+new Date(start) + durationOf(b.duration_mins) * 60000))}`,
      `STATUS:${b.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}`,
      `SUMMARY:${esc(`${b.listing_title} — ${b.business_name}`)}`,
      `DESCRIPTION:${esc(`Booking ${b.code}. ${b.status === "confirmed" ? "Confirmed" : "Awaiting provider confirmation"}. Check booking status before travelling.`)}`,
      `LOCATION:${esc(b.location_type === "home" ? b.address || "Home visit" : b.vendor_address || b.business_name)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Appointment reminder",
      "TRIGGER:-PT2H",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ];
    // RFC5545 line folding counts UTF-8 octets, not JS UTF-16 code units.
    const fold = (line: string) => {
      let out = "",
        n = 0;
      for (const ch of line) {
        const size = Buffer.byteLength(ch);
        if (n + size > 73) {
          out += "\r\n ";
          n = 1;
        }
        out += ch;
        n += size;
      }
      return out;
    };
    res
      .type("text/calendar")
      .set(
        "Content-Disposition",
        `attachment; filename="${b.code.replace(/[^A-Z0-9-]/g, "")}.ics"`,
      )
      .send(lines.map(fold).join("\r\n") + "\r\n");
  } catch (e) {
    next(e);
  }
});

bookingRouter.get(
  "/vendor",
  requireAuth("vendor"),
  loadVendor,
  async (req, res, next) => {
    try {
      const status = req.query.status ? statuses.parse(req.query.status) : "";
      const rows = await query(
        `${SELECT} where b.vendor_id=$1 and ($2='' or b.status::text=$2) order by b.created_at desc limit 200`,
        [req.vendor!.id, status],
      );
      res.json({ bookings: rows, limit: 200 });
    } catch (e) {
      next(e);
    }
  },
);
bookingRouter.get(
  "/vendor/counts",
  requireAuth("vendor"),
  loadVendor,
  async (req, res, next) => {
    try {
      const r = await one<any>(
        `select count(*)::int as total,count(*) filter(where status='new')::int as new,
 count(*) filter(where status='confirmed')::int as confirmed,
 count(*) filter(where status='confirmed' and coalesce(slot_starts_at,scheduled_at)>now())::int as upcoming from service_bookings where vendor_id=$1`,
        [req.vendor!.id],
      );
      res.json(r);
    } catch (e) {
      next(e);
    }
  },
);
const settingsSchema = z
  .object({
    auto_accept: z.boolean(),
    offers_at_vendor: z.boolean(),
    offers_home_service: z.boolean(),
    home_service_notes: z.string().max(300).nullable().optional(),
    cancel_notice_hours: z.number().int().min(0).max(168),
    buffer_mins: z.number().int().min(0).max(120),
    slot_step_mins: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    min_notice_hours: z.number().int().min(0).max(72),
    max_advance_days: z.number().int().min(1).max(180),
  })
  .refine(
    (s) => s.offers_at_vendor || s.offers_home_service,
    "Choose at least one service location.",
  );
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
bookingRouter.get(
  "/vendor/availability",
  requireAuth("vendor"),
  loadVendor,
  async (req, res, next) => {
    try {
      const id = req.vendor!.id;
      res.json({
        settings: await settings(id),
        configured: await calendarEnabled(id),
        hours: await query(
          `select id,weekday,to_char(opens_at,'HH24:MI') as opens,to_char(closes_at,'HH24:MI') as closes from vendor_hours where vendor_id=$1 order by weekday,opens_at`,
          [id],
        ),
        time_off: await query(
          "select * from vendor_time_off where vendor_id=$1 and ends_at>now() order by starts_at",
          [id],
        ),
      });
    } catch (e) {
      next(e);
    }
  },
);
bookingRouter.put(
  "/vendor/availability",
  requireAuth("vendor"),
  loadVendor,
  async (req, res, next) => {
    try {
      const b = z
        .object({
          settings: settingsSchema,
          hours: z
            .array(
              z
                .object({
                  weekday: z.number().int().min(0).max(6),
                  opens: hhmm,
                  closes: hhmm,
                })
                .refine(
                  (h) => h.closes > h.opens,
                  "Closing time must be after opening time.",
                ),
            )
            .max(28),
        })
        .parse(req.body);
      const sorted = [...b.hours].sort(
        (a, b) => a.weekday - b.weekday || a.opens.localeCompare(b.opens),
      );
      if (
        sorted.some(
          (h, i) =>
            i > 0 &&
            h.weekday === sorted[i - 1].weekday &&
            h.opens < sorted[i - 1].closes,
        )
      )
        throw new HttpError(422, "Weekly periods cannot overlap.");
      const st = { ...defaults, ...b.settings },
        id = req.vendor!.id;
      await tx(async (c) => {
        await lockVendor(c, id);
        await c.query(
          `insert into vendor_booking_settings(vendor_id,auto_accept,offers_at_vendor,offers_home_service,home_service_notes,cancel_notice_hours,buffer_mins,slot_step_mins,min_notice_hours,max_advance_days)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(vendor_id) do update set auto_accept=excluded.auto_accept,offers_at_vendor=excluded.offers_at_vendor,
   offers_home_service=excluded.offers_home_service,home_service_notes=excluded.home_service_notes,cancel_notice_hours=excluded.cancel_notice_hours,
   buffer_mins=excluded.buffer_mins,slot_step_mins=excluded.slot_step_mins,min_notice_hours=excluded.min_notice_hours,max_advance_days=excluded.max_advance_days,updated_at=now()`,
          [
            id,
            st.auto_accept,
            st.offers_at_vendor,
            st.offers_home_service,
            st.home_service_notes,
            st.cancel_notice_hours,
            st.buffer_mins,
            st.slot_step_mins,
            st.min_notice_hours,
            st.max_advance_days,
          ],
        );
        await c.query("delete from vendor_hours where vendor_id=$1", [id]);
        for (const h of b.hours)
          await c.query(
            "insert into vendor_hours(vendor_id,weekday,opens_at,closes_at) values($1,$2,$3,$4)",
            [id, h.weekday, h.opens, h.closes],
          );
      });
      await audit(req.user!.id, "vendor.availability", "vendor", id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);
bookingRouter.post(
  "/vendor/time-off",
  requireAuth("vendor"),
  loadVendor,
  async (req, res, next) => {
    try {
      const b = z
        .object({
          starts_at: z.string().datetime({ offset: true }),
          ends_at: z.string().datetime({ offset: true }),
          reason: z.string().max(200).nullable().optional(),
        })
        .parse(req.body);
      if (+new Date(b.ends_at) <= +new Date(b.starts_at))
        throw new HttpError(422, "Time off must end after it starts.");
      const result = await tx(async (c) => {
        await lockVendor(c, req.vendor!.id);
        const row = (
          await c.query(
            "insert into vendor_time_off(vendor_id,starts_at,ends_at,reason) values($1,$2,$3,$4) returning *",
            [req.vendor!.id, b.starts_at, b.ends_at, b.reason || null],
          )
        ).rows[0];
        const conflicts = (
          await c.query(
            `${SELECT} where b.vendor_id=$1 and b.status in ('new','contacted','confirmed') and coalesce(b.slot_starts_at,b.scheduled_at)<$3 and coalesce(b.slot_ends_at,b.scheduled_at+make_interval(mins=>case when l.duration_mins>0 then l.duration_mins else 60 end))>$2`,
            [req.vendor!.id, b.starts_at, b.ends_at],
          )
        ).rows;
        return { time_off: row, conflicts };
      });
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  },
);
bookingRouter.delete(
  "/vendor/time-off/:id",
  requireAuth("vendor"),
  loadVendor,
  async (req, res, next) => {
    try {
      await tx(async (c) => {
        await lockVendor(c, req.vendor!.id);
        const r = await c.query(
          "delete from vendor_time_off where id=$1 and vendor_id=$2",
          [uuid.parse(req.params.id), req.vendor!.id],
        );
        if (!r.rowCount) throw new HttpError(404, "Time off not found.");
      });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);
bookingRouter.get(
  "/vendor/calendar",
  requireAuth("vendor"),
  loadVendor,
  async (req, res, next) => {
    try {
      const from = validDate(String(req.query.from || "")),
        to = validDate(String(req.query.to || ""));
      const start = atQatar(from),
        end = atQatar(to);
      if (+end <= +start || +end - +start > 32 * DAY)
        throw new HttpError(400, "Choose a calendar range of 1–32 days.");
      const id = req.vendor!.id;
      res.json({
        bookings: await query(
          `${SELECT} where b.vendor_id=$1 and coalesce(b.slot_starts_at,b.scheduled_at)>=$2 and coalesce(b.slot_starts_at,b.scheduled_at)<$3 order by coalesce(b.slot_starts_at,b.scheduled_at)`,
          [id, start, end],
        ),
        time_off: await query(
          "select * from vendor_time_off where vendor_id=$1 and starts_at<$3 and ends_at>$2 order by starts_at",
          [id, start, end],
        ),
      });
    } catch (e) {
      next(e);
    }
  },
);
const transitions: Record<string, string[]> = {
  new: ["contacted", "confirmed", "cancelled"],
  contacted: ["confirmed", "cancelled"],
  confirmed: ["completed", "no_show", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};
bookingRouter.patch(
  "/:id",
  requireAuth("vendor", "admin"),
  async (req, res, next) => {
    try {
      const b = z
        .object({
          status: statuses.optional(),
          scheduled_at: z
            .string()
            .datetime({ offset: true })
            .nullable()
            .optional(),
          vendor_note: z.string().max(500).nullable().optional(),
          cancel_reason: z.string().max(300).nullable().optional(),
        })
        .parse(req.body);
      const id = uuid.parse(req.params.id),
        found = await one<any>(
          "select vendor_id from service_bookings where id=$1",
          [id],
        );
      if (!found) throw new HttpError(404, "Booking not found.");
      const owner = await one<any>("select user_id from vendors where id=$1", [
        found.vendor_id,
      ]);
      if (req.user!.role !== "admin" && owner?.user_id !== req.user!.id)
        throw new HttpError(403, "This booking belongs to another provider.");
      const row = await tx(async (c) => {
        await lockVendor(c, found.vendor_id);
        const current = (
          await c.query(`${SELECT} where b.id=$1 for update of b`, [id])
        ).rows[0];
        const nextStatus = b.status || current.status;
        if (
          nextStatus !== current.status &&
          !transitions[current.status]?.includes(nextStatus)
        )
          throw new HttpError(
            409,
            "That status transition is not allowed. Refresh the booking.",
          );
        if (
          current.slot_starts_at &&
          b.scheduled_at !== undefined &&
          (!b.scheduled_at ||
            +new Date(b.scheduled_at) !== +new Date(current.slot_starts_at))
        )
          throw new HttpError(
            422,
            "Slot times are fixed. Cancel and rebook to change the appointment.",
          );
        let agreed =
          current.slot_starts_at ||
          (b.scheduled_at === undefined
            ? current.scheduled_at
            : b.scheduled_at);
        if (nextStatus === "confirmed" && !agreed)
          throw new HttpError(422, "Set the agreed time before confirming.");
        const changed =
          agreed &&
          (!current.scheduled_at ||
            +new Date(agreed) !== +new Date(current.scheduled_at));
        if (
          changed &&
          !current.slot_starts_at &&
          +new Date(agreed) < Date.now()
        )
          throw new HttpError(422, "Choose an agreed time in the future.");
        if (
          nextStatus === "confirmed" &&
          current.status !== "confirmed" &&
          +new Date(agreed) < Date.now()
        )
          throw new HttpError(
            422,
            "An appointment in the past cannot be confirmed.",
          );
        if (
          ["completed", "no_show"].includes(nextStatus) &&
          nextStatus !== current.status &&
          agreed &&
          +new Date(agreed) > Date.now()
        )
          throw new HttpError(422, "This appointment has not started yet.");
        if (
          !current.slot_starts_at &&
          agreed &&
          changed &&
          LIVE.includes(nextStatus)
        )
          await assertFree(
            found.vendor_id,
            new Date(agreed),
            new Date(
              +new Date(agreed) + durationOf(current.duration_mins) * 60000,
            ),
            await settings(found.vendor_id, c),
            c,
            id,
          );
        return (
          await c.query(
            `update service_bookings set status=$2::text::booking_status,scheduled_at=$3,
   vendor_note=case when $4 then $5 else vendor_note end,cancel_reason=case when $6 then $7 else cancel_reason end,
   cancelled_by=case when $2='cancelled' then coalesce(cancelled_by,'vendor') else cancelled_by end,
   contacted_at=case when $2 in ('contacted','confirmed') then coalesce(contacted_at,now()) else contacted_at end,
   completed_at=case when $2='completed' then coalesce(completed_at,now()) else completed_at end,updated_at=now() where id=$1 returning *`,
            [
              id,
              nextStatus,
              agreed ?? null,
              b.vendor_note !== undefined,
              b.vendor_note ?? null,
              b.cancel_reason !== undefined,
              b.cancel_reason ?? null,
            ],
          )
        ).rows[0];
      });
      await audit(req.user!.id, "booking.update", "service_booking", id, {
        status: b.status,
      });
      res.json({ booking: row });
    } catch (e: any) {
      next(
        e.code === "23P01"
          ? new HttpError(409, "That time conflicts with another booking.")
          : e,
      );
    }
  },
);
bookingRouter.post(
  "/:id/seen",
  requireAuth("vendor"),
  loadVendor,
  async (req, res, next) => {
    try {
      await query(
        "update service_bookings set first_viewed_at=coalesce(first_viewed_at,now()) where id=$1 and vendor_id=$2",
        [uuid.parse(req.params.id), req.vendor!.id],
      );
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);

/* ============================== admin ============================== */

/** GET /bookings/admin — everything, with the filters admin actually needs. */
bookingRouter.get("/admin", requireAuth("admin"), async (req, res, next) => {
  try {
    const status = String(req.query.status || "");
    const vendor = String(req.query.vendor_id || "");
    const rows = await query(
      `${SELECT}
        where ($1 = '' or b.status::text = $1)
          and ($2 = '' or b.vendor_id::text = $2)
        order by b.created_at desc limit 500`,
      [status, vendor],
    );
    res.json({ bookings: rows });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /bookings/admin/stats — demand per vendor.
 *
 * This is the evidence base for charging service vendors a fee: how many
 * bookings the platform sent them, and how fast they responded.
 */
bookingRouter.get(
  "/admin/stats",
  requireAuth("admin"),
  async (req, res, next) => {
    try {
      const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
      const rows = await query(
        `select v.id as vendor_id, v.business_name, v.city,
              count(b.*)                                          as bookings,
              count(b.*) filter (where b.status = 'completed')     as completed,
              count(b.*) filter (where b.status = 'cancelled')     as cancelled,
              count(b.*) filter (where b.status = 'no_show')       as no_shows,
              count(b.*) filter (where b.first_viewed_at is null
                                   and b.status = 'new')           as unseen,
              round(avg(extract(epoch from (b.first_viewed_at - b.created_at)) / 3600)::numeric, 1)
                                                                   as avg_response_hours
         from vendors v
         join service_bookings b on b.vendor_id = v.id
        where b.created_at >= now() - ($1 || ' days')::interval
        group by v.id, v.business_name, v.city
        order by bookings desc`,
        [String(days)],
      );
      res.json({ days, vendors: rows });
    } catch (e) {
      next(e);
    }
  },
);
