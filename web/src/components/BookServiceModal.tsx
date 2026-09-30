import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { Modal, Alert } from "./ui";
import { money } from "../lib/format";
import {
  Slots,
  qDate,
  qInput,
  qISO,
  addDays,
  qWhen,
  calendarURL,
} from "../lib/booking";
import "./booking.css";
interface Props {
  open: boolean;
  onClose: () => void;
  listing: {
    id: string;
    title: string;
    price: number | string;
    currency: string;
    price_type?: string;
    duration_mins?: number | null;
    business_name?: string | null;
    whatsapp?: string | null;
  };
}
export function BookServiceModal({ open, onClose, listing }: Props) {
  const [day, setDay] = useState(qDate()),
    [slot, setSlot] = useState(""),
    [data, setData] = useState<Slots | null>(null);
  const [loading, setLoading] = useState(false),
    [slotError, setSlotError] = useState(""),
    [retry, setRetry] = useState(0);
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [email, setEmail] = useState(""),
    [note, setNote] = useState("");
  const [when, setWhen] = useState(qInput()),
    [flexible, setFlexible] = useState(false),
    [location, setLocation] = useState<"vendor" | "home">("vendor"),
    [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  const [done, setDone] = useState<{
    code: string;
    status: string;
    start: string | null;
    phone: string;
    whatsapp: string | null;
  } | null>(null);
  useEffect(() => {
    if (open) {
      setDone(null);
      setErr("");
      setSlot("");
      setDay(qDate());
      setData(null);
    }
  }, [open, listing.id]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setSlot("");
    setLoading(true);
    setSlotError("");
    api
      .get<Slots>(
        `/bookings/slots?${new URLSearchParams({ listing_id: listing.id, date: day })}`,
      )
      .then((r) => {
        if (!active) return;
        setData(r);
        setLocation((old) =>
          old === "home" && r.options.offers_home_service
            ? "home"
            : r.options.offers_at_vendor
              ? "vendor"
              : "home",
        );
      })
      .catch((e) => {
        if (active) {
          setData(null);
          setSlotError(e.message || "Could not load available times.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, listing.id, day, retry]);
  const close = () => {
    if (!busy) onClose();
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || busy || loading || (data.mode === "calendar" && !slot)) return;
    setBusy(true);
    setErr("");
    try {
      const r = await api.post<{
        booking: {
          code: string;
          status: string;
          slot_starts_at: string | null;
        };
        whatsapp: string | null;
      }>("/bookings", {
        listing_id: listing.id,
        contact_name: name.trim(),
        contact_phone: phone.trim(),
        contact_email: email.trim(),
        preferred_note: note.trim() || undefined,
        ...(data.mode === "calendar"
          ? { slot_start: slot }
          : { preferred_at: flexible ? "" : qISO(when) }),
        location_type: location,
        address: location === "home" ? address.trim() : undefined,
      });
      setDone({
        code: r.booking.code,
        status: r.booking.status,
        start: r.booking.slot_starts_at,
        phone: phone.trim(),
        whatsapp: r.whatsapp,
      });
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "Could not book. Please try again.",
      );
      if (e instanceof ApiError && e.status === 409) {
        setSlot("");
        setRetry((n) => n + 1);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={
        done
          ? done.status === "confirmed"
            ? "Booking confirmed"
            : "Booking requested"
          : `Book: ${listing.title}`
      }
      footer={
        done ? (
          <button className="btn btn-primary" onClick={close}>
            Done
          </button>
        ) : (
          <>
            <button className="btn btn-outline" disabled={busy} onClick={close}>
              Close
            </button>
            <button
              type="submit"
              form="service-booking-form"
              className="btn btn-primary"
              disabled={
                busy || loading || !data || (data.mode === "calendar" && !slot)
              }
            >
              {busy
                ? "Booking…"
                : data?.mode === "calendar" && data.options.auto_accept
                  ? "Confirm booking"
                  : "Request booking"}
            </button>
          </>
        )
      }
    >
      {done ? (
        <>
          <Alert kind="success">
            {done.status === "confirmed"
              ? "Your appointment is confirmed."
              : "Your request is saved. Wait for the provider to accept before travelling."}
          </Alert>
          <p>
            Reference: <strong className="booking-code">{done.code}</strong>.
            Keep this code and your booking phone number.
          </p>
          {done.start && <p>{qWhen(done.start)} · Qatar time</p>}
          <p className="bk-sub">
            Nothing has been charged. Arrange payment directly with the
            provider.
          </p>
          <div className="col mt-2">
            <Link
              className="btn btn-primary"
              to={`/track?booking=${encodeURIComponent(done.code)}`}
              onClick={close}
            >
              Track this booking
            </Link>
            {done.start && (
              <a
                className="btn btn-outline"
                href={calendarURL(done.code, done.phone)}
                referrerPolicy="no-referrer"
              >
                Add to calendar
              </a>
            )}
            {done.whatsapp && (
              <a
                className="btn btn-wa"
                href={done.whatsapp}
                target="_blank"
                rel="noreferrer"
              >
                Message the provider
              </a>
            )}
          </div>
          <p className="bk-sub mt-2">
            Calendar reminders depend on your calendar app. Downloaded events do
            not update automatically if the booking changes.
          </p>
        </>
      ) : (
        <form id="service-booking-form" onSubmit={submit}>
          {err && <Alert kind="error">{err}</Alert>}
          <p className="bk-sub">
            Advertised at{" "}
            <strong>{money(listing.price, listing.currency)}</strong>
            {listing.price_type && listing.price_type !== "fixed"
              ? ` (${listing.price_type})`
              : ""}
            . Nothing is charged now. Duration:{" "}
            {data?.duration_mins || listing.duration_mins || 60} minutes.
          </p>
          {slotError ? (
            <Alert kind="error">
              {slotError}
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setRetry((n) => n + 1)}
              >
                Retry times
              </button>
            </Alert>
          ) : null}
          {data?.mode === "calendar" && (
            <>
              <label className="booking-field">
                Choose a day
                <input
                  aria-label="Choose a day"
                  type="date"
                  value={day}
                  min={data.today}
                  max={addDays(data.today, data.options.max_advance_days)}
                  onChange={(e) => {
                    if (e.target.value) setDay(e.target.value);
                  }}
                  required
                />
              </label>
              <div className="booking-days" aria-label="Next seven days">
                {Array.from({ length: 7 }, (_, i) =>
                  addDays(data.today, i),
                ).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={day === d}
                    onClick={() => setDay(d)}
                    disabled={
                      d > addDays(data.today, data.options.max_advance_days)
                    }
                  >
                    {new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      timeZone: "Asia/Qatar",
                    })}
                  </button>
                ))}
              </div>
              <p className="booking-label">Choose a time</p>
              <div
                className="booking-slots"
                aria-label="Available times"
                aria-busy={loading}
              >
                {!loading &&
                  data.slots.map((s) => (
                    <button
                      key={s.start}
                      type="button"
                      aria-pressed={slot === s.start}
                      onClick={() => setSlot(s.start)}
                    >
                      {s.label}
                    </button>
                  ))}
              </div>
              {!loading && data.slots.length === 0 && (
                <Alert kind="info">
                  No free times on this day. Choose another date.
                </Alert>
              )}
              <p className="bk-sub">
                All times are Qatar time.{" "}
                {data.options.auto_accept
                  ? "Confirmed immediately."
                  : "The provider must accept your request; your selected slot is held meanwhile."}
              </p>
            </>
          )}
          {loading && <p role="status">Loading available times…</p>}
          {data?.mode === "request" && (
            <>
              <Alert kind="info">
                This provider has not published a calendar. Request a preferred
                time and wait for them to agree it.
              </Alert>
              <label className="booking-field">
                Preferred date and time (Qatar)
                <input
                  aria-label="Preferred date and time"
                  type="datetime-local"
                  value={when}
                  required={!flexible}
                  disabled={flexible}
                  onChange={(e) => setWhen(e.target.value)}
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={flexible}
                  onChange={(e) => setFlexible(e.target.checked)}
                />
                I'm flexible — contact me
              </label>
            </>
          )}
          {data && (
            <fieldset className="booking-locations">
              <legend>Where?</legend>
              {data.options.offers_at_vendor && (
                <label className="checkbox">
                  <input
                    type="radio"
                    name="location"
                    checked={location === "vendor"}
                    onChange={() => setLocation("vendor")}
                  />
                  At {listing.business_name || "the provider"}
                  {data.options.vendor_address
                    ? ` — ${data.options.vendor_address}`
                    : ""}
                </label>
              )}
              {data.options.offers_home_service && (
                <label className="checkbox">
                  <input
                    type="radio"
                    name="location"
                    checked={location === "home"}
                    onChange={() => setLocation("home")}
                  />
                  At my home{" "}
                  {data.options.home_service_notes
                    ? `— ${data.options.home_service_notes}`
                    : ""}
                </label>
              )}
            </fieldset>
          )}
          {location === "home" && (
            <label className="booking-field">
              Home visit address
              <input
                aria-label="Home visit address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
                minLength={5}
                maxLength={300}
                placeholder="Area, building / villa, street and apartment"
              />
            </label>
          )}
          <label className="booking-field">
            Your name
            <input
              aria-label="Your name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="booking-field">
            Phone number
            <input
              aria-label="Phone number"
              autoComplete="tel"
              type="tel"
              required
              minLength={8}
              maxLength={25}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+974 3333 4444"
            />
          </label>
          <label className="booking-field">
            Email (optional)
            <input
              aria-label="Email (optional)"
              type="email"
              maxLength={160}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="booking-field">
            Anything they should know? (optional)
            <textarea
              aria-label="Booking note"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {data?.mode === "calendar" && (
            <p className="bk-sub">
              Self-service cancellation closes{" "}
              {data.options.cancel_notice_hours} hours before your appointment.
              No online payment is taken.
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
