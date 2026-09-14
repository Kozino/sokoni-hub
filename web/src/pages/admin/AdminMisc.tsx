import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError, qs } from '../../lib/api';
import { money, date, dateTime, timeAgo } from '../../lib/format';
import { Alert, Empty, Field, Modal, Spinner, StatusBadge, Tabs } from '../../components/ui';
import { useToast } from '../../state/ToastContext';
import type { Complaint, Listing, Order, User, Category } from '../../types';

/* ================= Listings moderation ================= */
export function AdminListings() {
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const { push } = useToast();

  const load = () => {
    setLoading(true);
    api.get<{ listings: Listing[] }>(`/admin/listings${qs({ status, q })}`)
      .then((r) => setItems(r.listings)).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(load, [status]);

  const act = async (l: Listing, path: 'remove' | 'restore') => {
    if (path === 'remove' && !confirm(`Remove "${l.title}" from the marketplace?`)) return;
    try { await api.post(`/admin/listings/${l.id}/${path}`, { reason: 'Admin moderation' }); push(`Listing ${path}d`, 'success'); load(); }
    catch (e) { push(e instanceof ApiError ? e.message : 'Failed', 'error'); }
  };

  return (
    <>
      <div className="dash-title"><h1>Listing moderation</h1><p>Remove prohibited or misleading listings.</p></div>
      <form className="filters" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input placeholder="Search title or store…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 250 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option><option value="active">Active</option>
          <option value="paused">Paused</option><option value="draft">Draft</option><option value="removed">Removed</option>
        </select>
        <button className="btn btn-primary btn-sm">Search</button>
      </form>

      {loading ? <Spinner /> : items.length === 0 ? <Empty icon="📦" title="No listings found" /> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Item</th><th>Store</th><th>Category</th><th>Price</th><th>Stock</th><th>Views</th><th>Status</th><th>Added</th><th></th></tr></thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id}>
                  <td className="td-strong">{l.title}<div style={{ fontSize: '.75rem', color: 'var(--muted)', textTransform: 'capitalize' }}>{l.kind}</div></td>
                  <td>{l.business_name}</td><td>{l.category_name}</td>
                  <td>{money(l.price, l.currency)}</td>
                  <td>{l.kind === 'product' ? `${l.quantity ?? 0} ${l.unit || ''}` : '—'}</td>
                  <td>{l.views}</td><td><StatusBadge status={l.status} /></td>
                  <td style={{ fontSize: '.8rem' }}>{date(l.created_at)}</td>
                  <td>
                    {l.status === 'removed'
                      ? <button className="btn btn-outline btn-sm" onClick={() => act(l, 'restore')}>Restore</button>
                      : <button className="btn btn-danger btn-sm" onClick={() => act(l, 'remove')}>Remove</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

  return (
    <>
      <div className="dash-title"><h1>Complaint management</h1><p>Investigate disputes between buyers and vendors.</p></div>
      <Tabs value={status} onChange={(v) => setParams(v ? { status: v } : {})} tabs={CTABS as any} />

      {loading ? <Spinner /> : items.length === 0 ? <Empty icon="✅" title="No complaints here" text="Nothing needs your attention." /> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Ref</th><th>Subject</th><th>Against</th><th>Reporter</th><th>Status</th><th>Filed</th><th></th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td className="td-mono">{c.code}</td>
                  <td className="td-strong">{c.subject}</td>
                  <td>{c.business_name || '—'}{c.listing_title && <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{c.listing_title}</div>}</td>
                  <td>{c.reporter_name || 'Anonymous'}<div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{c.reporter_phone}</div></td>
                  <td><StatusBadge status={c.status} /></td>
                  <td style={{ fontSize: '.8rem' }}>{timeAgo(c.created_at)}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => { setSel(c); setNote(c.admin_note || ''); setNext(c.status); setErr(''); }}>Handle</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

  return (
    <>
      <div className="dash-title"><h1>Orders</h1><p>Every order placed across the marketplace.</p></div>
      <form className="filters" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input placeholder="Search code, buyer or phone…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 250 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['pending', 'confirmed', 'dispatched', 'delivered', 'cancelled'].map((s) => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
        </select>
        <button className="btn btn-primary btn-sm">Search</button>
      </form>

      {loading ? <Spinner /> : items.length === 0 ? <Empty icon="🧾" title="No orders found" /> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Code</th><th>Store</th><th>Buyer</th><th>City</th><th>Payment</th><th>Total</th><th>Status</th><th>Placed</th></tr></thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id}>
                  <td className="td-mono td-strong">{o.code}</td><td>{o.business_name}</td>
                  <td>{o.contact_name}<div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{o.contact_phone}</div></td>
                  <td>{o.city}</td>
                  <td style={{ fontSize: '.8rem', textTransform: 'capitalize' }}>{o.payment_method.replace(/_/g, ' ')}</td>
                  <td className="td-strong">{money(o.total, o.currency)}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td style={{ fontSize: '.8rem' }}>{dateTime(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

  const load = () => {
    setLoading(true);
    api.get<{ users: User[] }>(`/admin/users${qs({ role, q })}`)
      .then((r) => setItems(r.users)).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(load, [role]);

  const toggle = async (u: User) => {
    try { await api.patch(`/admin/users/${u.id}`, { is_active: !u.is_active }); push('User updated', 'success'); load(); }
    catch (e) { push(e instanceof ApiError ? e.message : 'Failed', 'error'); }
  };

  const createAdmin = async () => {
    setErr('');
    try { await api.post('/admin/users/admin', { ...nf, email: nf.email || undefined }); push('Admin created', 'success'); setShowNew(false); setNf({ full_name: '', phone: '', email: '', password: '' }); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); }
  };

  return (
    <>
      <div className="dash-title row-between">
        <div><h1>Users</h1><p>Buyers, vendors and administrators.</p></div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>➕ New admin</button>
      </div>

      <form className="filters" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input placeholder="Search name, phone or email…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 250 }} />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option><option value="buyer">Buyers</option>
          <option value="vendor">Vendors</option><option value="admin">Admins</option>
        </select>
        <button className="btn btn-primary btn-sm">Search</button>
      </form>

      {loading ? <Spinner /> : items.length === 0 ? <Empty icon="👥" title="No users found" /> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td className="td-strong">{u.full_name}</td><td className="td-mono">{u.phone}</td>
                  <td>{u.email || '—'}</td>
                  <td><span className={`badge badge-${u.role === 'admin' ? 'red' : u.role === 'vendor' ? 'green' : 'grey'}`}>{u.role}</span></td>
                  <td>{u.is_active ? <span className="badge badge-green">active</span> : <span className="badge badge-red">disabled</span>}</td>
                  <td style={{ fontSize: '.8rem' }}>{date(u.created_at)}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => toggle(u)}>{u.is_active ? 'Disable' : 'Enable'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showNew} title="Create administrator" onClose={() => setShowNew(false)}
        footer={<><button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button><button className="btn btn-primary" onClick={createAdmin}>Create</button></>}>
        <Alert kind="error">{err}</Alert>
        <Field label="Full name"><input value={nf.full_name} onChange={(e) => setNf({ ...nf, full_name: e.target.value })} /></Field>
        <Field label="Phone"><input value={nf.phone} onChange={(e) => setNf({ ...nf, phone: e.target.value })} /></Field>
        <Field label="Email (optional)"><input type="email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} /></Field>
        <Field label="Password" hint="Minimum 8 characters"><input type="password" value={nf.password} onChange={(e) => setNf({ ...nf, password: e.target.value })} /></Field>
      </Modal>
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

  const load = () => {
    setLoading(true);
    api.get<{ categories: Category[] }>('/admin/categories')
      .then((r) => setItems(r.categories)).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggleBan = async (c: Category) => {
    try { await api.patch(`/admin/categories/${c.id}`, { is_banned: !c.is_banned }); push('Category updated', 'success'); load(); }
    catch (e) { push(e instanceof ApiError ? e.message : 'Failed', 'error'); }
  };

  const create = async () => {
    setErr('');
    try { await api.post('/admin/categories', nf); push('Category created', 'success'); setShowNew(false); setNf({ name: '', slug: '', kind: 'product', is_banned: false }); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); }
  };

  return (
    <>
      <div className="dash-title row-between">
        <div><h1>Categories</h1><p>Control what can be listed. Banned categories are hidden from vendors.</p></div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>➕ New category</button>
      </div>

      {loading ? <Spinner /> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Slug</th><th>Type</th><th>Allowed?</th><th></th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td className="td-strong">{c.name}</td><td className="td-mono">{c.slug}</td>
                  <td style={{ textTransform: 'capitalize' }}>{c.kind}</td>
                  <td>{c.is_banned ? <span className="badge badge-red">prohibited</span> : <span className="badge badge-green">allowed</span>}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => toggleBan(c)}>{c.is_banned ? 'Allow' : 'Prohibit'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

  return (
    <>
      <div className="dash-title"><h1>Activity log</h1><p>Immutable record of every significant action on the platform.</p></div>
      {loading ? <Spinner /> : items.length === 0 ? <Empty icon="🕘" title="No activity recorded yet" /> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Actor</th><th>Details</th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontSize: '.8rem' }}>{dateTime(a.created_at)}</td>
                  <td className="td-strong">{a.action}</td>
                  <td>{a.entity}</td>
                  <td>{a.actor || 'system'}</td>
                  <td style={{ fontSize: '.78rem', color: 'var(--muted)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.meta && Object.keys(a.meta).length ? JSON.stringify(a.meta) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
