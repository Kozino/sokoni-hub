import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useCart } from '../state/CartContext';
import { useAuth } from '../state/AuthContext';
import { money } from '../lib/format';
import { Alert, Field } from '../components/ui';
import type { Order, PaymentMethod } from '../types';

export default function Checkout() {
  const { items, byVendor, subtotal, currency, clear } = useCart();
  const { user } = useAuth();
  const [form, setForm] = useState({
    contact_name: user?.full_name || '', contact_phone: user?.phone || '',
    delivery_address: '', city: '', country: '', note: '',
    payment_method: 'cash_on_delivery' as PaymentMethod,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Order[] | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<any>) => setForm({ ...form, [k]: e.target.value });

  if (items.length === 0 && !done) return <Navigate to="/cart" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await api.post<{ orders: Order[] }>('/orders/checkout', {
        items: items.map((i) => ({ listing_id: i.listing_id, qty: i.qty })),
        ...form,
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
                </div>
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
      <div className="checkout-layout">
        <form className="card card-pad" onSubmit={submit}>
          <Alert kind="error">{err}</Alert>

          <h3>Delivery details</h3>
          <div className="form-row">
            <Field label="Full name *"><input required value={form.contact_name} onChange={set('contact_name')} placeholder="Amina Bello" /></Field>
            <Field label="Phone number *" hint="The vendor will call this number"><input required value={form.contact_phone} onChange={set('contact_phone')} placeholder="+234 801 234 5678" /></Field>
          </div>
          <Field label="Delivery address *">
            <textarea required value={form.delivery_address} onChange={set('delivery_address')} placeholder="House number, street, landmark…" style={{ minHeight: 80 }} />
          </Field>
          <div className="form-row">
            <Field label="City *"><input required value={form.city} onChange={set('city')} placeholder="Lagos" /></Field>
            <Field label="Country *"><input required value={form.country} onChange={set('country')} placeholder="Nigeria" /></Field>
          </div>
          <Field label="Note for the vendor (optional)">
            <textarea value={form.note} onChange={set('note')} placeholder="Deliver after 5pm, call when you arrive…" style={{ minHeight: 64 }} />
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

          <button className="btn btn-primary btn-lg btn-block mt-2" disabled={busy}>
            {busy ? 'Placing order…' : `Place order · ${money(subtotal, currency)}`}
          </button>
        </form>

        <div className="card card-pad checkout-summary">
          <h3>Your order</h3>
          {byVendor.map((g) => (
            <div key={g.vendor_id} className="mb-2">
              <div style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>{g.vendor_name}</div>
              {g.items.map((i) => (
                <div key={i.listing_id} className="row-between" style={{ fontSize: '.87rem', padding: '4px 0' }}>
                  <span>{i.title} ×{i.qty}</span><span>{money(i.price * i.qty, i.currency)}</span>
                </div>
              ))}
            </div>
          ))}
          <hr />
          <div className="row-between" style={{ fontSize: '1.1rem' }}>
            <strong>Total</strong><strong style={{ color: 'var(--terra-dark)' }}>{money(subtotal, currency)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
