import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { Alert, Field, Spinner } from '../../components/ui';
import ImageUploader from '../../components/ImageUploader';
import { useAuth } from '../../state/AuthContext';
import { useToast } from '../../state/ToastContext';
import type { Category, Listing, ListingKind } from '../../types';

const UNITS = ['kg', 'litre', 'piece', 'bag', 'pack', 'carton', 'bundle', 'crate', 'tuber', 'paint'];
const CURRENCIES = ['QAR', 'USD', 'NGN', 'GHS', 'KES', 'ZAR', 'XOF', 'XAF', 'UGX', 'TZS', 'RWF'];

export default function ListingForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const nav = useNavigate();
  const { vendor } = useAuth();
  const { push } = useToast();

  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(editing);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [existing, setExisting] = useState<Listing | null>(null);
  const [f, setF] = useState({
    kind: 'product' as ListingKind, category_id: '', title: '', description: '',
   price: '', currency: 'QAR', price_type: 'fixed',
    quantity: '', unit: 'kg', weight_kg: '', volume_l: '',
    duration_mins: '', service_area: '', status: 'active' as 'active' | 'draft' | 'paused',
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { api.get<{ categories: Category[] }>('/meta/categories').then((r) => setCats(r.categories)).catch(() => {}); }, []);

  useEffect(() => {
    if (!editing) return;
    api.get<{ listings: Listing[] }>('/listings/mine/all').then((r) => {
      const l = r.listings.find((x) => x.id === id);
      if (!l) { setErr('Listing not found'); return; }
      setExisting(l);
      setF({
        kind: l.kind, category_id: l.category_id, title: l.title, description: l.description || '',
        price: String(l.price), currency: l.currency, price_type: l.price_type,
        quantity: l.quantity != null ? String(l.quantity) : '', unit: l.unit || 'kg',
        weight_kg: l.weight_kg != null ? String(l.weight_kg) : '',
        volume_l: l.volume_l != null ? String(l.volume_l) : '',
        duration_mins: l.duration_mins != null ? String(l.duration_mins) : '',
        service_area: l.service_area || '',
        status: (l.status === 'removed' ? 'paused' : l.status === 'pending_review' || l.status === 'rejected' ? 'active' : l.status) as any,
      });
      setImages(Array.isArray(l.images) ? l.images : []);
    }).finally(() => setLoading(false));
  }, [id, editing]);

  const kindCats = cats.filter((c) => c.kind === f.kind);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const payload: any = {
      category_id: f.category_id, kind: f.kind, title: f.title,
      description: f.description || undefined, price: Number(f.price),
      currency: f.currency, price_type: f.price_type, images, status: f.status,
    };
    if (f.kind === 'product') {
      payload.quantity = Number(f.quantity || 0);
      payload.unit = f.unit;
      if (f.weight_kg) payload.weight_kg = Number(f.weight_kg);
      if (f.volume_l) payload.volume_l = Number(f.volume_l);
    } else {
      if (f.duration_mins) payload.duration_mins = Number(f.duration_mins);
      if (f.service_area) payload.service_area = f.service_area;
    }
    try {
      const r = editing
        ? await api.patch<{ listing: Listing }>(`/listings/${id}`, payload)
        : await api.post<{ listing: Listing }>('/listings', payload);
      push(
        r.listing.status === 'pending_review' ? 'Submitted for admin approval — you\u2019ll be notified once it\u2019s reviewed'
          : editing ? 'Listing updated'
          : 'Listing published',
        'success'
      );
      nav('/vendor/listings');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save listing');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally { setBusy(false); }
  };

  if (loading) return <Spinner />;

  const blocked = vendor && vendor.status !== 'verified';

  return (
    <>
      <div className="dash-title">
        <h1>{editing ? 'Edit listing' : 'Add a listing'}</h1>
        <p>Give buyers exactly what they need to decide: clear name, real price, honest quantity.</p>
      </div>

      {blocked && (
        <Alert kind="warn">
          Your store is <strong>{vendor!.status}</strong>. You can fill this form, but publishing is
          blocked until an admin verifies your store.
        </Alert>
      )}

      <form className="card card-pad" onSubmit={submit} style={{ maxWidth: 820 }}>
        <Alert kind="error">{err}</Alert>

        <Field label="What are you listing? *">
          <div className="grid grid-2" style={{ gap: 10 }}>
            {([['product', '🛍️ A product', 'Food stuff sold by kg, litre, bag…'], ['service', '💇 A service', 'Hair, nails, makeup, photo, video…']] as const).map(([v, t, d]) => (
              <label key={v} className="checkbox card card-pad" style={{ margin: 0, borderColor: f.kind === v ? 'var(--terra)' : undefined }}>
                <input type="radio" disabled={editing} checked={f.kind === v} onChange={() => setF({ ...f, kind: v, category_id: '' })} />
                <span><strong style={{ color: 'var(--ink)' }}>{t}</strong><br /><span style={{ color: 'var(--muted)', fontSize: '.8rem' }}>{d}</span></span>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Category *">
          <select required value={f.category_id} onChange={set('category_id')}>
            <option value="">Choose a category…</option>
            {kindCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        <Field label="Item name *" hint="e.g. “Premium long grain rice — 50kg bag” or “Knotless braids (medium)”">
          <input required maxLength={140} value={f.title} onChange={set('title')} />
        </Field>

        <Field label="Description" hint="Quality, origin, what's included, delivery notes…">
          <textarea value={f.description} onChange={set('description')} style={{ minHeight: 120 }} />
        </Field>

        <div className="form-row-3">
          <Field label="Price *"><input required type="number" step="0.01" min="0" value={f.price} onChange={set('price')} /></Field>
          <Field label="Currency">
            <select value={f.currency} onChange={set('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label="Price type">
            <select value={f.price_type} onChange={set('price_type')}>
              <option value="fixed">Fixed price</option>
              <option value="from">Starting from</option>
              {f.kind === 'service' && <option value="hourly">Per hour</option>}
              {f.kind === 'product' && <option value="per_kg">Per kg</option>}
            </select>
          </Field>
        </div>

        {f.kind === 'product' ? (
          <>
            <h3 className="mt-2">Stock &amp; measurement</h3>
            <div className="form-row-3">
              <Field label="Quantity available *" hint="Reduces automatically on each order">
                <input required type="number" min="0" value={f.quantity} onChange={set('quantity')} />
              </Field>
              <Field label="Sold per (unit) *">
                <select value={f.unit} onChange={set('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
              </Field>
              <Field label="Weight (kg)" hint="Optional"><input type="number" step="0.001" min="0" value={f.weight_kg} onChange={set('weight_kg')} /></Field>
            </div>
            <Field label="Volume (litres)" hint="For oils and liquids — optional">
              <input type="number" step="0.001" min="0" value={f.volume_l} onChange={set('volume_l')} style={{ maxWidth: 240 }} />
            </Field>
          </>
        ) : (
          <>
            <h3 className="mt-2">Service details</h3>
            <div className="form-row">
              <Field label="Session length (minutes)" hint="Optional"><input type="number" min="1" value={f.duration_mins} onChange={set('duration_mins')} /></Field>
              <Field label="Service area" hint="Where you work, or “I come to you”"><input value={f.service_area} onChange={set('service_area')} placeholder="Lekki, Ikoyi & Victoria Island" /></Field>
            </div>
          </>
        )}

        <Field label="Photos" hint="First image is the cover. Clear, well-lit photos sell faster.">
          <ImageUploader value={images} onChange={setImages} max={6} />
        </Field>

        <Field label="Visibility">
          <select value={f.status} onChange={set('status')}>
            <option value="active">Published — visible to buyers</option>
            <option value="draft">Draft — only you can see it</option>
            <option value="paused">Paused — hidden temporarily</option>
          </select>
        </Field>

        <div className="prohibited mb-2">
          <strong>Reminder:</strong> cosmetics and medicine/drugs are prohibited. Listings containing
          them are blocked automatically and may lead to suspension.
        </div>

        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={() => nav('/vendor/listings')}>Cancel</button>
          <button className="btn btn-primary grow" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Publish listing'}</button>
        </div>
      </form>
    </>
  );
}
