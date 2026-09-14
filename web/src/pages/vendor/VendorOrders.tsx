import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { money, dateTime, waLink } from '../../lib/format';
import { Empty, Spinner, StatusBadge, Tabs, Modal } from '../../components/ui';
import { useToast } from '../../state/ToastContext';
import { useAuth } from '../../state/AuthContext';
import type { Order, OrderStatus } from '../../types';

const TABS: { id: string; label: string }[] = [
  { id: '', label: 'All' }, { id: 'pending', label: 'Pending' }, { id: 'confirmed', label: 'Confirmed' },
  { id: 'dispatched', label: 'Dispatched' }, { id: 'delivered', label: 'Delivered' }, { id: 'cancelled', label: 'Cancelled' },
];

const NEXT: Record<string, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['dispatched', 'cancelled'],
  dispatched: ['delivered', 'cancelled'],
  delivered: [], cancelled: [],
};

export default function VendorOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Order | null>(null);
  const { push } = useToast();
  const { vendor } = useAuth();

  const load = () => {
    setLoading(true);
    api.get<{ orders: Order[] }>(`/orders/vendor${tab ? `?status=${tab}` : ''}`)
      .then((r) => setOrders(r.orders)).catch(() => setOrders([])).finally(() => setLoading(false));
  };
  useEffect(load, [tab]);

  const move = async (o: Order, status: OrderStatus) => {
    try {
      await api.patch(`/orders/vendor/${o.id}/status`, { status });
      push(`Order ${o.code} → ${status}`, 'success');
      setDetail(null); load();
    } catch (e) { push(e instanceof ApiError ? e.message : 'Failed', 'error'); }
  };

  return (
    <>
      <div className="dash-title"><h1>Orders</h1><p>Confirm, dispatch and complete buyer orders.</p></div>
      <Tabs value={tab} onChange={setTab} tabs={TABS as any} />

      {loading ? <Spinner /> : orders.length === 0 ? (
        <Empty icon="🧾" title="No orders here" text="When buyers check out, their orders appear here instantly." />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Code</th><th>Buyer</th><th>Items</th><th>Total</th><th>Payment</th><th>Delivery</th><th>Status</th><th>Placed</th><th></th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="td-mono td-strong">{o.code}</td>
                  <td>{o.contact_name}<div style={{ fontSize: '.76rem', color: 'var(--muted)' }}>{o.contact_phone}</div></td>
                  <td>{o.items?.length ?? 0}</td>
                  <td className="td-strong">{money(o.total, o.currency)}</td>
                  <td style={{ fontSize: '.8rem', textTransform: 'capitalize' }}>{o.payment_method.replace(/_/g, ' ')}</td>
                  <td style={{ fontSize: '.8rem' }}>{o.city}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td style={{ fontSize: '.8rem' }}>{dateTime(o.created_at)}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => setDetail(o)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!detail} title={`Order ${detail?.code ?? ''}`} onClose={() => setDetail(null)}
        footer={
          detail ? (
            <>
              {NEXT[detail.status]?.map((s) => (
                <button key={s} className={`btn ${s === 'cancelled' ? 'btn-danger' : 'btn-primary'}`} onClick={() => move(detail, s)}>
                  Mark {s}
                </button>
              ))}
              {NEXT[detail.status]?.length === 0 && <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>No further action</span>}
            </>
          ) : null
        }>
        {detail && (
          <>
            <div className="row-between mb-2">
              <StatusBadge status={detail.status} />
              <strong style={{ color: 'var(--terra-dark)' }}>{money(detail.total, detail.currency)}</strong>
            </div>
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
              <dt>Payment</dt><dd style={{ textTransform: 'capitalize' }}>{detail.payment_method.replace(/_/g, ' ')}</dd>
              <dt>Placed</dt><dd>{dateTime(detail.created_at)}</dd>
              {detail.note && <><dt>Buyer note</dt><dd>{detail.note}</dd></>}
            </dl>
            <a className="btn btn-wa btn-block mt-2"
               href={waLink(detail.contact_phone, `Hello ${detail.contact_name}, this is ${vendor?.business_name || 'your vendor'} regarding your Sokoni Hub order ${detail.code}.`)}
               target="_blank" rel="noreferrer">Message buyer on WhatsApp</a>
          </>
        )}
      </Modal>
    </>
  );
}
