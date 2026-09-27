/**
 * Vendor booking inbox.
 *
 * Bookings are leads, not orders: no money moves through the platform here.
 * The vendor's job is to contact the buyer, agree a time, and record what
 * happened. Those status stamps are what later justify charging for a service
 * listing, so the UI pushes hard toward keeping them accurate.
 *
 * Layout is one DOM that changes shape (see .bk-list in styles.css): an aligned
 * grid on desktop, a stacked card below 860px. Most of this vendor's traffic is
 * a phone between appointments, so the phone layout is the one that has to be
 * right — hence a full-width WhatsApp button per row rather than a table cell.
 */

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { money, dateTime, timeAgo, titleCase, waLink } from '../../lib/format';
import { Alert, Spinner, Empty, Badge, Modal, Field, Stat } from '../../components/ui';
import { useToast } from '../../state/ToastContext';

interface Booking {
  id: string; code: string; status: string;
  listing_title: string; duration_mins: number | null;
  contact_name: string; contact_phone: string; contact_email: string | null;
  preferred_at: string | null; preferred_note: string | null;
  scheduled_at: string | null;
  quoted_price: string | null; quoted_price_type: string | null; currency: string;
  vendor_note: string | null; cancel_reason: string | null;
  first_viewed_at: string | null; contacted_at: string | null;
  created_at: string;
}

const TONE: Record<string, 'grey' | 'green' | 'gold' | 'red' | 'blue' | 'terra'> = {
  new: 'gold', contacted: 'blue', confirmed: 'green',
  completed: 'grey', cancelled: 'red', no_show: 'red',
};

const FILTERS = ['', 'new', 'contacted', 'confirmed', 'completed', 'cancelled'] as const;

/** ISO -> value for <input type="datetime-local">, in the browser's timezone. */
function toLocalInput(iso: string | null) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 25 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function VendorBookings() {
  const toast = useToast();
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [active, setActive] = useState<Booking | null>(null);
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.get<{ bookings: Booking[] }>(`/bookings/vendor${filter ? `?status=${filter}` : ''}`)
      .then((r) => setRows(r.bookings))
      .catch(() => setRows([]));

  useEffect(() => { setRows(null); load(); /* eslint-disable-next-line */ }, [filter]);

  const counts = useMemo(() => {
    const r = rows ?? [];
    return {
      total: r.length,
      fresh: r.filter((b) => b.status === 'new').length,
      upcoming: r.filter((b) => b.status === 'confirmed' && b.scheduled_at && new Date(b.scheduled_at) > new Date()).length,
    };
  }, [rows]);

  const open = (b: Booking) => {
    setActive(b);
    setWhen(toLocalInput(b.scheduled_at || b.preferred_at));
    setNote(b.vendor_note || '');
    // Stamp first_viewed_at so response time is measurable. Fire and forget.
    if (!b.first_viewed_at) api.post(`/bookings/${b.id}/seen`, {}).catch(() => {});
  };

  const save = async (status?: string) => {
    if (!active) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { vendor_note: note.trim() || null };
      if (status) body.status = status;
      // Only send a time when one is genuinely set, so a blank field does not
      // wipe an already-agreed slot.
      if (when) body.scheduled_at = new Date(when).toISOString();
      await api.patch(`/bookings/${active.id}`, body);
      toast.push(status ? `Marked as ${status.replace('_', ' ')}` : 'Booking updated', 'success');
      setActive(null);
      await load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not update that booking', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="dash-title">
        <div>
          <h1 style={{ marginBottom: 4 }}>Bookings</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            Requests for your services. Nothing is charged through Sokoni Hub — you agree
            the time and the price with the customer directly.
          </p>
        </div>
      </div>

      <div className="grid grid-stats bk-stats mt-2">
        <Stat label="All bookings" value={String(counts.total)} />
        <Stat label="Awaiting your reply" value={String(counts.fresh)} accent={counts.fresh ? 'gold' : undefined} />
        <Stat label="Upcoming" value={String(counts.upcoming)} />
      </div>

      {counts.fresh > 0 && (
        <div className="mt-2">
          <Alert kind="warn">
            You have {counts.fresh} request{counts.fresh === 1 ? '' : 's'} you have not replied to yet.
            Customers usually book elsewhere if they do not hear back the same day.
          </Alert>
        </div>
      )}

      <div className="bk-filters mt-2">
        {FILTERS.map((f) => (
          <button key={f || 'all'}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`}
            onClick={() => setFilter(f)}>
            {f ? titleCase(f.replace('_', ' ')) : 'All'}
          </button>
        ))}
      </div>

      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <Empty icon="📅" title="No bookings yet"
          text="When a customer requests one of your services it will appear here." />
      ) : (
        <div className="bk-list mt-2">
          <div className="bk-head" role="presentation">
            <div>Reference</div>
            <div>Service</div>
            <div>Customer</div>
            <div>Requested for</div>
            <div>Status</div>
            <div />
          </div>

          {rows.map((b) => (
            <div key={b.id} className={`bk-item${b.status === 'new' ? ' is-new' : ''}`}>
              <div className="bk-c-ref">
                <div className="bk-ref">{b.code}</div>
                <div className="bk-sub">{timeAgo(b.created_at)}</div>
              </div>

              <div className="bk-c-service">
                <span className="bk-label">Service</span>
                {b.listing_title}
                {b.quoted_price && (
                  <div className="bk-sub">
                    {money(Number(b.quoted_price), b.currency)}
                    {b.quoted_price_type && b.quoted_price_type !== 'fixed' ? ` (${b.quoted_price_type})` : ''}
                  </div>
                )}
              </div>

              <div className="bk-c-customer">
                <span className="bk-label">Customer</span>
                {b.contact_name}
                <div className="bk-sub">
                  <a href={waLink(b.contact_phone, `Hello ${b.contact_name}, about your booking ${b.code}`)}
                    target="_blank" rel="noreferrer">{b.contact_phone}</a>
                </div>
              </div>

              <div className="bk-c-when bk-when">
                <span className="bk-label">Requested for</span>
                {b.scheduled_at
                  ? <><strong>{dateTime(b.scheduled_at)}</strong><div className="bk-sub">Agreed</div></>
                  : b.preferred_at
                    ? <>{dateTime(b.preferred_at)}<div className="bk-sub">Requested</div></>
                    : <span className="bk-sub">Flexible — just call</span>}
              </div>

              <div className="bk-c-status">
                <Badge tone={TONE[b.status] || 'grey'}>{titleCase(b.status.replace('_', ' '))}</Badge>
              </div>

              <div className="bk-c-action">
                <button className="btn btn-sm" onClick={() => open(b)}>Manage</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!active}
        title={active ? `Booking ${active.code}` : ''}
        onClose={() => setActive(null)}
        footer={
          <>
            <button className="btn" onClick={() => setActive(null)} disabled={busy}>Close</button>
            <button className="btn" onClick={() => save()} disabled={busy}>Save</button>
            <button className="btn btn-primary" onClick={() => save('confirmed')} disabled={busy}>
              Confirm booking
            </button>
          </>
        }
      >
        {active && (
          <>
            <p style={{ marginTop: 0 }}>
              <strong>{active.listing_title}</strong>
              {active.duration_mins ? <span className="bk-sub"> · about {active.duration_mins} minutes</span> : null}
            </p>
            <p>
              {active.contact_name} · {active.contact_phone}
              {active.contact_email ? ` · ${active.contact_email}` : ''}
            </p>

            {active.preferred_note && <blockquote className="bk-quote">{active.preferred_note}</blockquote>}

            <a className="btn btn-wa btn-block"
              href={waLink(active.contact_phone, `Hello ${active.contact_name}, about your booking ${active.code} for "${active.listing_title}".`)}
              target="_blank" rel="noreferrer"
              onClick={() => { if (active.status === 'new') save('contacted'); }}>
              Message on WhatsApp
            </a>

            <div className="mt-2">
              <Field label="Agreed date and time"
                hint="Set this once the customer has actually agreed. Required before you can confirm.">
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              </Field>

              <Field label="Private note" hint="Only you and the admin can see this.">
                <textarea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>

            <div className="bk-actions mt-2">
              <button className="btn btn-sm" onClick={() => save('completed')} disabled={busy}>Mark completed</button>
              <button className="btn btn-sm" onClick={() => save('no_show')} disabled={busy}>No show</button>
              <button className="btn btn-sm btn-danger" onClick={() => save('cancelled')} disabled={busy}>Cancel</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
