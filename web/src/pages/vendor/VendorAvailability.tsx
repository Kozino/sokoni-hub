import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import {
  Availability,
  Hours,
  Settings,
  Booking,
  qDate,
  qISO,
  qWhen,
  addDays,
} from "../../lib/booking";
import { Alert, Spinner } from "../../components/ui";
import { useToast } from "../../state/ToastContext";
import "../../components/booking.css";
const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export default function VendorAvailability() {
  const toast = useToast();
  const [data, setData] = useState<Availability | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [offBusy, setOffBusy] = useState(false),
    [retry, setRetry] = useState(0),
    [dirty, setDirty] = useState(false);
  const [from, setFrom] = useState(qDate()),
    [to, setTo] = useState(qDate()),
    [allDay, setAllDay] = useState(true),
    [startTime, setStartTime] = useState("09:00"),
    [endTime, setEndTime] = useState("18:00"),
    [reason, setReason] = useState(""),
    [conflicts, setConflicts] = useState<Booking[]>([]);
  useEffect(() => {
    let active = true;
    setError("");
    api
      .get<Availability>("/bookings/vendor/availability")
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  if (!data)
    return error ? (
      <Alert kind="error">
        {error}
        <button
          className="btn btn-outline"
          onClick={() => setRetry((n) => n + 1)}
        >
          Retry
        </button>
      </Alert>
    ) : (
      <Spinner />
    );
  const changeHours = (hours: Hours[]) => {
    setData({ ...data, hours });
    setDirty(true);
  };
  const setting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setData({ ...data, settings: { ...data.settings, [key]: value } });
    setDirty(true);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.put("/bookings/vendor/availability", {
        settings: data.settings,
        hours: data.hours,
      });
      setData({ ...data, configured: true });
      setDirty(false);
      toast.push(
        "Availability saved. Customers can book your free times.",
        "success",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save availability.");
    } finally {
      setBusy(false);
    }
  };
  const addOff = async (e: React.FormEvent) => {
    e.preventDefault();
    setOffBusy(true);
    setError("");
    try {
      const starts_at = qISO(from + "T" + (allDay ? "00:00" : startTime));
      const ends_at = qISO(
        (allDay ? addDays(to, 1) : to) + "T" + (allDay ? "00:00" : endTime),
      );
      if (ends_at <= starts_at)
        throw new Error("Time off must end after it starts.");
      const r = await api.post<{
        time_off: Availability["time_off"][number];
        conflicts: Booking[];
      }>("/bookings/vendor/time-off", { starts_at, ends_at, reason });
      setData({
        ...data,
        time_off: [...data.time_off, r.time_off].sort((a, b) =>
          a.starts_at.localeCompare(b.starts_at),
        ),
      });
      setConflicts(r.conflicts);
      setReason("");
      toast.push(
        "Time off added. Existing bookings have not been cancelled.",
        "success",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add time off.");
    } finally {
      setOffBusy(false);
    }
  };
  const removeOff = async (id: string) => {
    if (!window.confirm("Remove this time off and reopen the period?")) return;
    setOffBusy(true);
    setError("");
    try {
      await api.del(`/bookings/vendor/time-off/${id}`);
      setData({ ...data, time_off: data.time_off.filter((x) => x.id !== id) });
      setConflicts([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOffBusy(false);
    }
  };
  return (
    <div>
      <div className="dash-title">
        <div>
          <h1>Availability</h1>
          <p>
            One diary for all your services. Hours and dates are in Qatar time
            (UTC+3).
          </p>
        </div>
        <Link className="btn btn-outline" to="/vendor/bookings">
          View bookings
        </Link>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {!data.configured && (
        <Alert kind="info">
          Your services currently accept preferred-time requests. Save weekly
          hours to let customers choose free appointment times.
        </Alert>
      )}
      <form onSubmit={save}>
        <fieldset
          disabled={busy}
          style={{ border: 0, padding: 0, minWidth: 0 }}
        >
          <section className="card card-pad mb-3">
            <div className="row-between">
              <h3>Weekly hours</h3>
              <div className="row wrap">
                {[false, true].map((sat) => (
                  <button
                    key={String(sat)}
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() =>
                      changeHours(
                        [0, 1, 2, 3, 4, ...(sat ? [6] : [])].map((weekday) => ({
                          weekday,
                          opens: "09:00",
                          closes: "18:00",
                        })),
                      )
                    }
                  >
                    {sat ? "Sat–Thu" : "Sun–Thu"} 9–6
                  </button>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => changeHours([])}
                >
                  Clear all
                </button>
              </div>
            </div>
            <div className="availability-hours">
              {DAYS.map((day, weekday) => {
                const periods = data.hours
                  .map((h, i) => ({ ...h, index: i }))
                  .filter((h) => h.weekday === weekday);
                return (
                  <div key={day} className="availability-day">
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={!!periods.length}
                        onChange={(e) =>
                          changeHours(
                            e.target.checked
                              ? [
                                  ...data.hours,
                                  { weekday, opens: "09:00", closes: "18:00" },
                                ]
                              : data.hours.filter((h) => h.weekday !== weekday),
                          )
                        }
                      />
                      {day}
                    </label>
                    <div>
                      {periods.length ? (
                        periods.map((p) => (
                          <div key={p.index} className="availability-period">
                            <input
                              aria-label={`${day} opens ${p.index}`}
                              type="time"
                              required
                              value={p.opens}
                              onChange={(e) =>
                                changeHours(
                                  data.hours.map((h, i) =>
                                    i === p.index
                                      ? { ...h, opens: e.target.value }
                                      : h,
                                  ),
                                )
                              }
                            />
                            <span>to</span>
                            <input
                              aria-label={`${day} closes ${p.index}`}
                              type="time"
                              required
                              value={p.closes}
                              onChange={(e) =>
                                changeHours(
                                  data.hours.map((h, i) =>
                                    i === p.index
                                      ? { ...h, closes: e.target.value }
                                      : h,
                                  ),
                                )
                              }
                            />
                            <button
                              aria-label={`Remove ${day} period`}
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() =>
                                changeHours(
                                  data.hours.filter((_, i) => i !== p.index),
                                )
                              }
                            >
                              ×
                            </button>
                          </div>
                        ))
                      ) : (
                        <span className="bk-sub">Closed</span>
                      )}
                      {!!periods.length && (
                        <div className="row wrap">
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            disabled={periods.length >= 4}
                            onClick={() =>
                              changeHours([
                                ...data.hours,
                                { weekday, opens: "18:00", closes: "20:00" },
                              ])
                            }
                          >
                            + Second shift / break
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              changeHours(
                                DAYS.flatMap((_, w) =>
                                  periods.map((p) => ({
                                    weekday: w,
                                    opens: p.opens,
                                    closes: p.closes,
                                  })),
                                ),
                              )
                            }
                          >
                            Copy to all days
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="bk-sub mt-2">
              For a break, use separate periods, e.g. 09:00–13:00 and
              14:00–18:00. Saving all days closed stops new slot bookings;
              existing appointments remain.
            </p>
          </section>
          <section className="card card-pad mb-3">
            <h3>Where you work</h3>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={data.settings.offers_at_vendor}
                onChange={(e) => setting("offers_at_vendor", e.target.checked)}
              />
              Customers come to me — your store profile address is shown
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={data.settings.offers_home_service}
                onChange={(e) =>
                  setting("offers_home_service", e.target.checked)
                }
              />
              I can visit the customer's home
            </label>
            <label className="booking-field">
              Home visit note (optional)
              <input
                maxLength={300}
                value={data.settings.home_service_notes || ""}
                onChange={(e) => setting("home_service_notes", e.target.value)}
                placeholder="e.g. Doha only"
              />
            </label>
          </section>
          <section className="card card-pad mb-3">
            <h3>Booking rules</h3>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={data.settings.auto_accept}
                onChange={(e) => setting("auto_accept", e.target.checked)}
              />
              <span>
                <strong>Accept bookings automatically</strong>
                <br />
                Off by default: you accept or decline each request. Pending
                requests hold the chosen slot until you respond or the buyer
                cancels.
              </span>
            </label>
            <div className="form-row mt-2">
              {(
                [
                  {
                    key: "cancel_notice_hours",
                    label: "Cancellation notice (hours)",
                    min: 0,
                    max: 168,
                  },
                  {
                    key: "buffer_mins",
                    label: "Gap between customers (minutes)",
                    min: 0,
                    max: 120,
                  },
                  {
                    key: "min_notice_hours",
                    label: "Earliest booking (hours from now)",
                    min: 0,
                    max: 72,
                  },
                  {
                    key: "max_advance_days",
                    label: "Book up to (days ahead)",
                    min: 1,
                    max: 180,
                  },
                ] as const
              ).map((f) => (
                <label key={f.key} className="booking-field">
                  {f.label}
                  <input
                    type="number"
                    required
                    min={f.min}
                    max={f.max}
                    value={data.settings[f.key]}
                    onChange={(e) => setting(f.key, Number(e.target.value))}
                  />
                </label>
              ))}
              <label className="booking-field">
                Start times every
                <select
                  value={data.settings.slot_step_mins}
                  onChange={(e) =>
                    setting("slot_step_mins", Number(e.target.value))
                  }
                >
                  {[15, 30, 60].map((n) => (
                    <option key={n} value={n}>
                      {n} minutes
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="bk-sub">
              Each service uses its listing's duration (60 minutes if unset).
              Allow enough gap for travel on home visits. Rule changes apply to
              new availability; they do not move existing bookings.
            </p>
          </section>
          <div className="row mb-3">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save availability"}
            </button>
            {dirty && (
              <span className="bk-sub" role="status">
                Unsaved changes
              </span>
            )}
          </div>
        </fieldset>
      </form>
      <section className="card card-pad">
        <h3>Time off</h3>
        <p className="bk-sub">
          Block a holiday or personal appointment. This saves separately from
          weekly hours.
        </p>
        {conflicts.length > 0 && (
          <Alert kind="warn">
            <div>
              <strong>
                {conflicts.length} existing booking(s) overlap this time off.
              </strong>{" "}
              Contact these customers and resolve them in Bookings; they were
              not cancelled.
              <ul>
                {conflicts.map((b) => (
                  <li key={b.id}>
                    {b.code} · {b.contact_name} ·{" "}
                    {qWhen(b.slot_starts_at || b.scheduled_at!)}
                  </li>
                ))}
              </ul>
              <Link to="/vendor/bookings">Manage bookings →</Link>
            </div>
          </Alert>
        )}
        <form onSubmit={addOff}>
          <div className="form-row">
            <label className="booking-field">
              From
              <input
                aria-label="Time off from"
                type="date"
                required
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="booking-field">
              To {allDay ? "(including)" : ""}
              <input
                aria-label="Time off to"
                type="date"
                required
                min={from}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            All day
          </label>
          {!allDay && (
            <div className="form-row">
              <label className="booking-field">
                Start time
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </label>
              <label className="booking-field">
                End time
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </label>
            </div>
          )}
          <label className="booking-field">
            Reason (optional, private)
            <input
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button className="btn btn-outline" disabled={offBusy}>
            {offBusy ? "Saving…" : "Add time off"}
          </button>
        </form>
        <div className="mt-3">
          {data.time_off.map((t) => (
            <div className="row-between card-pad" key={t.id}>
              <div>
                <strong>
                  {qWhen(t.starts_at)} — {qWhen(t.ends_at)}
                </strong>
                <div className="bk-sub">{t.reason || "Time off"}</div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                disabled={offBusy}
                onClick={() => removeOff(t.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
