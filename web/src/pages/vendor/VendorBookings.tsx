import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import {
  Booking,
  TimeOff,
  addDays,
  qDate,
  qInput,
  qISO,
  qWhen,
  qTime,
  live,
  tone,
} from "../../lib/booking";
import { money, waLink } from "../../lib/format";
import { Alert, Spinner, Empty, Badge, Modal, Stat } from "../../components/ui";
import { useVendorDashboard } from "../../state/VendorDashboardContext";
import "../../components/booking.css";
const FILTERS = [
  "",
  "new",
  "contacted",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
];
const title = (s: string) => s.replace(/_/g, " ");
export default function VendorBookings() {
  const { refresh: refreshDashboard } = useVendorDashboard();
  const [rows, setRows] = useState<Booking[]>([]),
    [counts, setCounts] = useState<{
      total: number;
      new: number;
      upcoming: number;
    } | null>(null);
  const [filter, setFilter] = useState(""),
    [view, setView] = useState<"list" | "day" | "week">("list"),
    [day, setDay] = useState(qDate());
  const [events, setEvents] = useState<Booking[]>([]),
    [off, setOff] = useState<TimeOff[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [active, setActive] = useState<Booking | null>(null),
    [when, setWhen] = useState(""),
    [note, setNote] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [saveError, setSaveError] = useState("");
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const load = async () => {
      try {
        if (view === "list") {
          const r = await api.get<{ bookings: Booking[] }>(
            `/bookings/vendor${filter ? "?status=" + filter : ""}`,
          );
          if (alive) setRows(r.bookings);
        } else {
          const r = await api.get<{ bookings: Booking[]; time_off: TimeOff[] }>(
            `/bookings/vendor/calendar?from=${day}&to=${addDays(day, view === "week" ? 7 : 1)}`,
          );
          if (alive) {
            setEvents(r.bookings);
            setOff(r.time_off);
          }
        }
        const c = await api.get<{
          total: number;
          new: number;
          upcoming: number;
        }>("/bookings/vendor/counts");
        if (alive) setCounts(c);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [filter, view, day, refresh]);
  const open = (b: Booking) => {
    setActive(b);
    setWhen(b.scheduled_at ? qInput(b.scheduled_at) : "");
    setNote(b.vendor_note || "");
    setReason(b.cancel_reason || "");
    setSaveError("");
    void api.post(`/bookings/${b.id}/seen`).catch(() => {});
  };
  const save = async (status?: string) => {
    if (!active || busy) return;
    if (
      status === "cancelled" &&
      !window.confirm("Decline / cancel this booking and release its time?")
    )
      return;
    setBusy(true);
    setSaveError("");
    try {
      await api.patch(`/bookings/${active.id}`, {
        vendor_note: note.trim() || null,
        cancel_reason: reason.trim() || null,
        ...(status ? { status } : {}),
        ...(!active.slot_starts_at &&
        when &&
        when !== (active.scheduled_at ? qInput(active.scheduled_at) : "")
          ? { scheduled_at: qISO(when) }
          : {}),
      });
      setActive(null);
      setRefresh((n) => n + 1);
      void refreshDashboard();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const selected = active && (active.slot_starts_at || active.scheduled_at);
  return (
    <div className="booking-inbox">
      <div className="dash-title">
        <div>
          <h1>Bookings</h1>
          <p>
            Manage every service in one diary. All times are Qatar time; payment
            is arranged directly.
          </p>
        </div>
        <div className="actions">
          <button
            className="btn btn-outline"
            disabled={loading}
            onClick={() => setRefresh((n) => n + 1)}
          >
            Refresh
          </button>
          <Link className="btn btn-primary" to="/vendor/availability">
            Set availability
          </Link>
        </div>
      </div>
      <div className="grid grid-stats bk-stats mb-3">
        <Stat
          label="All bookings"
          value={counts ? String(counts.total) : "—"}
        />
        <Stat
          label="Awaiting your reply"
          value={counts ? String(counts.new) : "—"}
          accent="gold"
        />
        <Stat
          label="Upcoming"
          value={counts ? String(counts.upcoming) : "—"}
          accent="green"
        />
      </div>
      {!!counts?.new && (
        <Alert kind="warn">
          {counts.new} request(s) need a response. Pending slot requests reserve
          your time across all your service listings.
        </Alert>
      )}
      <div className="row-between mb-2">
        <div className="btn-group" aria-label="Booking view">
          {(["list", "day", "week"] as const).map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {v === "list" ? "Inbox" : v === "day" ? "Day" : "Week"}
            </button>
          ))}
        </div>
        {view !== "list" && (
          <div className="row wrap">
            <button
              className="btn btn-outline btn-sm"
              aria-label="Previous period"
              onClick={() => setDay(addDays(day, view === "week" ? -7 : -1))}
            >
              ←
            </button>
            <input
              aria-label="Calendar date"
              type="date"
              style={{ width: 170 }}
              value={day}
              onChange={(e) => {
                if (e.target.value) setDay(e.target.value);
              }}
            />
            <button
              className="btn btn-outline btn-sm"
              aria-label="Next period"
              onClick={() => setDay(addDays(day, view === "week" ? 7 : 1))}
            >
              →
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setDay(qDate())}
            >
              Today
            </button>
          </div>
        )}
      </div>
      {view === "list" && (
        <div className="bk-filters mb-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              aria-pressed={filter === f}
              className={`btn btn-sm ${filter === f ? "btn-primary" : "btn-outline"}`}
              onClick={() => setFilter(f)}
            >
              {f ? title(f) : "All"}
            </button>
          ))}
        </div>
      )}
      {error && (
        <Alert kind="error">
          {error}
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setRefresh((n) => n + 1)}
          >
            Retry
          </button>
        </Alert>
      )}
      {loading ? (
        <Spinner />
      ) : !error && view === "list" ? (
        rows.length === 0 ? (
          <Empty
            icon="📅"
            title="No bookings in this view"
            text="Bookings for your services will appear here."
          />
        ) : (
          <>
            <div className="bk-list">
              <div className="bk-head">
                <span>Reference</span>
                <span>Service</span>
                <span>Customer</span>
                <span>When</span>
                <span>Status</span>
                <span />
              </div>
              {rows.map((b) => (
                <div
                  key={b.id}
                  className={`bk-item ${b.status === "new" ? "is-new" : ""}`}
                >
                  <div className="bk-c-ref">
                    <strong className="bk-ref">{b.code}</strong>
                  </div>
                  <div className="bk-c-service">
                    <span className="bk-label">Service</span>
                    {b.listing_title}
                    <div className="bk-sub">
                      {money(b.quoted_price || 0, b.currency)}
                      {b.quoted_price_type !== "fixed"
                        ? ` (${b.quoted_price_type})`
                        : ""}
                    </div>
                  </div>
                  <div className="bk-c-customer">
                    <span className="bk-label">Customer</span>
                    {b.contact_name}
                    <div className="bk-sub">
                      <a href={`tel:${b.contact_phone}`}>{b.contact_phone}</a>
                    </div>
                  </div>
                  <div className="bk-c-when">
                    <span className="bk-label">When</span>
                    {b.slot_starts_at || b.scheduled_at ? (
                      <strong>
                        {qWhen((b.slot_starts_at || b.scheduled_at)!)}
                      </strong>
                    ) : b.preferred_at ? (
                      qWhen(b.preferred_at)
                    ) : (
                      "Flexible"
                    )}
                    <div className="bk-sub">
                      {b.slot_starts_at
                        ? "Fixed slot"
                        : b.scheduled_at
                          ? "Agreed"
                          : "Requested"}{" "}
                      ·{" "}
                      {b.location_type === "home"
                        ? "Home visit"
                        : "At provider"}
                    </div>
                  </div>
                  <div className="bk-c-status">
                    <Badge tone={tone(b.status)}>{title(b.status)}</Badge>
                  </div>
                  <div className="bk-c-action">
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => open(b)}
                    >
                      Manage
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="bk-sub mt-2">
              Latest {rows.length} matching bookings (up to 200). Use Day / Week
              to see all appointments in a date range.
            </p>
          </>
        )
      ) : !error && view !== "list" ? (
        <>
          <p className="bk-sub">
            Appointments and time off, grouped by day. Requests without an
            agreed time remain in the Inbox.
          </p>
          <div className="booking-calendar-wrap">
            <div className={`booking-calendar ${view}`}>
              {Array.from({ length: view === "week" ? 7 : 1 }, (_, i) =>
                addDays(day, i),
              ).map((d) => (
                <section key={d}>
                  <h3>
                    {new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", {
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                      timeZone: "Asia/Qatar",
                    })}
                  </h3>
                  {off
                    .filter(
                      (t) =>
                        qDate(new Date(t.starts_at)) <= d &&
                        qDate(new Date(+new Date(t.ends_at) - 1)) >= d,
                    )
                    .map((t) => (
                      <div key={t.id} className="booking-event off">
                        <strong>Time off</strong>
                        <small>
                          {qWhen(t.starts_at)} — {qWhen(t.ends_at)}
                        </small>
                        <small>{t.reason}</small>
                      </div>
                    ))}
                  {events
                    .filter(
                      (b) =>
                        qDate(
                          new Date((b.slot_starts_at || b.scheduled_at)!),
                        ) === d,
                    )
                    .map((b) => (
                      <button
                        key={b.id}
                        className={`booking-event ${live(b.status) ? "" : "closed"}`}
                        onClick={() => open(b)}
                      >
                        <strong>
                          {qTime((b.slot_starts_at || b.scheduled_at)!)}
                          {b.slot_ends_at ? " – " + qTime(b.slot_ends_at) : ""}
                        </strong>
                        <span>{b.listing_title}</span>
                        <small>
                          {b.contact_name} ·{" "}
                          {b.location_type === "home"
                            ? "Home visit"
                            : "At provider"}
                        </small>
                        <Badge tone={tone(b.status)}>{title(b.status)}</Badge>
                      </button>
                    ))}
                  {!events.some(
                    (b) =>
                      qDate(new Date((b.slot_starts_at || b.scheduled_at)!)) ===
                      d,
                  ) && <small>No appointments</small>}
                </section>
              ))}
            </div>
          </div>
        </>
      ) : null}
      <Modal
        open={!!active}
        onClose={() => {
          if (!busy) setActive(null);
        }}
        title={active ? `Booking ${active.code}` : ""}
        footer={
          <>
            <button
              className="btn btn-outline"
              disabled={busy}
              onClick={() => setActive(null)}
            >
              Close
            </button>
            <button
              className="btn btn-outline"
              disabled={busy}
              onClick={() => save()}
            >
              Save note
            </button>
            {active && ["new", "contacted"].includes(active.status) && (
              <>
                <button
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => save("cancelled")}
                >
                  Decline
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => save("confirmed")}
                >
                  Accept booking
                </button>
              </>
            )}
          </>
        }
      >
        {active && (
          <>
            {saveError && <Alert kind="error">{saveError}</Alert>}
            <p>
              <strong>{active.listing_title}</strong> ·{" "}
              {active.duration_mins || 60} minutes
            </p>
            <p>
              {active.contact_name} · {active.contact_phone}
            </p>
            <Badge tone={tone(active.status)}>{title(active.status)}</Badge>
            {active.preferred_note && (
              <blockquote className="bk-quote">
                {active.preferred_note}
              </blockquote>
            )}
            <a
              className="btn btn-wa btn-block mt-2"
              href={waLink(
                active.contact_phone,
                `Hello ${active.contact_name}, about your ${active.listing_title} booking ${active.code}${selected ? " on " + qWhen(selected) + " (Qatar time)" : ""}.`,
              )}
              target="_blank"
              rel="noreferrer"
            >
              Message on WhatsApp
            </a>
            {active.slot_starts_at ? (
              <div className="booking-slot-info">
                <small>Booked time (Qatar)</small>
                <div>
                  <strong>
                    {qWhen(active.slot_starts_at)} –{" "}
                    {qTime(active.slot_ends_at!)}
                  </strong>
                </div>
                <p className="bk-sub">
                  Fixed appointment. To change the time, cancel and ask the
                  customer to rebook.
                </p>
              </div>
            ) : (
              <label className="booking-field mt-2">
                Agreed date and time (Qatar)
                <input
                  type="datetime-local"
                  disabled={!live(active.status)}
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
                <small>
                  {active.preferred_at
                    ? "Requested: " + qWhen(active.preferred_at)
                    : "Agree a time before confirming."}
                </small>
              </label>
            )}
            <p>
              {active.location_type === "home"
                ? `Home visit: ${active.address}`
                : `At provider: ${active.vendor_address || "Confirm the address with the customer."}`}
            </p>
            <label className="booking-field">
              Private note
              <textarea
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
              />
              <small>Only you and the admin can see this.</small>
            </label>
            <label className="booking-field">
              Reason if you decline or cancel
              <input
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <small>The customer can see this reason.</small>
            </label>
            {active.status === "confirmed" && (
              <div className="bk-actions">
                <button
                  className="btn btn-outline"
                  disabled={
                    busy || (!!selected && +new Date(selected) > Date.now())
                  }
                  onClick={() => save("completed")}
                >
                  Mark completed
                </button>
                <button
                  className="btn btn-outline"
                  disabled={
                    busy || (!!selected && +new Date(selected) > Date.now())
                  }
                  onClick={() => save("no_show")}
                >
                  No show
                </button>
                <button
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => save("cancelled")}
                >
                  Cancel booking
                </button>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
