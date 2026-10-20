import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useCart } from '../state/CartContext';
import { useAuth } from '../state/AuthContext';
import { money } from '../lib/format';
import { Alert, Field } from '../components/ui';
import { DeliveryPin, type PinValue } from '../components/DeliveryPin';
import { getAttribution, clearAttribution } from '../lib/attribution';
import { useT } from '../i18n';
import type { Order, PaymentMethod, FulfilmentMode, CartQuote } from '../types';

export default function Checkout() {
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});
  const { items, byVendor, subtotal, currency, clear } = useCart();
  const { user } = useAuth();
  const [mode, setMode] = useState<FulfilmentMode>('delivery');
  const [form, setForm] = useState({
    contact_name: user?.full_name || '', contact_phone: user?.phone || '', contact_email: user?.email || '',
    delivery_address: '', city: '', country: 'Qatar', note: '',
    payment_method: 'cash_on_delivery' as PaymentMethod,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Order[] | null>(null);
  // Where the rider should deliver. Required whenever a vendor delivers this cart.
  const [pin, setPin] = useState<PinValue | null>(null);
  const [pinErr, setPinErr] = useState('');

  /* The order summary is priced by the server, never in the browser. Whatever
     is shown here is the same number the checkout endpoint will charge, because
     both come from the same calculation. The chosen size/option is sent with
     every line so the server prices the variant, not the base listing. */
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState('');

  const lineItems = () =>
    items.map((i) => ({ listing_id: i.listing_id, qty: i.qty, option: i.option || undefined }));

  useEffect(() => {
    if (items.length === 0) { setQuote(null); return; }
    let cancelled = false;
    setQuoting(true);
    setQuoteErr('');
    api
      .post<CartQuote>('/orders/quote', {
        items: lineItems(),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, mode]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<any>) => {
    setForm({ ...form, [k]: e.target.value });
    if (fieldErrs[k]) setFieldErrs(({ [k]: _drop, ...rest }) => rest);
  };

  if (items.length === 0 && !done) return <Navigate to="/cart" replace />;

  // Any vendor actually delivering this cart? Drives whether we need an address.
  const needsAddress = !quote ? mode === 'delivery' : quote.vendors.some((v) => v.mode === 'delivery');
  const anyVendorDelivers = !quote || quote.vendors.some((v) => v.offers_delivery);
  const anyVendorPickup = !quote || quote.vendors.some((v) => v.offers_pickup);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const errs: Record<string, string> = {};
    if (form.contact_name.trim().length < 2) errs.contact_name = t('co.errName');
    const digits = form.contact_phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) errs.contact_phone = t('co.errPhone');
    if (form.contact_email.trim() && !/^\S+@\S+\.\S+$/.test(form.contact_email.trim())) errs.contact_email = t('co.errEmail');
    if (needsAddress && form.delivery_address.trim().length < 5) errs.delivery_address = t('co.errAddress');
    if (!form.city.trim()) errs.city = t('co.errCity');
    if (!form.country.trim()) errs.country = t('co.errCountry');
    setFieldErrs(errs);
    const bad = Object.keys(errs).length;
    if (bad) {
      setErr(t('co.fixFields', { count: bad }));
      // Jump to the first problem so it is not lost in a long form.
      const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      first?.focus({ preventScroll: true });
      return;
    }
    if (needsAddress && !pin) {
      setPinErr(t('co.pinRequired'));
      return;
    }
    setPinErr('');
    setBusy(true);
    try {
      const payload = {
        items: lineItems(),
        fulfilment_mode: mode,
        ...form,
        // For collection the address field is hidden; send a clear placeholder
        // rather than an empty string so the vendor's record still reads well.
        delivery_address: needsAddress ? form.delivery_address : 'Collection from store',
        // Which vendor's shared link/QR brought this buyer here, if any.
        // undefined when there's nothing stored — the server treats that as
        // an ordinary marketplace order.
        attribution: getAttribution(),
        // Coordinates are saved with the order so the rider can find the door.
        ...(needsAddress && pin ? { delivery_lat: pin.latitude, delivery_lng: pin.longitude } : {}),
      };
      const signature = JSON.stringify(payload);
      let saved: { signature: string; key: string } | null = null;
      try { saved = JSON.parse(sessionStorage.getItem('sokoni_checkout_retry') || 'null'); } catch { /* ignore */ }
      const key = saved?.signature === signature ? saved.key : crypto.randomUUID();
      sessionStorage.setItem('sokoni_checkout_retry', JSON.stringify({ signature, key }));
      const r = await api.post<{ orders: Order[] }>('/orders/checkout', { ...payload, request_id: key });
      sessionStorage.removeItem('sokoni_checkout_retry');
      setDone(r.orders);
      clear();
      clearAttribution();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('co.failed'));
    } finally { setBusy(false); }
  };

  if (done) {
    const codes = done.map((o) => o.code).join(', ');
    const trackUrl = `${window.location.origin}/track`;
    const msg = t('co.codesMsg', { codes, url: trackUrl });
    return (
      <div className="container container-narrow">
        <div className="card card-pad center">
          <div style={{ fontSize: '3rem' }} aria-hidden="true">✅</div>
          <h1>{t('co.placed')}</h1>
          <p>{t('co.keepCode')}</p>
          <div className="col mt-2">
            {done.map((o) => (
              <div key={o.id} className="card card-pad" style={{ textAlign: 'start' }}>
                <div className="row-between">
                  <div>
                    <div style={{ fontSize: '.78rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800 }}>{t('co.orderCode')}</div>
                    <strong className="td-mono" style={{ fontSize: '1.1rem' }}>{o.code}</strong>
                  </div>
                  <strong style={{ color: 'var(--terra-dark)' }}>{money(o.total, o.currency)}</strong>
                </div>
                <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginTop: 6 }}>
                  {o.vendor?.business_name} · {t('co.itemsCount', { count: o.items?.length ?? 0 })}
                  {o.fulfilment_mode === 'pickup' ? ` · ${t('co.pickup').replace(/^\S+\s/, '')}` : ''}
                </div>
                {Number(o.delivery_fee) > 0 && (
                  <div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
                    {t('co.includes', { fee: money(o.delivery_fee, o.currency) })}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="row mt-3" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <a className="btn btn-primary" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(msg)}`}>{t('co.sendWhatsApp')}</a>
            <a className="btn btn-outline" href={`mailto:${form.contact_email || ''}?subject=${encodeURIComponent('Sokoni Hub')}&body=${encodeURIComponent(msg)}`}>{t('co.sendEmail')}</a>
          </div>
          <div className="row mt-2" style={{ justifyContent: 'center' }}>
            <Link to="/track" className="btn btn-outline">{t('co.track')}</Link>
            <Link to="/browse" className="btn btn-ghost">{t('co.continue')}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>{t('co.title')}</h1>
      <div className="checkout-layout">
        <form ref={formRef} className="card card-pad" onSubmit={submit} noValidate>
          <p className="muted">{t('co.privacy')} <a href="/privacy" target="_blank" rel="noopener noreferrer">{t('co.privacyLink')}</a>. {t('co.privacyWarn')}</p>
          <Alert kind="error">{err}</Alert>

          <h3>{t('co.receive')}</h3>
          <div className="col" style={{ gap: 10, marginBottom: 18 }}>
            {([
              ['delivery', t('co.delivery'), t('co.deliveryDesc'), anyVendorDelivers],
              ['pickup', t('co.pickup'), t('co.pickupDesc'), anyVendorPickup],
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
                    {enabled ? desc : t('co.notOffered')}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <h3>{needsAddress ? t('co.detailsDelivery') : t('co.detailsYou')}</h3>
          <div className="form-row">
            <Field label={t('co.name')} error={fieldErrs.contact_name}><input required autoComplete="name" value={form.contact_name} onChange={set('contact_name')} placeholder="Amina Bello" /></Field>
            <Field label={t('co.phone')} hint={t('co.phoneHint')} error={fieldErrs.contact_phone}><input required type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={form.contact_phone} onChange={set('contact_phone')} placeholder="+974 5512 8890" /></Field>
          </div>
          <Field label={t('co.email')} hint={t('co.emailHint')} error={fieldErrs.contact_email}>
            <input type="email" inputMode="email" autoComplete="email" dir="ltr" value={form.contact_email} onChange={set('contact_email')} placeholder="you@example.com" />
          </Field>

          {needsAddress && (
            <Field label={t('co.address')} error={fieldErrs.delivery_address}>
              <textarea required autoComplete="street-address" value={form.delivery_address} onChange={set('delivery_address')} placeholder={t('co.addressPh')} style={{ minHeight: 80 }} />
            </Field>
          )}
          <div className="form-row">
            <Field label={t('co.city')} error={fieldErrs.city}><input required autoComplete="address-level2" value={form.city} onChange={set('city')} placeholder="Doha" /></Field>
            <Field label={t('co.country')} error={fieldErrs.country}><input required autoComplete="country-name" value={form.country} onChange={set('country')} placeholder="Qatar" /></Field>
          </div>

          {needsAddress && (
            <div className="mt-2">
              <strong>{t('co.pinTitle')}</strong>
              <p className="muted" style={{ fontSize: '.85rem', margin: '4px 0 10px' }}>
                {t('co.pinHelp')}
              </p>
              <DeliveryPin value={pin} onChange={(p) => { setPin(p); setPinErr(''); }} error={pinErr} />
            </div>
          )}

          <Field label={t('co.note')}>
            <textarea value={form.note} onChange={set('note')} placeholder={t('co.notePh')} style={{ minHeight: 64 }} />
          </Field>

          <h3 className="mt-3">{t('co.payment')}</h3>
          {([
            ['cash_on_delivery', '💵 ' + t('cart.codNote').split(' · ')[0], t('co.codDesc')],
          ] as const).map(([v, label, desc]) => (
            <label key={v} className="checkbox card card-pad" style={{ marginBottom: 10, borderColor: form.payment_method === v ? 'var(--terra)' : undefined }}>
              <input type="radio" name="pm" checked={form.payment_method === v} onChange={() => setForm({ ...form, payment_method: v })} />
              <span><strong style={{ color: 'var(--ink)' }}>{label}</strong><br /><span style={{ color: 'var(--muted)', fontSize: '.83rem' }}>{desc}</span></span>
            </label>
          ))}

          <button className="btn btn-primary btn-lg btn-block mt-2" disabled={busy || quoting || !quote}>
            {busy ? t('co.placing')
              : quoting ? t('co.calculating')
              : quote ? t('co.placeWith', { total: money(quote.total, quote.currency) })
              : t('co.place')}
          </button>
        </form>

        <div className="card card-pad checkout-summary">
          <h3>{t('co.yourOrder')}</h3>

          {quoteErr && <Alert kind="error">{quoteErr}</Alert>}

          {byVendor.map((g) => {
            const vq = quote?.vendors.find((v) => v.vendor_id === g.vendor_id);
            return (
              <div key={g.vendor_id} className="mb-2">
                <div style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>{g.vendor_name}</div>
                {g.items.map((i) => (
                  <div key={`${i.listing_id}::${i.option || ''}`} className="co-line" style={{ fontSize: '.87rem', padding: '4px 0' }}>
                    <span>
                      {i.title}{i.option ? ` (${i.option})` : ''} ×{i.qty}
                    </span>
                    <span>{money(i.price * i.qty, i.currency)}</span>
                  </div>
                ))}
                {vq && (
                  <div className="row-between" style={{ fontSize: '.83rem', padding: '4px 0', color: 'var(--muted)' }}>
                    <span>
                      {vq.mode === 'pickup' ? t('co.collectionRow') : t('co.deliveryRow')}
                      {vq.mode === 'delivery' && vq.delivery_fee === 0 && vq.free_delivery_over !== null ? ' (free)' : ''}
                    </span>
                    <span>{vq.delivery_fee > 0 ? money(vq.delivery_fee, vq.currency) : t('co.free')}</span>
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
            <span style={{ color: 'var(--muted)' }}>{t('co.subtotal')}</span>
            <span>{money(quote?.subtotal ?? subtotal, quote?.currency ?? currency)}</span>
          </div>
          <div className="row-between" style={{ fontSize: '.9rem', padding: '3px 0' }}>
            <span style={{ color: 'var(--muted)' }}>{t('co.deliveryRow')}</span>
            <span>
              {quoting ? '…' : (quote?.delivery_fee ?? 0) > 0 ? money(quote!.delivery_fee, quote!.currency) : t('co.free')}
            </span>
          </div>
          <hr />
          <div className="row-between" style={{ fontSize: '1.1rem' }}>
            <strong>{t('co.total')}</strong>
            <strong style={{ color: 'var(--terra-dark)' }}>
              {quoting && !quote ? '…' : money(quote?.total ?? subtotal, quote?.currency ?? currency)}
            </strong>
          </div>
          <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 8 }}>
            {t('co.exactNote')}
          </p>
        </div>
      </div>
    </div>
  );
}
