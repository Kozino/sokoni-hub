import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Alert, Field, Spinner } from '../../components/ui';
import { useToast } from '../../state/ToastContext';
import type { DeliverySettings as DS } from '../../types';

/**
 * The vendor's own delivery policy. The platform never sets these numbers —
 * the vendor arranges and pays for delivery, so the vendor prices it.
 */
export default function DeliverySettings() {
  const { push } = useToast();
  const [f, setF] = useState<DS | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ delivery: DS }>('/vendors/me/delivery')
      .then((r) => setF(r.delivery))
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load delivery settings'));
  }, []);

  if (err && !f) return <Alert kind="error">{err}</Alert>;
  if (!f) return <Spinner />;

  const set = <K extends keyof DS>(k: K, v: DS[K]) => setF({ ...f, [k]: v });
  const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!f.offers_pickup && !f.offers_delivery) {
      setErr('Enable at least one of collection or delivery, otherwise buyers cannot order.');
      return;
    }
    setBusy(true);
    try {
      const r = await api.put<{ delivery: DS }>('/vendors/me/delivery', {
        offers_pickup: f.offers_pickup,
        offers_delivery: f.offers_delivery,
        delivery_fee: Number(f.delivery_fee) || 0,
        free_delivery_over: f.free_delivery_over === null ? null : Number(f.free_delivery_over),
        delivery_radius_km: f.delivery_radius_km === null ? null : Number(f.delivery_radius_km),
        pickup_address: f.pickup_address || null,
        delivery_notes: f.delivery_notes || null,
      });
      setF(r.delivery);
      push('Delivery settings saved', 'success');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card card-pad" onSubmit={submit} style={{ maxWidth: 780 }}>
      <h3 style={{ marginTop: 0 }}>Delivery &amp; collection</h3>
      <p style={{ color: 'var(--muted)', fontSize: '.86rem', marginTop: -4 }}>
        You arrange your own delivery, so you set the fee. Buyers see this exact amount at checkout.
      </p>

      <Alert kind="error">{err}</Alert>

      <label className="checkbox card card-pad" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={f.offers_pickup} onChange={(e) => set('offers_pickup', e.target.checked)} />
        <span>
          <strong style={{ color: 'var(--ink)' }}>🏬 Buyers can collect</strong><br />
          <span style={{ color: 'var(--muted)', fontSize: '.83rem' }}>No fee is charged for collection.</span>
        </span>
      </label>

      {f.offers_pickup && (
        <Field label="Collection address" hint="Shown to the buyer once they order">
          <input
            value={f.pickup_address || ''}
            onChange={(e) => set('pickup_address', e.target.value)}
            placeholder="Shop 4, Al Sadd, Doha"
          />
        </Field>
      )}

      <label className="checkbox card card-pad" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={f.offers_delivery} onChange={(e) => set('offers_delivery', e.target.checked)} />
        <span>
          <strong style={{ color: 'var(--ink)' }}>🛵 I deliver to buyers</strong><br />
          <span style={{ color: 'var(--muted)', fontSize: '.83rem' }}>You deliver yourself or book your own courier.</span>
        </span>
      </label>

      {f.offers_delivery && (
        <>
          <div className="form-row">
            <Field label="Delivery fee *" hint="Charged per order, on top of the items">
              <input
                type="number" min="0" step="0.5" required
                value={String(f.delivery_fee ?? '')}
                onChange={(e) => set('delivery_fee', e.target.value === '' ? 0 : Number(e.target.value))}
                placeholder="25"
              />
            </Field>
            <Field label="Free delivery over" hint="Leave blank for no free-delivery offer">
              <input
                type="number" min="0" step="1"
                value={f.free_delivery_over === null || f.free_delivery_over === undefined ? '' : String(f.free_delivery_over)}
                onChange={(e) => set('free_delivery_over', numOrNull(e.target.value))}
                placeholder="200"
              />
            </Field>
          </div>

          <Field label="Delivery radius (km)" hint="Roughly how far you'll travel. Optional — for your own reference.">
            <input
              type="number" min="1" step="1"
              value={f.delivery_radius_km === null || f.delivery_radius_km === undefined ? '' : String(f.delivery_radius_km)}
              onChange={(e) => set('delivery_radius_km', numOrNull(e.target.value))}
              placeholder="15"
            />
          </Field>

          <Field label="Delivery notes" hint="Shown to buyers, e.g. delivery days or cut-off times">
            <textarea
              value={f.delivery_notes || ''}
              onChange={(e) => set('delivery_notes', e.target.value)}
              placeholder="Deliveries Sunday to Thursday, orders before 4pm go same day."
              style={{ minHeight: 70 }}
            />
          </Field>
        </>
      )}

      {!f.offers_pickup && !f.offers_delivery && (
        <Alert kind="warn">Buyers cannot place an order until you enable collection or delivery.</Alert>
      )}

      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save delivery settings'}</button>
    </form>
  );
}
