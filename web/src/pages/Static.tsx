import { legalConfig as c } from '../legalConfig';
import {qWhen} from '../lib/booking';
import SessionManager from '../components/SessionManager';
import { TrackBooking } from '../components/TrackBooking';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError, setToken } from '../lib/api';
import { Alert, Field, StatusBadge } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { money, dateTime } from '../lib/format';
import { orderProgressStep } from '../lib/orderStatus';
import type { Order } from '../types';
import { IconBox, IconHistory, IconSettings, IconTrash } from '../components/icons';
import './account.css';

/* ------------------------------------------------------------------ */
export function Sell() {
  const { user, vendor } = useAuth();
  const dest = !user ? '/register?role=vendor' : vendor ? '/vendor' : '/vendor/onboard';
  return (
    <div className="container">
      <div className="card card-pad center" style={{ background: 'var(--green)', color: '#fff', borderColor: 'transparent' }}>
        <h1 style={{ color: '#fff' }}>Turn your social media hustle into a real storefront</h1>
        <p style={{ color: 'rgba(255,255,255,.86)', maxWidth: 640, margin: '0 auto 20px' }}>
          Free to join. Admin-verified. Buyers find you by searching — not by scrolling past your status.
        </p>
        <Link to={dest} className="btn btn-primary btn-lg">{vendor ? 'Go to my dashboard' : 'Register your business'}</Link>
      </div>

      <div className="grid grid-2 mt-4">
        <div className="card card-pad">
          <h3>✅ What you can sell</h3>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            <li>Food stuff: rice, beans, garri, oils, spices, frozen items, fruits &amp; vegetables</li>
            <li>Sold by kg, litre, bag, carton, pack or piece</li>
            <li>Services: hair styling &amp; braids, nails, makeup artistry</li>
            <li>Photography, videography &amp; video editing, graphics &amp; design</li>
            <li>Tailoring, catering &amp; small chops, events, cleaning &amp; laundry</li>
          </ul>
        </div>
        <div className="card card-pad">
          <h3 style={{ color: 'var(--danger)' }}>🚫 What you cannot sell</h3>
          <div className="prohibited">
            <strong>Medicine, drugs or pharmaceutical products</strong> of any kind are strictly prohibited.
            Our system screens every listing, and admins remove violations and suspend repeat offenders.
          </div>
        </div>
      </div>

      <div className="grid grid-3 mt-3">
        {[
          ['📋', 'Real product records', 'Name, price, quantity in stock, unit, weight in kg or volume in litres — buyers see exactly what they get.'],
          ['🛡️', 'Verification badge', 'Admins review your business details and CR licence before you go live. Buyers trust a verified badge.'],
          ['📈', 'Your own dashboard', 'Track views, stock levels, orders by status, revenue trends and complaints in one place.'],
          ['💵', 'Cash on delivery', 'No payment gateway needed to start. Buyers pay you when goods arrive.'],
          ['📦', 'Order and track', 'Place an order at checkout and follow it live until it reaches your door.'],
          ['🔔', 'Complaint handling', 'Disputes go through admin, not a shouting match in your DMs.'],
        ].map(([ico, t, d]) => (
          <div key={t} className="card card-pad">
            <div style={{ fontSize: '1.6rem' }}>{ico}</div>
            <h4>{t}</h4>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '.88rem' }}>{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function Policy() {
  return (
    <div className="container container-narrow">
      <h1>Marketplace policy</h1>
      <div className="card card-pad">
        <h3>Prohibited categories</h3>
        <div className="prohibited mb-2">
          <p style={{ margin: '8px 0 0' }}><strong>1. Medicine &amp; drugs</strong> — tablets, capsules, syrups, antibiotics, injections, supplements sold as medicine, and any pharmaceutical product.</p>
        </div>
        <p>These restrictions exist because safe distribution of such products requires regulatory licensing that this platform does not verify. Listings are screened automatically at upload and reviewed manually by admins.</p>

        <h3 className="mt-3">Vendor verification</h3>
        <p>Every vendor account is reviewed by an administrator before any listing can be published. We check the business name, city, phone number and an uploaded CR or business-registration licence. Verification can be revoked if a vendor breaks the rules.</p>

        <h3 className="mt-3">Payments</h3>
        <p>Sokoni Hub does not currently hold or process funds. Buyers pay <strong>cash on delivery</strong>, or use <strong>bank transfer</strong> directly with the vendor. Always inspect goods before paying.</p>

        <h3 className="mt-3">Complaints</h3>
        <p>Any buyer — with or without an account — can file a complaint against a store, a listing or an order. You receive a reference code to track the outcome. Admins can investigate, resolve, dismiss, remove listings and suspend vendors.</p>
        <Link to="/support" className="btn btn-primary mt-2">File a complaint</Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function Support() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const [f, setF] = useState({
    subject: '', body: '', order_code: '',
    reporter_name: user?.full_name || '', reporter_phone: user?.phone || '',
  });
  const [ref, setRef] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [track, setTrack] = useState('');
  const [trackPhone, setTrackPhone] = useState('');
  const [tracked, setTracked] = useState<any>(null);
  const [trackErr, setTrackErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await api.post<{ complaint: { code: string } }>('/complaints', {
        ...f,
        order_code: f.order_code || undefined,
        vendor_id: params.get('vendor') || undefined,
        listing_id: params.get('listing') || undefined,
      });
      setRef(r.complaint.code);
      setF({ ...f, subject: '', body: '', order_code: '' });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not submit');
    } finally { setBusy(false); }
  };

  const doTrack = async (e: React.FormEvent) => {
    e.preventDefault(); setTrackErr(''); setTracked(null);
    try { setTracked((await api.get<any>(`/complaints/track/${encodeURIComponent(track.trim())}?phone=${encodeURIComponent(trackPhone)}`)).complaint); }
    catch (e) { setTrackErr(e instanceof ApiError ? e.message : 'Not found'); }
  };

  return (
    <div className="container container-narrow">
      <h1>Contact &amp; Support</h1>
      <p>We are here {c.supportHours}, and we aim to reply within {c.responseTime}. Choose whichever is easiest for you.</p>
      <div className="support-contacts">
        <a className="card card-pad support-contact" href={`mailto:${c.supportEmail}`}><strong>Email</strong><span>{c.supportEmail}</span><small>Best for account, privacy and deletion requests</small></a>
        <a className="card card-pad support-contact" href={`https://wa.me/${c.supportWhatsApp}`} target="_blank" rel="noopener noreferrer"><strong>WhatsApp</strong><span>{c.supportDisplay}</span><small>Quick help with orders and bookings</small></a>
      </div>
      <p style={{ color: 'var(--muted)' }}>Problem with an order, a store or a listing? Use the form below — an admin reviews every report and you get a reference code to track it. Complaint details may be shared with the vendor involved. Never send passwords, PINs, MFA codes or unnecessary documents.</p>
      <p><Link to="/faq">FAQ</Link> · <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy Policy</Link> · <Link to="/cookies">Cookie Policy</Link> · <Link to="/delete-account">Account deletion</Link></p>

      <div className="card card-pad">
        {ref ? (
          <Alert kind="success">
            <strong>Complaint submitted.</strong> Your reference is <code>{ref}</code>. Save it to track progress below.
          </Alert>
        ) : null}
        <form onSubmit={submit}>
          <Alert kind="error">{err}</Alert>
          {!user && (
            <div className="form-row">
              <Field label="Your name"><input value={f.reporter_name} onChange={(e) => setF({ ...f, reporter_name: e.target.value })} /></Field>
              <Field label="Your phone *" hint="So we can reach you"><input required value={f.reporter_phone} onChange={(e) => setF({ ...f, reporter_phone: e.target.value })} /></Field>
            </div>
          )}
          <Field label="Subject *"><input required maxLength={160} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="Wrong quantity delivered" /></Field>
          <Field label="Order code (if applicable)"><input value={f.order_code} onChange={(e) => setF({ ...f, order_code: e.target.value })} placeholder="ORD-XXXXXX" /></Field>
          <Field label="What happened? *" hint="Minimum 10 characters">
            <textarea required minLength={10} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} style={{ minHeight: 130 }} />
          </Field>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Submitting…' : 'Submit complaint'}</button>
        </form>
      </div>

      <div className="card card-pad mt-3" id="track">
        <h3>Track a complaint</h3>
        <form className="row" onSubmit={doTrack}>
          <input className="grow" placeholder="CMP-XXXXXX" value={track} onChange={(e) => setTrack(e.target.value)} />
<input aria-label="Full complaint phone number" placeholder="Full phone number used when reporting" value={trackPhone} onChange={e=>setTrackPhone(e.target.value)} />
          <button className="btn btn-outline">Track</button>
        </form>
        {trackErr && <Alert kind="error">{trackErr}</Alert>}
        {tracked && (
          <div className="mt-2">
            <div className="row-between"><strong>{tracked.subject}</strong><StatusBadge status={tracked.status} /></div>
            <p style={{ fontSize: '.85rem', color: 'var(--muted)', margin: '6px 0' }}>Filed {dateTime(tracked.created_at)}</p>

          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/** Buyer's confirmation step for a delivered order: confirm receipt, or report a problem. */
function VerifyOrderCard({ order, code, phone, onChanged }: { order: Order; code: string; phone: string; onChanged: () => void }) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const due = order.verify_by ? dateTime(order.verify_by) : null;

  if (order.disputed_at) {
    return (
      <div className="card card-pad mt-3">
        <strong>Problem reported</strong>
        {order.dispute_reason && <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>“{order.dispute_reason}”</p>}
        <Alert kind="warn">Our team is reviewing this order. Payment stays on hold until the review is complete.</Alert>
      </div>
    );
  }

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setErr('');
    try { await action(); onChanged(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  };

  const confirm = () => run(() => api.post('/orders/track/confirm', { code, phone }));
  const report = () => {
    if (reason.trim().length < 5) { setErr('Please describe the problem (at least 5 characters).'); return; }
    return run(() => api.post('/orders/track/report', { code, phone, reason: reason.trim() }));
  };

  return (
    <div className="card card-pad mt-3">
      <strong>Did your order arrive?</strong>
      <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>
        {due ? `It completes automatically on ${due} unless you report a problem.` : 'It completes automatically unless you report a problem.'}
      </p>
      <Alert kind="error">{err}</Alert>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={busy} onClick={() => void confirm()}>Yes, I received it</button>
        {!reporting && <button className="btn btn-outline" disabled={busy} onClick={() => setReporting(true)}>Report a problem</button>}
      </div>
      {reporting && (
        <div className="mt-2">
          <Field label="What went wrong?">
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Missing items, not delivered" />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setReporting(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => void report()}>Send report</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TrackOrder() {
  const [f, setF] = useState({ code: '', phone: '' });
  const [order, setOrder] = useState<Order | null>(null);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setOrder(null);
    try { setOrder((await api.get<{ order: Order }>(`/orders/track?code=${encodeURIComponent(f.code)}&phone=${encodeURIComponent(f.phone)}`)).order); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Not found'); }
  };

  const steps = ['pending', 'confirmed', 'dispatched', 'delivered'];

  // Buyers can cancel until a rider has accepted the order (server enforces the same rule).
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState('');
  const canCancel = !!order && ['pending', 'confirmed'].includes(order.status) && !order.driver;
  const cancelOrder = async () => {
    if (!order || !confirm('Cancel this order? The store will be told.')) return;
    setCancelBusy(true); setCancelErr('');
    try {
      await api.post('/orders/track/cancel', { code: f.code, phone: f.phone });
      await refresh();
    } catch (e) { setCancelErr(e instanceof ApiError ? e.message : 'Could not cancel this order'); }
    finally { setCancelBusy(false); }
  };

  // Re-read the order after confirm or report so the page reflects the new state.
  const refresh = async () => {
    try {
      setOrder((await api.get<{ order: Order }>(`/orders/track?code=${encodeURIComponent(f.code)}&phone=${encodeURIComponent(f.phone)}`)).order);
    } catch {
      // Keep the current view if the refresh fails.
    }
  };

  return (
    <div className="container container-narrow">
      <h1>Track your order</h1>
      <p style={{ color: 'var(--muted)' }}>No account needed — just your order code and the phone number you gave at checkout.</p>
      <div className="card card-pad">
        <form onSubmit={submit}>
          <Alert kind="error">{err}</Alert>
          <div className="form-row">
            <Field label="Order code"><input required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="ORD-XXXXXX" /></Field>
            <Field label="Phone number"><input required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          </div>
          <button className="btn btn-primary btn-block">Track order</button>
        </form>
      </div>

      {order && (
        <div className="card card-pad mt-3">
          <div className="row-between mb-2">
            <div><span className="td-mono" style={{ fontWeight: 800 }}>{order.code}</span><div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{order.business_name}</div></div>
            <StatusBadge status={order.status} />
          </div>
          {order.status === 'delivered_pending_verification' && (
            <VerifyOrderCard order={order} code={f.code} phone={f.phone} onChanged={refresh} />
          )}
          {order.status !== 'cancelled' && (
            <div className="stepper">
              {steps.map((s, i) => {
                const cur = orderProgressStep(order.status);
                return <div key={s} className={`step ${i < cur ? 'done' : i === cur ? 'active' : ''}`} style={{ textTransform: 'capitalize' }}>{s}</div>;
              })}
            </div>
          )}
          {order.driver && order.driver.phone && (
            <div className="card card-pad mt-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 700 }}>YOUR RIDER</div>
                <div style={{ fontWeight: 800 }}>{order.driver.name}</div>
                <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{[order.driver.vehicle_type, order.driver.license_plate].filter(Boolean).join(' · ')}</div>
              </div>
              <a className="btn btn-primary" href={`tel:${order.driver.phone}`}>Contact driver</a>
            </div>
          )}
          <table className="tbl">
            <tbody>
              {order.items?.map((it, i) => (
                <tr key={i}><td>{it.title} ×{it.qty}</td><td style={{ textAlign: 'right' }}>{money(it.line_total, order.currency)}</td></tr>
              ))}
              <tr><td className="td-strong">Total</td><td className="td-strong" style={{ textAlign: 'right' }}>{money(order.total, order.currency)}</td></tr>
            </tbody>
          </table>
          <dl className="kv mt-2">
            <dt>Placed</dt><dd>{dateTime(order.created_at)}</dd>
            <dt>Payment</dt><dd>{String(order.payment_method) === 'cash_on_delivery' ? 'Cash on delivery' : String(order.payment_method).replace(/_/g, ' ')} · {order.payment_status === 'paid' ? 'Paid' : (order.status === 'cancelled' ? 'Not charged' : 'Unpaid, pay the rider in cash on delivery')}</dd>
            <dt>Deliver to</dt><dd>{order.delivery_address}, {order.city}</dd>
          </dl>
          {canCancel && (
            <div className="mt-2">
              <Alert kind="error">{cancelErr}</Alert>
              <button className="btn btn-outline btn-sm" disabled={cancelBusy} onClick={() => void cancelOrder()}>
                {cancelBusy ? 'Cancelling…' : 'Cancel order'}
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a
              className="btn btn-primary btn-sm"
              href={`${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api/billing/receipt?code=${encodeURIComponent(f.code)}&phone=${encodeURIComponent(f.phone)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download receipt
            </a>
            <Link to={`/support?`} className="btn btn-outline btn-sm">Problem with this order?</Link>
          </div>
        </div>
      )}
      <TrackBooking />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
export function NotFound() {
  return (
    <div className="container container-narrow center" style={{ padding: '60px 20px' }}>
      <div style={{ fontSize: '3.5rem' }}>🧭</div>
      <h1>Page not found</h1>
      <p style={{ color: 'var(--muted)' }}>That page doesn't exist or has moved.</p>
      <Link to="/" className="btn btn-primary">Back home</Link>
    </div>
  );
}
