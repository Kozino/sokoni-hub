import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useCart } from '../state/CartContext';
import { useAuth } from '../state/AuthContext';
import { money } from '../lib/format';
import { Alert, Field } from '../components/ui';
import type { Order, PaymentMethod, FulfilmentMode, CartQuote } from '../types';

export default function Checkout() {
  const { items, byVendor, subtotal, currency, clear } = useCart();
  const { user } = useAuth();
  const [mode, setMode] = useState<FulfilmentMode>('delivery');
  const [form, setForm] = useState({
    contact_name: user?.full_name || '', contact_phone: user?.phone || '',
    delivery_address: '', city: '', country: '', note: '',
    payment_method: 'cash_on_delivery' as PaymentMethod,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Order[] | null>(null);

  /* The order summary is priced by the server, never in the browser. Whatever
     is shown here is the same number the checkout endpoint will charge, because
     both come from the same calculation. */
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState('');

  useEffect(() => {
    if (items.length === 0) { setQuote(null); return; }
    let cancelled = false;
    setQuoting(true);
    setQuoteErr('');
    api
      .post<CartQuote>('/orders/quote', {
        items: items.map((i) => ({ listing_id: i.listing_id, qty: i.qty })),
        fulfilment_mode: mode,
      })
      .then((q) => { if (!cancelled) setQuote(q); })
      .catch((e) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteErr(e instanceof ApiError ? e.message : 'Could not price this order.');
      })
      .finally(() => { if (!cancelled) setQuoting(false); });
    return () => { cancelled = true; };
  }, [items, mode]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<any>) => setForm({ ...form, [k]: e.target.value });

  if (items.length === 0 && !done) return <Navigate to="/cart" replace />;

  // Any vendor actually delivering this cart? Drives whether we need an address.
  const needsAddress = !quote ? mode === 'delivery' : quote.vendors.some((v) => v.mode === 'delivery');
  const anyVendorDelivers = !quote || quote.vendors.some((v) => v.offers_delivery);
  const anyVendorPickup = !quote || quote.vendors.some((v) => v.offers_pickup);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await api.post<{ orders: Order[] }>('/orders/checkout', {
        items: items.map((i) => ({ listing_id: i.listing_id, qty: i.qty })),
        fulfilment_mode: mode,
        ...form,
        // For collection the address field is hidden; send a clear placeholder
        // rather than an empty string so the vendor's record still reads well.
        delivery_address: needsAddress ? form.delivery_address : 'Collection from store',
      });
      setDone(r.orders);
      clear();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Checkout failed');
    } finally { setBusy(false); }
  };

  if (done)
    return (
      <div className="container container-narrow">
        <div className="card card-pad center">
          <div style={{ fontSize: '3rem' }}>✅</div>
          <h1>Order placed!</h1>
          <p>Keep your order code — you can track it any time without an account.</p>
          <div className="col mt-2">
            {done.map((o) => (
              <div key={o.id} className="card card-pad" style={{ textAlign: 'left' }}>
                <div className="row-between">
                  <div>
                    <div style={{ fontSize: '.78rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800 }}>Order code</div>
                    <strong className="td-mono" style={{ fontSize: '1.1rem' }}>{o.code}</strong>
                  </div>
                  <strong style={{ color: 'var(--terra-dark)' }}>{money(o.total, o.currency)}</strong>
                </div>
                <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginTop: 6 }}>
                  {o.vendor?.business_name} · {o.items?.length} item(s)
                  {o.fulfilment_mode === 'pickup' ? ' · Collection' : ''}
                </div>
                {Number(o.delivery_fee) > 0 && (
                  <div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
                    Includes {money(o.delivery_fee, o.currency)} delivery
                  </div>
                )}
                {o.whatsapp_url && (
                  <a className="btn btn-wa btn-block mt-2" href={o.whatsapp_url} target="_blank" rel="noreferrer">
                    Send order details to vendor on WhatsApp
                  </a>
                )}
              </div>
            ))}
          </div>
          <div className="row mt-3" style={{ justifyContent: 'center' }}>
            <Link to="/track" className="btn btn-outline">Track order</Link>
            <Link to="/browse" className="btn btn-primary">Continue shopping</Link>
          </div>
        </div>
      </div>
    );

  return (
    <div className="container">
      <h1>Checkout</h1>
      <div className="grid checkout-grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
        <form className="card card-pad" onSubmit={submit}>
          <Alert kind="error">{err}</Alert>

          <h3>How would you like to receive this?</h3>
          <div className="col" style={{ gap: 10, marginBottom: 18 }}>
            {([
              ['delivery', '🛵 Delivery', 'The vendor delivers to your address. Fee is set by each vendor.', anyVendorDelivers],
              ['pickup', '🏬 Collection', 'Collect from the vendor yourself. Always free.', anyVendorPickup],
            ] as const).map(([v, label, desc, enabled]) => (
              <label
                key={v}
                className="checkbox card card-pad"
                style={{
                  marginBottom: 0,
                  opacity: enabled ? 1 : 0.5,
                  cursor: enabled ? 'pointer' : 'not-allowed',
                  borderColor: mode === v ? 'var(--terra)' : undefined,
                }}
              >
                <input
                  type="radio" name="fulfilment" checked={mode === v} disabled={!enabled}
                  onChange={() => setMode(v as FulfilmentMode)}
                />
                <span>
                  <strong style={{ color: 'var(--ink)' }}>{label}</strong><br />
                  <span style={{ color: 'var(--muted)', fontSize: '.83rem' }}>
                    {enabled ? desc : 'Not offered for the items in your cart.'}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <h3>{needsAddress ? 'Delivery details' : 'Your details'}</h3>
          <div className="form-row">
            <Field label="Full name *"><input required value={form.contact_name} onChange={set('contact_name')} placeholder="Amina Bello" /></Field>
            <Field label="Phone number *" hint="The vendor will call this number"><input required value={form.contact_phone} onChange={set('contact_phone')} placeholder="+974 5512 8890" /></Field>
          </div>

          {needsAddress && (
            <>
              <Field label="Delivery address *">
                <textarea required value={form.delivery_address} onChange={set('delivery_address')} placeholder="Building number, street, zone, landmark…" style={{ minHeight: 80 }} />
              </Field>
              <div className="form-row">
                <Field label="City *"><input required value={form.city} onChange={set('city')} placeholder="Doha" /></Field>
                <Field label="Country *"><input required value={form.country} onChange={set('country')} placeholder="Qatar" /></Field>
              </div>
            </>
          )}
          {!needsAddress && (
            <div className="form-row">
              <Field label="City *"><input required value={form.city} onChange={set('city')} placeholder="Doha" /></Field>
              <Field label="Country *"><input required value={form.country} onChange={set('country')} placeholder="Qatar" /></Field>
            </div>
          )}

          <Field label="Note for the vendor (optional)">
            <textarea value={form.note} onChange={set('note')} placeholder="Call when you arrive, collect after 5pm…" style={{ minHeight: 64 }} />
          </Field>

          <h3 className="mt-3">Payment method</h3>
          {([
            ['cash_on_delivery', '💵 Cash on delivery', 'Pay the rider or vendor when your items arrive. Recommended.'],
            ['whatsapp', '💬 Arrange on WhatsApp', "We'll open a chat with the vendor with your order details prefilled."],
            ['bank_transfer', '🏦 Bank transfer', 'The vendor will send you their account details to confirm the order.'],
          ] as const).map(([v, label, desc]) => (
            <label key={v} className="checkbox card card-pad" style={{ marginBottom: 10, borderColor: form.payment_method === v ? 'var(--terra)' : undefined }}>
              <input type="radio" name="pm" checked={form.payment_method === v} onChange={() => setForm({ ...form, payment_method: v })} />
              <span><strong style={{ color: 'var(--ink)' }}>{label}</strong><br /><span style={{ color: 'var(--muted)', fontSize: '.83rem' }}>{desc}</span></span>
            </label>
          ))}

          <button className="btn btn-primary btn-lg btn-block mt-2" disabled={busy || quoting || !quote}>
            {busy ? 'Placing order…'
              : quoting ? 'Calculating total…'
              : quote ? `Place order · ${money(quote.total, quote.currency)}`
              : 'Place order'}
          </button>
        </form>

        <div className="card card-pad" style={{ position: 'sticky', top: 86 }}>
          <h3>Your order</h3>

          {quoteErr && <Alert kind="error">{quoteErr}</Alert>}

          {byVendor.map((g) => {
            const vq = quote?.vendors.find((v) => v.vendor_id === g.vendor_id);
            return (
              <div key={g.vendor_id} className="mb-2">
                <div style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>{g.vendor_name}</div>
                {g.items.map((i) => (
                  <div key={i.listing_id} className="row-between" style={{ fontSize: '.87rem', padding: '4px 0' }}>
                    <span>{i.title} ×{i.qty}</span><span>{money(i.price * i.qty, i.currency)}</span>
                  </div>
                ))}
                {vq && (
                  <div className="row-between" style={{ fontSize: '.83rem', padding: '4px 0', color: 'var(--muted)' }}>
                    <span>
                      {vq.mode === 'pickup' ? 'Collection' : 'Delivery'}
                      {vq.mode === 'delivery' && vq.delivery_fee === 0 && vq.free_delivery_over !== null ? ' (free)' : ''}
                    </span>
                    <span>{vq.delivery_fee > 0 ? money(vq.delivery_fee, vq.currency) : 'Free'}</span>
                  </div>
                )}
                {vq?.unavailable && (
                  <div style={{ fontSize: '.8rem', color: 'var(--muted)', padding: '2px 0' }}>{vq.unavailable}</div>
                )}
                {vq?.mode === 'delivery' && vq.delivery_fee > 0 && vq.free_delivery_over !== null && (
                  <div style={{ fontSize: '.8rem', color: 'var(--muted)', padding: '2px 0' }}>
                    Free delivery over {money(vq.free_delivery_over, vq.currency)}
                  </div>
                )}
                {vq?.mode === 'pickup' && vq.pickup_address && (
                  <div style={{ fontSize: '.8rem', color: 'var(--muted)', padding: '2px 0' }}>Collect from {vq.pickup_address}</div>
                )}
              </div>
            );
          })}

          <hr />
          <div className="row-between" style={{ fontSize: '.9rem', padding: '3px 0' }}>
            <span style={{ color: 'var(--muted)' }}>Subtotal</span>
            <span>{money(quote?.subtotal ?? subtotal, quote?.currency ?? currency)}</span>
          </div>
          <div className="row-between" style={{ fontSize: '.9rem', padding: '3px 0' }}>
            <span style={{ color: 'var(--muted)' }}>Delivery</span>
            <span>
              {quoting ? '…' : (quote?.delivery_fee ?? 0) > 0 ? money(quote!.delivery_fee, quote!.currency) : 'Free'}
            </span>
          </div>
          <hr />
          <div className="row-between" style={{ fontSize: '1.1rem' }}>
            <strong>Total</strong>
            <strong style={{ color: 'var(--terra-dark)' }}>
              {quoting && !quote ? '…' : money(quote?.total ?? subtotal, quote?.currency ?? currency)}
            </strong>
          </div>
          <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 8 }}>
            This is the exact amount the vendor will ask for. Delivery fees are set by each vendor.
          </p>
        </div>
      </div>
    </div>
  );
}
