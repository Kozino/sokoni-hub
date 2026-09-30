import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { Booking, qWhen, qTime, tone, calendarURL, live } from "../lib/booking";
import { waLink } from "../lib/format";
import { Alert, Badge } from "./ui";
import "./booking.css";
export function TrackBooking() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get("booking") || ""),
    [phone, setPhone] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [booking, setBooking] = useState<Booking | null>(null),
    [credentials, setCredentials] = useState({ code: "", phone: "" });
  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    setBooking(null);
    try {
      const values = { code: code.trim(), phone: phone.trim() };
      const r = await api.get<{ booking: Booking }>(
        `/bookings/track?${new URLSearchParams(values)}`,
      );
      setBooking(r.booking);
      setCredentials(values);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (!window.confirm("Cancel this booking and release your time?")) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/bookings/cancel", credentials);
      const r = await api.get<{ booking: Booking }>(
        `/bookings/track?${new URLSearchParams(credentials)}`,
      );
      setBooking(r.booking);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-4" id="track-booking">
      <h2>Track a booking</h2>
      <p className="bk-sub">
        For services, enter your BKG booking code and the full phone number you
        gave. No account needed.
      </p>
      <form className="card card-pad" onSubmit={find}>
        <label className="booking-field">
          Booking code
          <input
            required
            maxLength={40}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="BKG-XXXXXX"
          />
        </label>
        <label className="booking-field">
          Booking phone number
          <input
            type="tel"
            required
            minLength={8}
            maxLength={25}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+974 3333 4444"
          />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Please wait…" : "Find my booking"}
        </button>
      </form>
      {error && (
        <div className="mt-2">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
      {booking && (
        <div className="card card-pad mt-3">
          <div className="row-between">
            <strong className="booking-code">{booking.code}</strong>
            <Badge tone={tone(booking.status)}>
              {booking.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="bk-sub">{booking.business_name}</p>
          <h3>{booking.listing_title}</h3>
          <div className="booking-slot-info">
            {booking.slot_starts_at || booking.scheduled_at ? (
              <strong>
                {qWhen((booking.slot_starts_at || booking.scheduled_at)!)}
                {booking.slot_ends_at
                  ? " – " + qTime(booking.slot_ends_at)
                  : ""}{" "}
                · Qatar time
              </strong>
            ) : (
              <span>
                Time not yet agreed.
                {booking.preferred_at
                  ? " Requested: " + qWhen(booking.preferred_at)
                  : ""}
              </span>
            )}
            <div className="bk-sub">
              {booking.location_type === "home"
                ? `Home visit: ${booking.address}`
                : `At provider: ${booking.vendor_address || booking.business_name}`}
            </div>
          </div>
          {booking.status === "new" && (
            <Alert kind="info">
              Awaiting provider confirmation. Please check back before
              travelling.
            </Alert>
          )}
          {booking.cancel_reason && (
            <p>Cancellation reason: {booking.cancel_reason}</p>
          )}
          <div className="col">
            {live(booking.status) &&
              (booking.slot_starts_at || booking.scheduled_at) && (
                <a
                  className="btn btn-outline"
                  href={calendarURL(credentials.code, credentials.phone)}
                  referrerPolicy="no-referrer"
                >
                  Add to calendar
                </a>
              )}
            {booking.vendor_whatsapp && (
              <a
                className="btn btn-wa"
                href={waLink(
                  booking.vendor_whatsapp,
                  `Hello, about my booking ${booking.code}.`,
                )}
                target="_blank"
                rel="noreferrer"
              >
                Message the provider
              </a>
            )}
            {booking.can_cancel && (
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={cancel}
              >
                Cancel booking
              </button>
            )}
          </div>
          {booking.cancel_deadline && live(booking.status) && (
            <p className="bk-sub mt-2">
              Cancellation deadline: {qWhen(booking.cancel_deadline)} (Qatar).{" "}
              {!booking.can_cancel
                ? "The self-service cancellation window has closed; contact the provider."
                : ""}
            </p>
          )}
          <p className="bk-sub mt-2">
            Calendar files include a two-hour reminder, subject to your device's
            notification settings. They do not automatically update when a
            booking changes.
          </p>
        </div>
      )}
    </section>
  );
}
