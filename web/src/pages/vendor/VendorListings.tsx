import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { money, num, date } from '../../lib/format';
import { Empty, StatusBadge, Tabs, Modal, Alert, useConfirm } from '../../components/ui';
import { DataTable, DTColumn } from '../../components/DataTable';
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
  const { confirm, dialog } = useConfirm();

  const load = () => {
    setLoading(true);
    api.get<{ listings: Listing[] }>('/listings/mine/all')
      .then((r) => setItems(r.listings)).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const setStatus = async (l: Listing, status: Listing['status']) => {
    try {
      const r = await api.patch<{ listing: Listing }>(`/listings/${l.id}`, { status });
      push(
        r.listing.status === 'pending_review' ? 'Submitted for admin approval'
          : r.listing.status === 'paused' ? 'Listing paused'
          : r.listing.status === 'active' ? 'Listing published'
          : 'Listing updated',
        'success'
      );
      load();
    } catch (e) { push(e instanceof ApiError ? e.message : 'Failed', 'error'); }
  };
  const toggle = (l: Listing) => setStatus(l, l.status === 'active' ? 'paused' : 'active');

  const remove = async (l: Listing) => {
    const ok = await confirm({ title: 'Delete listing', body: <>Delete <strong>“{l.title}”</strong>? This cannot be undone.</>, confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.del(`/listings/${l.id}`); push('Listing deleted', 'success'); load(); }
    catch (e) { push(e instanceof ApiError ? e.message : 'Failed', 'error'); }
  };

  const bulkPause = async (rows: Listing[]) => {
    await Promise.all(rows.map((l) => api.patch(`/listings/${l.id}`, { status: 'paused' }).catch(() => null)));
    push(`Paused ${rows.length} listing${rows.length === 1 ? '' : 's'}`, 'success'); load();
  };
  const bulkDelete = async (rows: Listing[]) => {
    const ok = await confirm({
      title: 'Delete listings',
      body: <>Delete <strong>{rows.length}</strong> listing{rows.length === 1 ? '' : 's'}? This cannot be undone.</>,
      confirmLabel: 'Delete all',
    });
    if (!ok) return;
    await Promise.all(rows.map((l) => api.del(`/listings/${l.id}`).catch(() => null)));
    push(`Deleted ${rows.length} listing${rows.length === 1 ? '' : 's'}`, 'success'); load();
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

  const columns: DTColumn<Listing>[] = [
    {
      key: 'item', header: 'Item', alwaysVisible: true, sortAccessor: (l) => l.title,
      render: (l) => {
        const img = Array.isArray(l.images) ? l.images[0] : undefined;
        return (
          <div className="row" style={{ gap: 10 }}>
            {img ? <img className="thumb" src={img} alt="" /> : <div className="thumb" style={{ display: 'grid', placeItems: 'center' }}>{l.kind === 'service' ? '💇' : '🛍️'}</div>}
            <div>
              <div className="td-strong">{l.title}</div>
              <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{l.kind}</div>
            </div>
          </div>
        );
      },
    },
    { key: 'category', header: 'Category', render: (l) => l.category_name, sortAccessor: (l) => l.category_name || '' },
    { key: 'price', header: 'Price', align: 'right', sortAccessor: (l) => Number(l.price), render: (l) => <span className="td-strong">{money(l.price, l.currency)}</span> },
    {
      key: 'stock', header: 'Stock / Unit', sortAccessor: (l) => l.kind === 'product' ? Number(l.quantity ?? 0) : 0,
      render: (l) => {
        const low = l.kind === 'product' && (l.quantity ?? 0) <= 5;
        return l.kind === 'product'
          ? <span style={{ color: low ? 'var(--danger)' : undefined, fontWeight: low ? 700 : 400 }}>{l.quantity ?? 0} {l.unit || 'units'}{low ? ' ⚠️' : ''}</span>
          : (l.duration_mins ? `${l.duration_mins} min` : '—');
      },
    },
    { key: 'weight', header: 'Weight / Vol.', defaultHidden: true, render: (l) => l.weight_kg ? `${Number(l.weight_kg)} kg` : l.volume_l ? `${Number(l.volume_l)} L` : '—' },
    { key: 'views', header: 'Views', align: 'right', sortAccessor: (l) => l.views, render: (l) => num(l.views) },
    {
      key: 'status', header: 'Status', sortAccessor: (l) => l.status,
      render: (l) => (
        <>
          <StatusBadge status={l.status} />
          {l.status === 'rejected' && l.rejection_reason && (
            <div style={{ fontSize: '.72rem', color: 'var(--danger)', maxWidth: 220 }}>{l.rejection_reason}</div>
          )}
        </>
      ),
    },
    { key: 'added', header: 'Added', defaultHidden: true, sortAccessor: (l) => l.created_at, render: (l) => <span style={{ fontSize: '.8rem' }}>{date(l.created_at)}</span> },
  ];

  return (
    <>
      <div className="dash-title row-between">
        <div><h1>Products &amp; services</h1><p>{items.length} listing{items.length === 1 ? '' : 's'} in your store</p></div>
        <Link to="/vendor/listings/new" className="btn btn-primary">➕ Add listing</Link>
      </div>

      {items.some((l) => l.status === 'pending_review') && (
        <Alert kind="warn">
          {items.filter((l) => l.status === 'pending_review').length} listing{items.filter((l) => l.status === 'pending_review').length === 1 ? ' is' : 's are'} waiting for admin approval before {items.filter((l) => l.status === 'pending_review').length === 1 ? 'it' : 'they'} become visible to buyers.
        </Alert>
      )}
      {items.some((l) => l.status === 'rejected') && (
        <Alert kind="error">
          {items.filter((l) => l.status === 'rejected').length} listing{items.filter((l) => l.status === 'rejected').length === 1 ? '' : 's'} were rejected — check the reason in the Status column, edit, and resubmit.
        </Alert>
      )}

      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { id: 'all', label: 'All', count: items.length },
          { id: 'product', label: 'Products', count: items.filter((i) => i.kind === 'product').length },
          { id: 'service', label: 'Services', count: items.filter((i) => i.kind === 'service').length },
        ]}
      />

      <div className="filters">
        <input className="grow" placeholder="Search your listings…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
      </div>

      {!loading && items.length === 0 ? (
        <Empty icon="📦" title="No listings here" text="Add a product or service to start selling."
          action={<Link to="/vendor/listings/new" className="btn btn-primary">Add your first listing</Link>} />
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(l) => l.id}
          loading={loading}
          emptyIcon="📦"
          emptyTitle="No listings match that search"
          selectable
          storageKey="vendor-listings"
          exportFilename="my-listings"
          bulkActions={[
            { label: 'Pause', tone: 'outline', onClick: bulkPause },
            { label: 'Delete', tone: 'danger', onClick: bulkDelete },
          ]}
          rowActions={(l) => (
            <div className="row" style={{ gap: 4 }}>
              {l.kind === 'product' && (
                <button className="btn btn-ghost btn-sm" title="Update stock"
                  onClick={() => { setStockFor(l); setStockVal(l.quantity ?? 0); setErr(''); }}>📊</button>
              )}
              <Link to={`/vendor/listings/${l.id}/edit`} className="btn btn-ghost btn-sm" title="Edit">✏️</Link>
              {l.status !== 'pending_review' && (
                <button
                  className="btn btn-ghost btn-sm"
                  title={l.status === 'active' ? 'Pause' : l.status === 'rejected' ? 'Resubmit for review' : 'Publish'}
                  onClick={() => toggle(l)}
                >
                  {l.status === 'active' ? '⏸' : '▶️'}
                </button>
              )}
              <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => remove(l)}>🗑</button>
            </div>
          )}
        />
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
      {dialog}
    </>
  );
}
