import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Alert, Field, Spinner } from '../../components/ui';
import { useToast } from '../../state/ToastContext';
import type { DeliverySettings as DS } from '../../types';

type Platform = { delivery_fee: number; delivery_radius_km: number | null; free_delivery_over: number | null };

/**
 * Vendor fulfilment flags only. Sokoni Hub sets the fee and radius.
 */
export default function DeliverySettings() {
  const { push } = useToast();
  const [f, setF] = useState<DS | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ delivery: DS; platform?: Platform }>('/vendors/me/delivery')
      .then((r) => {
        setF(r.delivery);
        setPlatform(r.platform ?? {
          delivery_fee: Number(r.delivery.delivery_fee) || 0,
          delivery_radius_km: r.delivery.delivery_radius_km == null ? null : Number(r.delivery.delivery_radius_km),
          free_delivery_over: r.delivery.free_delivery_over == null ? null : Number(r.delivery.free_delivery_over),
        });
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load delivery settings'));
  }, []);

  if (err && !f) return <Alert kind="error">{err}</Alert>;
  if (!f) return <Spinner />;

  const set = <K extends keyof DS>(k: K, v: DS[K]) => setF({ ...f, [k]: v });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!f.offers_pickup && !f.offers_delivery) {
      setErr('Enable at least one of collection or delivery, otherwise buyers cannot order.');
      return;
    }
    setBusy(true);
    try {
      const r = await api.put<{ delivery: DS; platform?: Platform }>('/vendors/me/delivery', {
        offers_pickup: f.offers_pickup,
        offers_delivery: f.offers_delivery,
        pickup_address: f.pickup_address || null,
        delivery_notes: f.delivery_notes || null,
      });
      setF(r.delivery);
      if (r.platform) setPlatform(r.platform);
      push('Delivery settings saved', 'success');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const fee = platform?.delivery_fee ?? (Number(f.delivery_fee) || 0);
  const radius = platform?.delivery_radius_km ?? (f.delivery_radius_km == null ? null : Number(f.delivery_radius_km));
  const freeOver = platform?.free_delivery_over ?? (f.free_delivery_over == null ? null : Number(f.free_delivery_over));

  return (
    <form className="card card-pad" onSubmit={submit} style={{ maxWidth: 780 }}>
      <h3 style={{ marginTop: 0 }}>Delivery &amp; collection</h3>
      <p style={{ color: 'var(--muted)', fontSize: '.86rem', marginTop: -4 }}>
        Sokoni Hub handles delivery. You choose whether buyers can collect and whether a Sokoni rider can deliver your orders.
        The fee and radius are set by admin.
      </p>

      <Alert kind="error">{err}</Alert>

      <div className="card card-pad" style={{ marginBottom: 12, background: 'var(--bg-soft, #f6f7f8)' }}>
        <div style={{ fontSize: '.76rem', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', fontWeight: 800 }}>Set by Sokoni Hub</div>
        <p style={{ margin: '8px 0 0' }}>
          Delivery fee: <strong>{fee > 0 ? `${fee} QAR` : 'Free'}</strong>
          {freeOver != null ? ` · free over ${freeOver} QAR` : ''}
        </p>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '.86rem' }}>
          Radius: {radius != null ? `${radius} km from your store pin` : 'No distance limit'}
        </p>
      </div>

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
          <strong style={{ color: 'var(--ink)' }}>🛵 Sokoni Hub can deliver my orders</strong><br />
          <span style={{ color: 'var(--muted)', fontSize: '.83rem' }}>A Sokoni rider collects from your pin and delivers to the buyer.</span>
        </span>
      </label>

      {f.offers_delivery && (
        <Field label="Notes for buyers" hint="Optional, e.g. packing cut-off. Delivery time is handled by Sokoni Hub.">
          <textarea
            value={f.delivery_notes || ''}
            onChange={(e) => set('delivery_notes', e.target.value)}
            placeholder="Orders packed before 4pm go out the same day."
            style={{ minHeight: 70 }}
          />
        </Field>
      )}

      {!f.offers_pickup && !f.offers_delivery && (
        <Alert kind="warn">Buyers cannot place an order until you enable collection or delivery.</Alert>
      )}

      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save delivery settings'}</button>
    </form>
  );
}
