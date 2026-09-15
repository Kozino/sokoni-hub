import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError, qs } from '../../lib/api';
import { money, date, dateTime, timeAgo } from '../../lib/format';
import { Alert, Empty, Field, Modal, StatusBadge, Tabs, useConfirm } from '../../components/ui';
import { DataTable, DTColumn } from '../../components/DataTable';
import { useToast } from '../../state/ToastContext';
import type { Complaint, Listing, Order, User, Category } from '../../types';

/* ================= Listings moderation ================= */
export function AdminListings() {
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const { push } = useToast();
  const { confirm, dialog } = useConfirm();

  const load = () => {
    setLoading(true);
    api.get<{ listings: Listing[] }>(`/admin/listings${qs({ status, q })}`)
      .then((r) => setItems(r.listings)).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(load, [status]);

  const act = async (l: Listing, path: 'remove' | 'restore') => {
    if (path === 'remove') {
      const ok = await confirm({ title: 'Remove listing', body: <>Remove <strong>“{l.title}”</strong> from the marketplace?</>, confirmLabel: 'Remove' });
      if (!ok) return;
    }
    try { await api.post(`/admin/listings/${l.id}/${path}`, { reason: 'Admin moderation' }); push(`Listing ${path}d`, 'success'); load(); }
    catch (e) { push(e instanceof ApiError ? e.message : 'Failed', 'error'); }
  };

  const bulkRemove = async (rows: Listing[]) => {
    const ok = await confirm({ title: 'Remove listings', body: <>Remove <strong>{rows.length}</strong> listing{rows.length === 1 ? '' : 's'} from the marketplace?</>, confirmLabel: 'Remove all' });
    if (!ok) return;
    await Promise.all(rows.map((l) => api.post(`/admin/listings/${l.id}/remove`, { reason: 'Admin moderation' }).catch(() => null)));
    push(`Removed ${rows.length} listing${rows.length === 1 ? '' : 's'}`, 'success'); load();
  };

  const columns: DTColumn<Listing>[] = [
    {
      key: 'item', header: 'Item', alwaysVisible: true, sortAccessor: (l) => l.title,
      render: (l) => <>{l.title}<div style={{ fontSize: '.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{l.kind}</div></>,
    },
    { key: 'store', header: 'Store', sortAccessor: (l) => l.business_name || '', render: (l) => l.business_name },
    { key: 'category', header: 'Category', defaultHidden: true, render: (l) => l.category_name },
    { key: 'price', header: 'Price', align: 'right', sortAccessor: (l) => Number(l.price), render: (l) => money(l.price, l.currency) },
    { key: 'stock', header: 'Stock', render: (l) => l.kind === 'product' ? `${l.quantity ?? 0} ${l.unit || ''}` : '—' },
    { key: 'views', header: 'Views', align: 'right', sortAccessor: (l) => l.views, render: (l) => l.views },
    { key: 'status', header: 'Status', sortAccessor: (l) => l.status, render: (l) => <StatusBadge status={l.status} /> },
    { key: 'added', header: 'Added', defaultHidden: true, sortAccessor: (l) => l.created_at, render: (l) => <span style={{ fontSize: '.8rem' }}>{date(l.created_at)}</span> },
  ];

  return (
    <>
      <div className="dash-title"><h1>Listing moderation</h1><p>Remove prohibited or misleading listings.</p></div>
      <form className="filters" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input className="grow" placeholder="Search title or store…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 250 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option><option value="active">Active</option>
          <option value="paused">Paused</option><option value="draft">Draft</option><option value="removed">Removed</option>
        </select>
        <button className="btn btn-primary btn-sm">Search</button>
      </form>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(l) => l.id}
        loading={loading}
        emptyIcon="📦"
        emptyTitle="No listings found"
        selectable
        storageKey="admin-listings"
        exportFilename="listings"
        bulkActions={[{ label: 'Remove', tone: 'danger', onClick: bulkRemove }]}
        rowActions={(l) => (
          l.status === 'removed'
            ? <button className="btn btn-outline btn-sm" onClick={() => act(l, 'restore')}>Restore</button>
            : <button className="btn btn-danger btn-sm" onClick={() => act(l, 'remove')}>Remove</button>
        )}
      />
      {dialog}
    </>
  );
}

/* ================= Complaints ================= */
const CTABS = [{ id: 'open', label: 'Open' }, { id: 'investigating', label: 'Investigating' }, { id: 'resolved', label: 'Resolved' }, { id: 'dismissed', label: 'Dismissed' }, { id: '', label: 'All' }];

export function AdminComplaints() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const [items, setItems] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Complaint | null>(null);
  const [note, setNote] = useState('');
  const [next, setNext] = useState<Complaint['status']>('investigating');
  const [err, setErr] = useState('');
  const { push } = useToast();

  const load = () => {
    setLoading(true);
    api.get<{ complaints: Complaint[] }>(`/admin/complaints${qs({ status })}`)
      .then((r) => setItems(r.complaints)).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(load, [status]);

  const save = async () => {
    if (!sel) return;
    try {
      await api.patch(`/admin/complaints/${sel.id}`, { status: next, admin_note: note || undefined });
      push('Complaint updated', 'success'); setSel(null); setNote(''); load();
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); }
  };

  const columns: DTColumn<Complaint>[] = [
    { key: 'ref', header: 'Ref', alwaysVisible: true, render: (c) => <span className="td-mono">{c.code}</span> },
    { key: 'subject', header: 'Subject', sortAccessor: (c) => c.subject, render: (c) => <span className="td-strong">{c.subject}</span> },
    { key: 'against', header: 'Against', render: (c) => <>{c.business_name || '—'}{c.listing_title && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{c.listing_title}</div>}</> },
    { key: 'reporter', header: 'Reporter', defaultHidden: true, render: (c) => <>{c.reporter_name || 'Anonymous'}<div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{c.reporter_phone}</div></> },
    { key: 'status', header: 'Status', sortAccessor: (c) => c.status, render: (c) => <StatusBadge status={c.status} /> },
    { key: 'filed', header: 'Filed', sortAccessor: (c) => c.created_at, render: (c) => <span style={{ fontSize: '.8rem' }}>{timeAgo(c.created_at)}</span> },
  ];

  return (
    <>
      <div className="dash-title"><h1>Complaint management</h1><p>Investigate disputes between buyers and vendors.</p></div>
      <Tabs value={status} onChange={(v) => setParams(v ? { status: v } : {})} tabs={CTABS as any} />

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(c) => c.id}
        loading={loading}
        emptyIcon="✅"
        emptyTitle="No complaints here"
        emptyText="Nothing needs your attention."
        exportFilename="complaints"
        storageKey="admin-complaints"
        rowActions={(c) => <button className="btn btn-outline btn-sm" onClick={() => { setSel(c); setNote(c.admin_note || ''); setNext(c.status); setErr(''); }}>Handle</button>}
      />

      <Modal open={!!sel} title={`Complaint ${sel?.code ?? ''}`} onClose={() => setSel(null)}
        footer={<><button className="btn btn-ghost" onClick={() => setSel(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save decision</button></>}>
        {sel && (
          <>
            <Alert kind="error">{err}</Alert>
            <h4>{sel.subject}</h4>
            <p style={{ whiteSpace: 'pre-wrap' }}>{sel.body}</p>
            <dl className="kv mb-2">
              <dt>Against</dt><dd>{sel.business_name || '—'}</dd>
              <dt>Listing</dt><dd>{sel.listing_title || '—'}</dd>
              <dt>Order</dt><dd className="td-mono">{sel.order_code_ref || '—'}</dd>
              <dt>Reporter</dt><dd>{sel.reporter_name || 'Anonymous'} · {sel.reporter_phone || '—'}</dd>
              <dt>Filed</dt><dd>{dateTime(sel.created_at)}</dd>
            </dl>
            <Field label="Set status">
              <select value={next} onChange={(e) => setNext(e.target.value as any)}>
                <option value="open">Open</option><option value="investigating">Investigating</option>
                <option value="resolved">Resolved</option><option value="dismissed">Dismissed</option>
              </select>
            </Field>
            <Field label="Admin note" hint="Visible to the reporter and the vendor">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 100 }} />
            </Field>
          </>
        )}
      </Modal>
    </>
  );
}

/* ================= Orders ================= */
export function AdminOrders() {
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');

  const load = () => {
    setLoading(true);
    api.get<{ orders: Order[] }>(`/admin/orders${qs({ status, q })}`)
      .then((r) => setItems(r.orders)).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(load, [status]);

  const columns: DTColumn<Order>[] = [
    { key: 'code', header: 'Code', alwaysVisible: true, render: (o) => <span className="td-mono td-strong">{o.code}</span> },
    { key: 'store', header: 'Store', sortAccessor: (o) => o.business_name || '', render: (o) => o.business_name },
    { key: 'buyer', header: 'Buyer', render: (o) => <>{o.contact_name}<div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{o.contact_phone}</div></> },
    { key: 'city', header: 'City', defaultHidden: true, sortAccessor: (o) => o.city, render: (o) => o.city },
    { key: 'payment', header: 'Payment', defaultHidden: true, render: (o) => <span style={{ fontSize: '.8rem', textTransform: 'capitalize' }}>{o.payment_method.replace(/_/g, ' ')}</span> },
    { key: 'total', header: 'Total', align: 'right', sortAccessor: (o) => Number(o.total), render: (o) => <span className="td-strong">{money(o.total, o.currency)}</span> },
    { key: 'status', header: 'Status', sortAccessor: (o) => o.status, render: (o) => <StatusBadge status={o.status} /> },
    { key: 'placed', header: 'Placed', sortAccessor: (o) => o.created_at, render: (o) => <span style={{ fontSize: '.8rem' }}>{dateTime(o.created_at)}</span> },
  ];

  return (
    <>
      <div className="dash-title"><h1>Orders</h1><p>Every order placed across the marketplace.</p></div>
      <form className="filters" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input className="grow" placeholder="Search code, buyer or phone…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 250 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['pending', 'confirmed', 'dispatched', 'delivered', 'cancelled'].map((s) => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
        </select>
        <button className="btn btn-primary btn-sm">Search</button>
      </form>

      <DataTable columns={columns} rows={items} rowKey={(o) => o.id} loading={loading}
        emptyIcon="🧾" emptyTitle="No orders found" exportFilename="orders" storageKey="admin-orders" />
    </>
  );
}

/* ================= Users ================= */
export function AdminUsers() {
  const [items, setItems] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [nf, setNf] = useState({ full_name: '', phone: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const { push } = useToast();
  const { confirm, dialog } = useConfirm();

  const load = () => {
    setLoading(true);
    api.get<{ users: User[] }>(`/admin/users${qs({ role, q })}`)
      .then((r) => setItems(r.users)).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(load, [role]);

  const toggle = async (u: User) => {
    if (u.is_active) {
      const ok = await confirm({ title: 'Disable user', body: <>Disable <strong>{u.full_name}</strong>? They won't be able to sign in.</>, confirmLabel: 'Disable' });
      if (!ok) return;
    }
    try { await api.patch(`/admin/users/${u.id}`, { is_active: !u.is_active }); push('User updated', 'success'); load(); }
    catch (e) { push(e instanceof ApiError ? e.message : 'Failed', 'error'); }
  };

  const createAdmin = async () => {
    setErr('');
    try { await api.post('/admin/users/admin', { ...nf, email: nf.email || undefined }); push('Admin created', 'success'); setShowNew(false); setNf({ full_name: '', phone: '', email: '', password: '' }); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); }
  };

  const columns: DTColumn<User>[] = [
    { key: 'name', header: 'Name', alwaysVisible: true, sortAccessor: (u) => u.full_name, render: (u) => <span className="td-strong">{u.full_name}</span> },
    { key: 'phone', header: 'Phone', render: (u) => <span className="td-mono">{u.phone}</span> },
    { key: 'email', header: 'Email', defaultHidden: true, render: (u) => u.email || '—' },
    { key: 'role', header: 'Role', sortAccessor: (u) => u.role, render: (u) => <span className={`badge badge-${u.role === 'admin' ? 'red' : u.role === 'vendor' ? 'green' : 'grey'}`}>{u.role}</span> },
    { key: 'status', header: 'Status', sortAccessor: (u) => (u.is_active ? 1 : 0), render: (u) => u.is_active ? <span className="badge badge-green">active</span> : <span className="badge badge-red">disabled</span> },
    { key: 'joined', header: 'Joined', defaultHidden: true, sortAccessor: (u) => u.created_at || '', render: (u) => <span style={{ fontSize: '.8rem' }}>{date(u.created_at)}</span> },
  ];

  return (
    <>
      <div className="dash-title row-between">
        <div><h1>Users</h1><p>Buyers, vendors and administrators.</p></div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>➕ New admin</button>
      </div>

      <form className="filters" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input className="grow" placeholder="Search name, phone or email…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 250 }} />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option><option value="buyer">Buyers</option>
          <option value="vendor">Vendors</option><option value="admin">Admins</option>
        </select>
        <button className="btn btn-primary btn-sm">Search</button>
      </form>

      <DataTable
        columns={columns} rows={items} rowKey={(u) => u.id} loading={loading}
        emptyIcon="👥" emptyTitle="No users found" exportFilename="users" storageKey="admin-users"
        rowActions={(u) => <button className="btn btn-outline btn-sm" onClick={() => toggle(u)}>{u.is_active ? 'Disable' : 'Enable'}</button>}
      />

      <Modal open={showNew} title="Create administrator" onClose={() => setShowNew(false)}
        footer={<><button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button><button className="btn btn-primary" onClick={createAdmin}>Create</button></>}>
        <Alert kind="error">{err}</Alert>
        <Field label="Full name"><input value={nf.full_name} onChange={(e) => setNf({ ...nf, full_name: e.target.value })} /></Field>
        <Field label="Phone"><input value={nf.phone} onChange={(e) => setNf({ ...nf, phone: e.target.value })} /></Field>
        <Field label="Email (optional)"><input type="email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} /></Field>
        <Field label="Password" hint="Minimum 8 characters"><input type="password" value={nf.password} onChange={(e) => setNf({ ...nf, password: e.target.value })} /></Field>
      </Modal>
      {dialog}
    </>
  );
}

/* ================= Categories ================= */
export function AdminCategories() {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [nf, setNf] = useState({ name: '', slug: '', kind: 'product' as 'product' | 'service', is_banned: false });
  const [err, setErr] = useState('');
  const { push } = useToast();
  const { confirm, dialog } = useConfirm();

  const load = () => {
    setLoading(true);
    api.get<{ categories: Category[] }>('/admin/categories')
      .then((r) => setItems(r.categories)).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggleBan = async (c: Category) => {
    if (!c.is_banned) {
      const ok = await confirm({ title: 'Prohibit category', body: <>Mark <strong>{c.name}</strong> as prohibited? It will be hidden from vendors and buyers immediately.</>, confirmLabel: 'Prohibit' });
      if (!ok) return;
    }
    try { await api.patch(`/admin/categories/${c.id}`, { is_banned: !c.is_banned }); push('Category updated', 'success'); load(); }
    catch (e) { push(e instanceof ApiError ? e.message : 'Failed', 'error'); }
  };

  const create = async () => {
    setErr('');
    try { await api.post('/admin/categories', nf); push('Category created', 'success'); setShowNew(false); setNf({ name: '', slug: '', kind: 'product', is_banned: false }); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); }
  };

  const columns: DTColumn<Category>[] = [
    { key: 'name', header: 'Name', alwaysVisible: true, sortAccessor: (c) => c.name, render: (c) => <span className="td-strong">{c.name}</span> },
    { key: 'slug', header: 'Slug', render: (c) => <span className="td-mono">{c.slug}</span> },
    { key: 'type', header: 'Type', sortAccessor: (c) => c.kind, render: (c) => <span style={{ textTransform: 'capitalize' }}>{c.kind}</span> },
    { key: 'allowed', header: 'Allowed?', sortAccessor: (c) => (c.is_banned ? 0 : 1), render: (c) => c.is_banned ? <span className="badge badge-red">prohibited</span> : <span className="badge badge-green">allowed</span> },
  ];

  return (
    <>
      <div className="dash-title row-between">
        <div><h1>Categories</h1><p>Control what can be listed. Banned categories are hidden from vendors.</p></div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>➕ New category</button>
      </div>

      <DataTable
        columns={columns} rows={items} rowKey={(c) => c.id} loading={loading} emptyTitle="No categories yet"
        rowActions={(c) => <button className="btn btn-outline btn-sm" onClick={() => toggleBan(c)}>{c.is_banned ? 'Allow' : 'Prohibit'}</button>}
      />

      <Modal open={showNew} title="New category" onClose={() => setShowNew(false)}
        footer={<><button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button><button className="btn btn-primary" onClick={create}>Create</button></>}>
        <Alert kind="error">{err}</Alert>
        <Field label="Name"><input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })} /></Field>
        <Field label="Slug"><input value={nf.slug} onChange={(e) => setNf({ ...nf, slug: e.target.value })} /></Field>
        <Field label="Type">
          <select value={nf.kind} onChange={(e) => setNf({ ...nf, kind: e.target.value as any })}>
            <option value="product">Product</option><option value="service">Service</option>
          </select>
        </Field>
        <label className="checkbox"><input type="checkbox" checked={nf.is_banned} onChange={(e) => setNf({ ...nf, is_banned: e.target.checked })} /><span>Mark as prohibited</span></label>
      </Modal>
      {dialog}
    </>
  );
}

/* ================= Audit log ================= */
export function AdminAudit() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ events: any[] }>('/admin/audit?limit=300')
      .then((r) => setItems(r.events)).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);

  const columns: DTColumn<any>[] = [
    { key: 'when', header: 'When', alwaysVisible: true, sortAccessor: (a) => a.created_at, render: (a) => <span style={{ fontSize: '.8rem' }}>{dateTime(a.created_at)}</span> },
    { key: 'action', header: 'Action', sortAccessor: (a) => a.action, render: (a) => <span className="td-strong">{a.action}</span> },
    { key: 'entity', header: 'Entity', sortAccessor: (a) => a.entity, render: (a) => a.entity },
    { key: 'actor', header: 'Actor', sortAccessor: (a) => a.actor || '', render: (a) => a.actor || 'system' },
    {
      key: 'details', header: 'Details', csvValue: (a) => (a.meta ? JSON.stringify(a.meta) : ''),
      render: (a) => (
        <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
          {a.meta && Object.keys(a.meta).length ? JSON.stringify(a.meta) : '—'}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="dash-title"><h1>Activity log</h1><p>Immutable record of every significant action on the platform.</p></div>
      <DataTable columns={columns} rows={items} rowKey={(a) => a.id} loading={loading}
        emptyIcon="🕘" emptyTitle="No activity recorded yet" exportFilename="audit-log" storageKey="admin-audit" pageSize={20} />
    </>
  );
}
