import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Spinner } from '../../components/ui';
import { useToast } from '../../state/ToastContext';

type DeliveryAdmin = {
  delivery_fee: number;
  delivery_radius_km: number | null;
  free_delivery_over: number | null;
};

/**
 * Sokoni Hub handles delivery. One fee and radius for every store.
 * Vendors can still turn collection / Sokoni delivery on or off, but they cannot price it.
 */
export function AdminDelivery() {
  const toast = useToast();
  const [row, setRow] = useState<DeliveryAdmin | null>(null);
  const [fee, setFee] = useState('0');
  const [radius, setRadius] = useState('');
  const [freeOver, setFreeOver] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = (d: DeliveryAdmin) => {
    setRow(d);
    setFee(String(d.delivery_fee ?? 0));
    setRadius(d.delivery_radius_km == null ? '' : String(d.delivery_radius_km));
    setFreeOver(d.free_delivery_over == null ? '' : String(d.free_delivery_over));
  };

  useEffect(() => {
    api.get<DeliveryAdmin>('/admin/delivery')
      .then(apply)
      .catch((e) => toast.push(e instanceof ApiError ? e.message : 'Could not load delivery settings', 'error'));
  }, []);

  if (!row) return <Spinner />;

  const save = async () => {
    const nFee = Number(fee);
    if (!Number.isFinite(nFee) || nFee < 0) {
      toast.push('Delivery fee must be 0 or more', 'error');
      return;
    }
    const nRadius = radius.trim() === '' ? null : Number(radius);
    if (nRadius !== null && (!Number.isFinite(nRadius) || nRadius <= 0)) {
      toast.push('Radius must be a positive number of km, or empty for no limit', 'error');
      return;
    }
    const nFree = freeOver.trim() === '' ? null : Number(freeOver);
    if (nFree !== null && (!Number.isFinite(nFree) || nFree < 0)) {
      toast.push('Free-delivery threshold must be 0 or more, or empty', 'error');
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const saved = await api.put<DeliveryAdmin>('/admin/delivery', {
        delivery_fee: nFee,
        delivery_radius_km: nRadius,
        free_delivery_over: nFree,
      });
      apply(saved);
      toast.push('Delivery settings saved. Every store uses this fee and radius.', 'success');
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 style={{ margin: 0 }}>Delivery</h1>
      <p style={{ color: 'var(--muted)', margin: '4px 0 16px', maxWidth: 720 }}>
        Sokoni Hub handles delivery. Set the fee and radius here. Vendors no longer price delivery.
        Buyers see this amount at checkout. Riders are paid from the delivery fee.
      </p>

      <div className="card card-pad" style={{ maxWidth: 560 }}>
        <label>
          Delivery fee (QAR per store order)
          <input type="number" min="0" step="0.5" value={fee} onChange={(e) => setFee(e.target.value)} />
        </label>
        <p style={{ color: 'var(--muted)', fontSize: '.82rem', marginTop: 4 }}>0 means free delivery. Charged once per shop, not per item.</p>

        <label style={{ marginTop: 16, display: 'block' }}>
          Delivery radius (km)
          <input type="number" min="1" step="1" value={radius} onChange={(e) => setRadius(e.target.value)} placeholder="Leave empty for no limit" />
        </label>
        <p style={{ color: 'var(--muted)', fontSize: '.82rem', marginTop: 4 }}>
          Checkout refuses a pin farther than this from the store. Empty = no distance limit.
        </p>

        <label style={{ marginTop: 16, display: 'block' }}>
          Free delivery over (QAR)
          <input type="number" min="0" step="1" value={freeOver} onChange={(e) => setFreeOver(e.target.value)} placeholder="Leave empty for none" />
        </label>
        <p style={{ color: 'var(--muted)', fontSize: '.82rem', marginTop: 4 }}>
          Optional. If the goods in that shop reach this amount, the delivery fee is waived.
        </p>

        <button type="button" className="btn btn-primary mt-2" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save delivery settings'}
        </button>
      </div>
    </div>
  );
}
