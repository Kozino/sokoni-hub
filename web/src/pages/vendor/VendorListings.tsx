import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { money, num, date } from '../../lib/format';
import { Empty, Spinner, StatusBadge, Tabs, Modal, Alert } from '../../components/ui';
import { useToast } from '../../state/ToastContext';
import type { Listing } from '../../types';

export default function VendorListings() {
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'product' | 'service'>('all');
  const [q, setQ] = useState('');
  const [stockFor, setStockFor] = useState<Listing | null>(null);
  const [stockVal, setStockVal] = useState(0);
  const [err, setErr] = useState('');
  const { push } = useToast();

  const load = () => {
    setLoading(true);
    api.get<{ listings: Listing[] }>('/listings/mine/all')
      .then((r) => setItems(r.listings)).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggle = async (l: Listing) => {
    try {
      await api.patch(`/listings/${l.id}`, { status: l.status === 'active' ? 'paused' : 'active' });
      push(l.status === 'active' ? 'Listing paused' : 'Listing published', 'success');
      load();
    } catch (e) { push(e instanceof ApiError ? e.message : 'Failed', 'error'); }
  };

  const remove = async (l: Listing) => {
    if (!confirm(`Delete "${l.title}"? This cannot be undone.`)) return;
    try { await api.del(`/listings/${l.id}`); push('Listing deleted', 'success'); load(); }
    catch (e) { push(e instanceof ApiError ? e.message : 'Failed', 'error'); }
  };

  const saveStock = async () => {
    if (!stockFor) return;
    try {
      await api.patch(`/listings/${stockFor.id}/stock`, { quantity: stockVal });
      push('Stock updated', 'success'); setStockFor(null); load();
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); }
  };

  const filtered = items
    .filter((i) => tab === 'all' || i.kind === tab)
    .filter((i) => !q || i.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="dash-title row-between">
        <div><h1>Products &amp; services</h1><p>{items.length} listing{items.length === 1 ? '' : 's'} in your store</p></div>
        <Link to="/vendor/listings/new" className="btn btn-primary">➕ Add listing</Link>
      </div>

      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { id: 'all', label: 'All', count: items.length },
          { id: 'product', label: 'Products', count: items.filter((i) => i.kind === 'product').length },
          { id: 'service', label: 'Services', count: items.filter((i) => i.kind === 'service').length },
        ]}
      />

      <div className="filters">
        <input placeholder="Search your listings…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
      </div>

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <Empty icon="📦" title="No listings here" text="Add a product or service to start selling."
          action={<Link to="/vendor/listings/new" className="btn btn-primary">Add your first listing</Link>} />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Item</th><th>Category</th><th>Price</th><th>Stock / Unit</th><th>Weight / Vol.</th><th>Views</th><th>Status</th><th>Added</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const img = Array.isArray(l.images) ? l.images[0] : undefined;
                const low = l.kind === 'product' && (l.quantity ?? 0) <= 5;
                return (
                  <tr key={l.id}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        {img ? <img className="thumb" src={img} alt="" /> : <div className="thumb" style={{ display: 'grid', placeItems: 'center' }}>{l.kind === 'service' ? '💇' : '🛍️'}</div>}
                        <div>
                          <div className="td-strong">{l.title}</div>
                          <div style={{ fontSize: '.76rem', color: 'var(--muted)', textTransform: 'capitalize' }}>{l.kind}</div>
                        </div>
                      </div>
                    </td>
                    <td>{l.category_name}</td>
                    <td className="td-strong">{money(l.price, l.currency)}</td>
                    <td>
                      {l.kind === 'product' ? (
                        <span style={{ color: low ? 'var(--danger)' : undefined, fontWeight: low ? 700 : 400 }}>
                          {l.quantity ?? 0} {l.unit || 'units'}{low ? ' ⚠️' : ''}
                        </span>
                      ) : (l.duration_mins ? `${l.duration_mins} min` : '—')}
                    </td>
                    <td>{l.weight_kg ? `${Number(l.weight_kg)} kg` : l.volume_l ? `${Number(l.volume_l)} L` : '—'}</td>
                    <td>{num(l.views)}</td>
                    <td><StatusBadge status={l.status} /></td>
                    <td style={{ fontSize: '.8rem' }}>{date(l.created_at)}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        {l.kind === 'product' && (
                          <button className="btn btn-ghost btn-sm" title="Update stock"
                            onClick={() => { setStockFor(l); setStockVal(l.quantity ?? 0); setErr(''); }}>📊</button>
                        )}
                        <Link to={`/vendor/listings/${l.id}/edit`} className="btn btn-ghost btn-sm" title="Edit">✏️</Link>
                        <button className="btn btn-ghost btn-sm" title={l.status === 'active' ? 'Pause' : 'Publish'} onClick={() => toggle(l)}>
                          {l.status === 'active' ? '⏸' : '▶️'}
                        </button>
                        <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => remove(l)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!stockFor} title={`Update stock — ${stockFor?.title ?? ''}`} onClose={() => setStockFor(null)}
        footer={<><button className="btn btn-ghost" onClick={() => setStockFor(null)}>Cancel</button><button className="btn btn-primary" onClick={saveStock}>Save</button></>}>
        <Alert kind="error">{err}</Alert>
        <div className="field">
          <label>Quantity available ({stockFor?.unit || 'units'})</label>
          <input type="number" min={0} value={stockVal} onChange={(e) => setStockVal(Math.max(0, Number(e.target.value)))} />
          <div className="hint">Set to 0 to mark as out of stock. Stock decreases automatically when buyers order.</div>
        </div>
      </Modal>
    </>
  );
}
