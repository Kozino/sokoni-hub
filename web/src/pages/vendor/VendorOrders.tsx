import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { money, dateTime, compactReference } from '../../lib/format';
import { StatusBadge, Tabs, Modal } from '../../components/ui';
import { DataTable, DTColumn } from '../../components/DataTable';
import { useToast } from '../../state/ToastContext';
import { useAuth } from '../../state/AuthContext';
import type { Order, OrderStatus } from '../../types';

const TABS: { id: string; label: string }[] = [
  { id: '', label: 'All' }, { id: 'pending', label: 'Pending' }, { id: 'confirmed', label: 'Confirmed' },
  { id: 'dispatched', label: 'Dispatched' }, { id: 'delivered', label: 'Delivered' }, { id: 'cancelled', label: 'Cancelled' },
];

const STATUS_WORDS: Record<string, string> = {
  confirmed: 'confirmed', dispatched: 'marked as dispatched', delivered: 'marked as delivered', cancelled: 'cancelled',
};
const CANCEL_REASONS = ['Out of stock', 'Cannot deliver to this area', 'Buyer asked to cancel', 'Price or listing error', 'Other'];

// Short two-tone chime so vendors notice a new order without watching the screen.
function chime() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    [880, 1175].forEach((freq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.start(t); o.stop(t + 0.17);
    });
    setTimeout(() => ctx.close(), 800);
  } catch { /* autoplay can be blocked; the toast still shows */ }
}

const NEXT: Record<string, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  // No direct confirmed -> delivered: an order must be dispatched first so driver proof and payout rules always apply.
  confirmed: ['dispatched', 'cancelled'],
  dispatched: ['delivered', 'cancelled'],
  delivered: [], cancelled: [],
};

export default function VendorOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { vendor } = useAuth();

  const load = () => {
    setLoading(true);
    api.get<{ orders: Order[] }>(`/orders/vendor${tab ? `?status=${tab}` : ''}`)
      .then((r) => setOrders(r.orders)).catch(() => setOrders([])).finally(() => setLoading(false));
  };
  useEffect(load, [tab]);

  // New orders: check every 30 seconds for pending orders the vendor has not seen yet.
  const seenPending = useRef<Set<string> | null>(null);
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const r = await api.get<{ orders: Order[] }>('/orders/vendor?status=pending');
        if (stopped) return;
        const previous = seenPending.current;
        seenPending.current = new Set(r.orders.map((o) => o.id));
        if (previous) {
          const fresh = r.orders.filter((o) => !previous.has(o.id));
          if (fresh.length) {
            push(`${fresh.length} new order${fresh.length > 1 ? 's' : ''} waiting: ${fresh.map((o) => o.code).join(', ')}`, 'success');
            chime();
            try {
              if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
                new Notification('New order', { body: `${fresh.length} order${fresh.length > 1 ? 's' : ''} waiting for you` });
              }
            } catch { /* optional */ }
            load();
          }
        }
      } catch { /* keep the page usable if a check fails */ }
    };
    void check();
    const timer = setInterval(check, 30000);
    return () => { stopped = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Ask once for browser notifications (only used when the tab is in the background).
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission().catch(() => {});
  }, []);

  const closeDetail = () => { setDetail(null); setCancelling(false); setReason(''); setOther(''); };

  const move = async (o: Order, status: OrderStatus, cancelReason?: string) => {
    setBusy(true);
    try {
      await api.patch(`/orders/vendor/${o.id}/status`, cancelReason ? { status, reason: cancelReason } : { status });
      push(`Order ${o.code} ${STATUS_WORDS[status] ?? status}.`, 'success');
      closeDetail(); load();
    } catch (e) { push(e instanceof ApiError ? e.message : 'Could not update the order. Please try again.', 'error'); }
    finally { setBusy(false); }
  };

  const finalReason = reason === 'Other' ? other.trim() : reason;
  const canCancel = !!finalReason && (reason !== 'Other' || other.trim().length >= 5);

  const columns: DTColumn<Order>[] = [
    { key: 'code', header: 'Code', alwaysVisible: true, sortAccessor: (o) => o.code, render: (o) => (
      <span className="td-mono td-strong order-code" title={o.code} aria-label={`Order code ${o.code}`}>
        <span className="order-code-full" aria-hidden="true">{o.code}</span>
        <span className="order-code-compact" aria-hidden="true">{compactReference(o.code)}</span>
      </span>
    ) },
    { key: 'buyer', header: 'Buyer', sortAccessor: (o) => o.contact_name, render: (o) => <>{o.contact_name}<div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>{o.contact_phone}</div></> },
    { key: 'items', header: 'Items', align: 'right', sortAccessor: (o) => o.items?.length ?? 0, render: (o) => o.items?.length ?? 0 },
    { key: 'total', header: 'Total', align: 'right', sortAccessor: (o) => Number(o.total), render: (o) => <span className="td-strong">{money(o.total, o.currency)}</span> },
    { key: 'payment', header: 'Payment', defaultHidden: true, render: (o) => <span style={{ fontSize: '.8rem' }}>{String(o.payment_method) === 'cash_on_delivery' ? 'Cash on delivery' : String(o.payment_method).replace(/_/g, ' ')} · {o.payment_status === 'paid' ? 'Paid' : 'Unpaid'}</span> },
    { key: 'delivery', header: 'Delivery', defaultHidden: true, sortAccessor: (o) => o.city, render: (o) => <span style={{ fontSize: '.8rem' }}>{o.city}</span> },
    { key: 'status', header: 'Status', sortAccessor: (o) => o.status, render: (o) => <StatusBadge status={o.status} /> },
    { key: 'placed', header: 'Placed', sortAccessor: (o) => o.created_at, render: (o) => <span style={{ fontSize: '.8rem' }}>{dateTime(o.created_at)}</span> },
  ];

  return (
    <>
      <div className="dash-title"><h1>Orders</h1><p>Confirm, dispatch and complete buyer orders.</p></div>
      <Tabs value={tab} onChange={setTab} tabs={TABS as any} />

      <DataTable
        columns={columns}
        rows={orders}
        rowKey={(o) => o.id}
        loading={loading}
        emptyIcon="🧾"
        emptyTitle="No orders here"
        emptyText="When buyers check out, their orders appear here instantly."
        exportFilename="orders"
        storageKey="vendor-orders"
        rowActions={(o) => <button className="btn btn-outline btn-sm" onClick={() => setDetail(o)}>View</button>}
      />

      <Modal open={!!detail} title={`Order ${detail?.code ?? ''}`} onClose={closeDetail}
        footer={
          detail ? (
            cancelling ? (
              <>
                <button className="btn btn-ghost" disabled={busy} onClick={() => setCancelling(false)}>Keep order</button>
                <button className="btn btn-danger" disabled={busy || !canCancel} onClick={() => move(detail, 'cancelled', finalReason)}>
                  {busy ? 'Cancelling…' : 'Yes, cancel this order'}
                </button>
              </>
            ) : (
            <>
              {NEXT[detail.status]?.map((s) => (
                <button key={s} className={`btn ${s === 'cancelled' ? 'btn-danger' : 'btn-primary'}`} disabled={busy}
                  onClick={() => (s === 'cancelled' ? setCancelling(true) : move(detail, s))}>
                  {s === 'cancelled' ? 'Cancel order' : s === 'confirmed' ? 'Confirm order' : s === 'dispatched' ? 'Mark as dispatched' : 'Mark as delivered'}
                </button>
              ))}
              {NEXT[detail.status]?.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>No further action</span>}
            </>
            )
          ) : null
        }>
        {detail && cancelling && (
          <div role="group" aria-labelledby="cancel-h">
            <h3 id="cancel-h" style={{ marginTop: 0 }}>Cancel order {detail.code}?</h3>
            <p style={{ color: 'var(--text-muted)' }}>
              The buyer will be told the order is cancelled. {detail.payment_status === 'paid' ? 'This order is already paid, so it will be refunded.' : 'This cannot be undone.'}
            </p>
            <label htmlFor="cancel-reason" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Reason *</label>
            <select id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%' }}>
              <option value="">Choose a reason</option>
              {CANCEL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {reason === 'Other' && (
              <textarea aria-label="Describe the reason" value={other} onChange={(e) => setOther(e.target.value)}
                placeholder="Tell the buyer briefly why (at least 5 characters)" style={{ width: '100%', marginTop: 8 }} />
            )}
          </div>
        )}
        {detail && !cancelling && (
          <>
            <div className="row-between mb-2">
              <StatusBadge status={detail.status} />
              <strong style={{ color: 'var(--accent-hover)' }}>{money(detail.total, detail.currency)}</strong>
            </div>
            {detail.status === 'delivered_pending_verification' && (
              <p style={{ color: 'var(--muted)', fontSize: '.85rem', margin: '0 0 12px' }}>
                Delivered. Waiting for the buyer to confirm receipt. If they do not respond, the order completes automatically and the payout is released.
              </p>
            )}
            <table className="tbl mb-2">
              <thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Line</th></tr></thead>
              <tbody>
                {detail.items?.map((i, k) => (
                  <tr key={k}><td>{i.title}</td><td>{i.qty} {i.unit || ''}</td><td>{money(i.unit_price, detail.currency)}</td><td className="td-strong">{money(i.line_total, detail.currency)}</td></tr>
                ))}
              </tbody>
            </table>
            <dl className="kv">
              <dt>Buyer</dt><dd>{detail.contact_name}</dd>
              <dt>Phone</dt><dd>{detail.contact_phone}</dd>
              <dt>Address</dt><dd>{detail.delivery_address}, {detail.city}, {detail.country}</dd>
              <dt>Payment</dt><dd>{String(detail.payment_method) === 'cash_on_delivery' ? 'Cash on delivery' : String(detail.payment_method).replace(/_/g, ' ')} · {detail.payment_status === 'paid' ? 'Paid' : 'Unpaid'}</dd>
              <dt>Placed</dt><dd>{dateTime(detail.created_at)}</dd>
              {detail.note && <><dt>Buyer note</dt><dd>{detail.note}</dd></>}
            </dl>
          </>
        )}
      </Modal>
    </>
  );
}
