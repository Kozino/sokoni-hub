import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { api } from '../../lib/api';
import { money, num, dateTime } from '../../lib/format';
import { Empty, Spinner, Stat, StatusBadge } from '../../components/ui';

const COLORS = ['#2E3B6E', '#3D7A4E', '#D98E2B', '#2B5F8A', '#8B84A0'];

export default function VendorOverview() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>('/vendors/dashboard').then(setD).catch(() => setD(null)).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!d) return <Empty icon="📊" title="Could not load dashboard" text="Please refresh the page." />;

  const s = d.stats;
  const cur = 'USD';
  const trend = d.salesTrend.map((t: any) => ({ ...t, label: t.day.slice(5) }));

  return (
    <>
      <div className="dash-title">
        <h1>Overview</h1>
        <p>How your store is performing over the last 30 days.</p>
      </div>

      <div className="grid grid-stats mb-3">
        <Stat accent="terra" label="Active listings" value={num(s.listings_active)} sub={`${s.products_active} products · ${s.services_active} services`} />
        <Stat accent="green" label="Revenue (delivered)" value={money(s.revenue_delivered, cur)} sub={`${money(s.revenue_pipeline, cur)} incl. in-progress`} />
        <Stat accent="blue" label="Orders" value={num(s.orders_total)} sub={`${s.orders_pending} pending · ${s.orders_delivered} delivered`} />
        <Stat accent="gold" label="Total views" value={num(s.total_views)} sub="Across all your listings" />
        <Stat accent={Number(s.out_of_stock) > 0 ? 'red' : 'green'} label="Stock alerts" value={`${s.out_of_stock} / ${s.low_stock}`} sub="Out of stock / low (≤5)" />
        <Stat accent={Number(s.open_complaints) > 0 ? 'red' : 'green'} label="Open complaints" value={num(s.open_complaints)} sub="Filed against your store" />
      </div>

      <div className="grid grid-2 mb-3">
        <div className="card">
          <div className="card-head"><h4>Revenue — last 30 days</h4></div>
          <div className="card-body">
            <div className="chart-box">
              <ResponsiveContainer>
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2E3B6E" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#2E3B6E" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6DFCD" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8B84A0' }} interval={4} />
                  <YAxis tick={{ fontSize: 11, fill: '#8B84A0' }} width={48} />
                  <Tooltip formatter={(v: any) => money(v, cur)} />
                  <Area type="monotone" dataKey="revenue" stroke="#2E3B6E" strokeWidth={2} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h4>Orders by status</h4></div>
          <div className="card-body">
            {d.byStatus.length === 0 ? <Empty icon="🧾" title="No orders yet" text="Orders will appear once buyers check out." /> : (
              <div className="chart-box">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={d.byStatus} dataKey="count" nameKey="status" innerRadius={55} outerRadius={90} paddingAngle={3}>
                      {d.byStatus.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-head">
          <h4>Top performing listings</h4>
          <Link to="/vendor/listings" className="btn btn-outline btn-sm">Manage all</Link>
        </div>
        {d.topListings.length === 0 ? (
          <Empty icon="📦" title="No listings yet" text="Add your first product or service." action={<Link to="/vendor/listings/new" className="btn btn-primary">Add listing</Link>} />
        ) : (
          <>
            <div className="card-body" style={{ paddingBottom: 0 }}>
              <div className="chart-box-sm">
                <ResponsiveContainer>
                  <BarChart data={d.topListings.slice(0, 6).map((t: any) => ({ ...t, short: t.title.slice(0, 14) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6DFCD" vertical={false} />
                    <XAxis dataKey="short" tick={{ fontSize: 11, fill: '#8B84A0' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#8B84A0' }} width={40} />
                    <Tooltip />
                    <Bar dataKey="views" fill="#3D7A4E" radius={[6, 6, 0, 0]} name="Views" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Listing</th><th>Type</th><th>Price</th><th>Stock</th><th>Views</th><th>Units sold</th><th>Revenue</th></tr></thead>
                <tbody>
                  {d.topListings.map((t: any) => (
                    <tr key={t.id}>
                      <td className="td-strong">{t.title}</td>
                      <td style={{ textTransform: 'capitalize' }}>{t.kind}</td>
                      <td>{money(t.price, cur)}</td>
                      <td>{t.kind === 'product' ? `${t.quantity ?? 0} ${t.unit || ''}` : '—'}</td>
                      <td>{num(t.views)}</td>
                      <td>{num(t.units_sold)}</td>
                      <td className="td-strong">{money(t.revenue, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h4>Recent orders</h4><Link to="/vendor/orders" className="btn btn-outline btn-sm">All orders</Link></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Code</th><th>Buyer</th><th>City</th><th>Payment</th><th>Total</th><th>Status</th><th>Placed</th></tr></thead>
            <tbody>
              {d.recentOrders.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)' }}>No orders yet</td></tr>}
              {d.recentOrders.map((o: any) => (
                <tr key={o.id}>
                  <td className="td-mono">{o.code}</td>
                  <td>{o.contact_name}</td>
                  <td>{o.city}</td>
                  <td style={{ textTransform: 'capitalize', fontSize: '.8rem' }}>{o.payment_method.replace(/_/g, ' ')}</td>
                  <td className="td-strong">{money(o.total, o.currency)}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>{dateTime(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
