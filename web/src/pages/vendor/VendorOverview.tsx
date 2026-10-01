import { useState } from 'react';
import { useAuth } from '../../state/AuthContext';
import { useVendorDashboard } from '../../state/VendorDashboardContext';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { money, num, dateTime, compactReference } from '../../lib/format';
import { Empty, Spinner, Stat, StatusBadge } from '../../components/ui';
import { exportExcel, exportPdf } from '../../lib/exporting';

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

export default function VendorOverview() {
  const { vendor } = useAuth();
  const { data: d, bookings, loading, error, bookingError, updatedAt, refresh } = useVendorDashboard();
  const [period, setPeriod] = useState(30);
  if (loading && !d) return <Spinner />;
  if (!d) return <Empty icon="📊" title="Could not load dashboard" text={error || 'Please try again.'}
    action={<button className="btn btn-primary" onClick={() => void refresh()}>Try again</button>} />;

  const summaryReport = {
    filename: 'sokoni-store-summary',
    title: `${d.vendor.business_name} — Store summary`,
    subtitle: 'Store performance snapshot · All-time totals unless noted',
    columns: [
      { header: 'Metric', value: (row: [string, unknown]) => row[0].replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) },
      { header: 'Value', value: (row: [string, unknown]) => row[1] },
    ],
    rows: Object.entries(d.stats) as [string, unknown][],
  };
  const exportSummaryExcel = () => exportExcel(summaryReport);
  const exportSummaryPdf = () => { void exportPdf(summaryReport); };
  const storeSlug = vendor?.slug?.trim();
  const s = d.stats;
 const cur = 'QAR';
  const trend = d.salesTrend.slice(-period).map((t: any) => ({ ...t, label: t.day.slice(5) }));

  return (
    <>
      <div className="dash-title vendor-welcome">
        <div>
          <span className="vendor-eyebrow">YOUR STORE AT A GLANCE</span>
          <h1>{d.vendor.business_name}</h1>
          <p>Your business, in focus. Store totals are all-time; the revenue chart shows recent activity.</p>
        </div>
        <div className="actions">
          {storeSlug ? (
            <Link className="btn btn-outline" to={`/store/${encodeURIComponent(storeSlug)}`}>View storefront ↗</Link>
          ) : (
            <button className="btn btn-outline" disabled title="Your store address is unavailable. Refresh your account or contact support.">Storefront unavailable</button>
          )}
          <Link className="btn btn-primary" to="/vendor/listings/new">+ Add listing</Link>
        </div>
      </div>
      <div className="vendor-sync">
        <span role="status">{loading ? 'Refreshing store data…' : updatedAt ? `Last updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Store overview'}</span>
        <div className="row">
          <button className="btn btn-ghost btn-sm" disabled={loading} onClick={() => void refresh()}>Refresh</button>
          <button className="btn btn-outline btn-sm" onClick={exportSummaryExcel}>Export Excel</button>
          <button className="btn btn-outline btn-sm" onClick={exportSummaryPdf}>Export PDF</button>
        </div>
      </div>
      {(error || bookingError) && <div className="alert alert-warn" role="alert">{error || bookingError} Previously loaded data may be out of date. Use Refresh to retry.</div>}
      <section className="card vendor-attention mb-3">
        <div className="card-head"><h3>Needs your attention</h3><span className="vendor-eyebrow">STORE OPERATIONS</span></div>
        <div className="vendor-task-grid">
          <Link to="/vendor/orders"><strong>{num(s.orders_pending)}</strong><span>Pending orders</span><small>Review and fulfil →</small></Link>
          <Link to="/vendor/bookings"><strong>{bookings ? num(bookings.new) : '—'}</strong><span>New booking requests</span><small>{bookingError ? 'Counts unavailable · open inbox →' : 'Open booking inbox →'}</small></Link>
          {Number(s.products_tracked) > 0 && <Link to="/vendor/inventory"><strong>{num(Number(s.out_of_stock) + Number(s.low_stock))}</strong><span>Stock alerts</span><small>Review reorder points →</small></Link>}
          <Link to="/vendor/complaints"><strong>{num(s.open_complaints)}</strong><span>Open complaints</span><small>Respond to customers →</small></Link>
        </div>
      </section>

      <div className="grid grid-stats mb-3">
        <Stat accent="terra" label="Active listings" value={num(s.listings_active)} sub={`${s.products_active} products · ${s.services_active} services`} />
        <Stat accent="green" label="Revenue (delivered)" value={money(s.revenue_delivered, cur)} sub={`${money(s.revenue_pipeline, cur)} incl. in-progress`} />
        <Stat accent="blue" label="Orders" value={num(s.orders_total)} sub={`${s.orders_pending} pending · ${s.orders_delivered} delivered`} />
        <Stat accent="gold" label="Total views" value={num(s.total_views)} sub="Across all your listings" />
        {/* Products only, and only when there are products to count. A services
            vendor has no stock, so a card reading 0 / 0 is pure noise. The
            threshold is now per-vendor, so the old "(≤5)" caption would lie. */}
        {Number(s.products_tracked ?? 0) > 0 && (
          <Stat accent={Number(s.out_of_stock) > 0 ? 'red' : Number(s.low_stock) > 0 ? 'gold' : 'green'}
            label="Stock alerts" value={`${s.out_of_stock} / ${s.low_stock}`}
            sub="Out of stock / at reorder point" />
        )}
        <Stat accent="gold" label="Store rating" value={Number(vendor?.rating_count) > 0 ? Number(vendor?.rating_avg).toFixed(1) : '—'} sub={`${num(vendor?.rating_count || 0)} customer reviews`} />
        <Stat accent={Number(s.open_complaints) > 0 ? 'red' : 'green'} label="Open complaints" value={num(s.open_complaints)} sub="Filed against your store" />
      </div>

      <div className="grid grid-2 mb-3">
        <div className="card">
          <div className="card-head"><div><h4>Order value — last {period} days</h4><div className="sub">Excludes cancelled orders · QAR</div></div><div className="btn-group" aria-label="Chart period">{[7, 30].map(days => <button key={days} aria-pressed={period === days} onClick={() => setPeriod(days)}>{days}d</button>)}</div></div>
          <div className="card-body">
            <div className="chart-box">
              <ResponsiveContainer>
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} interval={4} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} width={48} />
                  <Tooltip formatter={(v: any) => money(v, cur)} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" strokeWidth={2} fill="url(#rev)" />
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
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="short" tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} width={40} />
                    <Tooltip />
                    <Bar dataKey="views" fill="var(--chart-2)" radius={[6, 6, 0, 0]} name="Views" />
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
                      <td className="td-strong"><Link to={`/vendor/listings/${t.id}/edit`}>{t.title}</Link></td>
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
                  <td>
                    <span className="td-mono order-code" title={o.code} aria-label={`Order code ${o.code}`}>
                      <span className="order-code-full" aria-hidden="true">{o.code}</span>
                      <span className="order-code-compact" aria-hidden="true">{compactReference(o.code)}</span>
                    </span>
                  </td>
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
