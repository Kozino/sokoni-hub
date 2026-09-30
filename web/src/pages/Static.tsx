import {qWhen} from '../lib/booking';
import SessionManager from '../components/SessionManager';
import { TrackBooking } from '../components/TrackBooking';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError, setToken } from '../lib/api';
import { Alert, Field, StatusBadge } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { money, dateTime } from '../lib/format';
import type { Order } from '../types';

/* ------------------------------------------------------------------ */
export function Sell() {
  const { user, vendor } = useAuth();
  const dest = !user ? '/register?role=vendor' : vendor ? '/vendor' : '/vendor/onboard';
  return (
    <div className="container">
      <div className="card card-pad center" style={{ background: 'var(--green)', color: '#fff', borderColor: 'transparent' }}>
        <h1 style={{ color: '#fff' }}>Turn your WhatsApp hustle into a real storefront</h1>
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
            <strong>Cosmetics</strong> (creams, lipsticks, skin/whitening products) and
            <strong> medicine, drugs or pharmaceutical products</strong> of any kind are strictly prohibited.
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
          ['💬', 'WhatsApp built in', 'Every listing has a one-tap WhatsApp button with the order details prefilled.'],
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
          <p style={{ margin: 0 }}><strong>1. Cosmetics</strong> — creams, lotions, lipsticks, foundations, skin-lightening or bleaching products, and similar items.</p>
          <p style={{ margin: '8px 0 0' }}><strong>2. Medicine &amp; drugs</strong> — tablets, capsules, syrups, antibiotics, injections, supplements sold as medicine, and any pharmaceutical product.</p>
        </div>
        <p>These restrictions exist because safe distribution of such products requires regulatory licensing that this platform does not verify. Listings are screened automatically at upload and reviewed manually by admins.</p>

        <h3 className="mt-3">Vendor verification</h3>
        <p>Every vendor account is reviewed by an administrator before any listing can be published. We check the business name, city, WhatsApp number and an uploaded CR or business-registration licence. Verification can be revoked if a vendor breaks the rules.</p>

        <h3 className="mt-3">Payments</h3>
        <p>Sokoni Hub does not currently hold or process funds. Buyers pay <strong>cash on delivery</strong>, arrange payment over <strong>WhatsApp</strong>, or use <strong>bank transfer</strong> directly with the vendor. Always inspect goods before paying.</p>

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
      <p>Contact us on <a href="https://wa.me/97466046431" target="_blank" rel="noopener noreferrer">WhatsApp +974 6604 6431</a>, or use the existing report form below. For privacy or account-access concerns, WhatsApp is the private contact channel; complaint details may be shared with the relevant vendor. Do not include passwords, PINs, MFA codes or unnecessary documents.</p>
      <p><Link to="/privacy">Draft Privacy Policy</Link> · <Link to="/faq">FAQ</Link> · <Link to="/delete-account">Account deletion</Link></p>
      <p style={{ color: 'var(--muted)' }}>Problem with an order, a store or a listing? Tell us — an admin reviews every report.</p>

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
          {order.status !== 'cancelled' && (
            <div className="stepper">
              {steps.map((s, i) => {
                const cur = steps.indexOf(order.status);
                return <div key={s} className={`step ${i < cur ? 'done' : i === cur ? 'active' : ''}`} style={{ textTransform: 'capitalize' }}>{s}</div>;
              })}
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
            <dt>Payment</dt><dd style={{ textTransform: 'capitalize' }}>{order.payment_method.replace(/_/g, ' ')}</dd>
            <dt>Deliver to</dt><dd>{order.delivery_address}, {order.city}</dd>
          </dl>
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
export function Account() {
  const { user, refresh } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [msg, setMsg] = useState('');
  const [bookings,setBookings]=useState<any[]>([]);
  const [historyError,setHistoryError]=useState('');
  useEffect(()=>{api.get<{bookings:any[]}>('/bookings/mine').then(r=>setBookings(r.bookings)).catch(e=>setHistoryError(e.message));},[]);
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [name, setName] = useState(user?.full_name || '');

  useEffect(() => { api.get<{ orders: Order[] }>('/orders/mine').then((r) => setOrders(r.orders)).catch(() => {}); }, []);

  return (
    <div className="container container-narrow">
      <h1>My account</h1>
      <SessionManager />
      <section className="card card-pad mt-3"><h3>My bookings</h3><p>Bookings made while signed in appear here. Guest bookings remain accessible through <Link to="/track">Track booking</Link>.</p>
      {historyError&&<p role="alert">{historyError}</p>}
      {!historyError&&!bookings.length&&<p>No signed-in bookings yet.</p>}
      {bookings.map(b=><div key={b.id} className="mb-2"><strong>{b.listing_title}</strong> — {b.business_name}<br/><code>{b.code}</code> <StatusBadge status={b.status}/><span> {b.slot_starts_at||b.scheduled_at?qWhen(b.slot_starts_at||b.scheduled_at)+' (Qatar time)':'Awaiting agreed time'}</span></div>)}
      </section>
      {msg && <Alert kind="success">{msg}</Alert>}

      <div className="card card-pad">
        <h3>Profile</h3>
        <form onSubmit={async (e) => { e.preventDefault(); await api.patch('/auth/me', { full_name: name }); await refresh(); setMsg('Profile updated'); }}>
          <Field label="Full name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Phone"><input value={user?.phone || ''} disabled /></Field>
          <button className="btn btn-outline">Save</button>
        </form>
      </div>

      <div className="card card-pad mt-3">
        <h3>Change password</h3>
        <form onSubmit={async (e) => {
          e.preventDefault();
          try { const r=await api.post<{token:string}>('/auth/change-password', pw); setToken(r.token); setMsg('Password changed'); setPw({ current_password: '', new_password: '' }); }
          catch (er) { setMsg(er instanceof ApiError ? er.message : 'Failed'); }
        }}>
          <div className="form-row">
            <Field label="Current password"><input type="password" required value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
            <Field label="New password"><input type="password" required minLength={12} maxLength={72} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
          </div>
          <button className="btn btn-outline">Update password</button>
        </form>
      </div>

      <div className="card mt-3">
        <div className="card-head"><h3>My orders</h3></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Code</th><th>Store</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {orders.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>No orders yet</td></tr>}
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="td-mono">{o.code}</td>
                  <td>{o.business_name}</td>
                  <td className="td-strong">{money(o.total, o.currency)}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>{dateTime(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

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
