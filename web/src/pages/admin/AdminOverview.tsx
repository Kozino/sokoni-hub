import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { api } from '../../lib/api';
import { money, num, timeAgo } from '../../lib/format';
import { Empty, Spinner, Stat } from '../../components/ui';

export default function AdminOverview() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get<any>('/admin/overview').then(setD).catch(() => setD(null)).finally(() => setLoading(false)); }, []);

  if (loading) return <Spinner />;
  if (!d) return <Empty icon="📈" title="Could not load analytics" />;
  const s = d.stats;

  return (
    <>
      <div className="dash-title"><h1>Platform overview</h1><p>Everything happening on Sokoni Hub right now.</p></div>

      {Number(s.vendors_pending) > 0 && (
        <div className="alert alert-warn row-between">
          <span><strong>{s.vendors_pending} vendor{Number(s.vendors_pending) === 1 ? '' : 's'}</strong> waiting for verification.</span>
          <Link to="/admin/vendors?status=pending" className="btn btn-primary btn-sm">Review now</Link>
        </div>
      )}
      {Number(s.complaints_open) > 0 && (
        <div className="alert alert-error row-between">
          <span><strong>{s.complaints_open} open complaint{Number(s.complaints_open) === 1 ? '' : 's'}</strong> need attention.</span>
          <Link to="/admin/complaints?status=open" className="btn btn-danger btn-sm">Handle</Link>
        </div>
      )}

      <div className="grid grid-stats mb-3">
        <Stat accent="terra" label="Total users" value={num(s.users_total)} sub={`${s.users_7d} joined in 7 days`} />
        <Stat accent="green" label="Verified vendors" value={num(s.vendors_verified)} sub={`${s.vendors_total} registered total`} />
        <Stat accent="gold" label="Pending verification" value={num(s.vendors_pending)} sub={`${s.vendors_rejected} rejected · ${s.vendors_suspended} suspended`} />
        <Stat accent="blue" label="Active listings" value={num(s.listings_active)} sub={`${s.products_active} products · ${s.services_active} services`} />
        <Stat accent="terra" label="Orders" value={num(s.orders_total)} sub={`${s.orders_7d} in the last 7 days`} />
        <Stat accent="green" label="GMV" value={money(s.gmv)} sub="Excluding cancelled orders" />
        <Stat accent={Number(s.complaints_open) > 0 ? 'red' : 'green'} label="Open complaints" value={num(s.complaints_open)} sub={`${s.complaints_total} filed all-time`} />
        <Stat accent="blue" label="Buyers" value={num(s.buyers)} sub={`${s.vendors_users} vendor accounts`} />
      </div>

      <div className="grid grid-2 mb-3">
        <div className="card">
          <div className="card-head"><h4>New signups — 30 days</h4></div>
          <div className="card-body"><div className="chart-box">
            <ResponsiveContainer>
              <AreaChart data={d.signupTrend.map((t: any) => ({ ...t, label: t.day.slice(5) }))}>
                <defs>
                  <linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14653C" stopOpacity={.45} /><stop offset="100%" stopColor="#14653C" stopOpacity={.02} /></linearGradient>
                  <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C8562B" stopOpacity={.4} /><stop offset="100%" stopColor="#C8562B" stopOpacity={.02} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E9E2DC" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8A7F78' }} interval={4} />
                <YAxis tick={{ fontSize: 11, fill: '#8A7F78' }} width={34} allowDecimals={false} />
                <Tooltip /><Legend />
                <Area type="monotone" dataKey="vendors" stroke="#14653C" strokeWidth={2} fill="url(#v)" name="Vendors" />
                <Area type="monotone" dataKey="buyers" stroke="#C8562B" strokeWidth={2} fill="url(#b)" name="Buyers" />
              </AreaChart>
            </ResponsiveContainer>
          </div></div>
        </div>

        <div className="card">
          <div className="card-head"><h4>Orders &amp; GMV — 30 days</h4></div>
          <div className="card-body"><div className="chart-box">
            <ResponsiveContainer>
              <LineChart data={d.orderTrend.map((t: any) => ({ ...t, label: t.day.slice(5) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E9E2DC" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8A7F78' }} interval={4} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: '#8A7F78' }} width={34} allowDecimals={false} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: '#8A7F78' }} width={52} />
                <Tooltip /><Legend />
                <Line yAxisId="l" type="monotone" dataKey="orders" stroke="#1565C0" strokeWidth={2} dot={false} name="Orders" />
                <Line yAxisId="r" type="monotone" dataKey="gmv" stroke="#E0A32E" strokeWidth={2} dot={false} name="GMV" />
              </LineChart>
            </ResponsiveContainer>
          </div></div>
        </div>
      </div>

      <div className="grid grid-2 mb-3">
        <div className="card">
          <div className="card-head"><h4>Listings by category</h4></div>
          <div className="card-body"><div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={d.byCategory} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E9E2DC" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#8A7F78' }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#8A7F78' }} width={125} />
                <Tooltip />
                <Bar dataKey="listings" fill="#C8562B" radius={[0, 6, 6, 0]} name="Listings" />
              </BarChart>
            </ResponsiveContainer>
          </div></div>
        </div>

        <div className="card">
          <div className="card-head"><h4>Top vendors by GMV</h4><Link to="/admin/vendors" className="btn btn-outline btn-sm">All vendors</Link></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Store</th><th>City</th><th>Listings</th><th>Rating</th><th>GMV</th></tr></thead>
              <tbody>
                {d.topVendors.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>No verified vendors yet</td></tr>}
                {d.topVendors.map((v: any, i: number) => (
                  <tr key={i}>
                    <td className="td-strong">{v.business_name}</td><td>{v.city}</td><td>{v.listings}</td>
                    <td>{Number(v.rating_avg) > 0 ? `★ ${Number(v.rating_avg).toFixed(1)}` : '—'}</td>
                    <td className="td-strong">{money(v.gmv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h4>Recent activity</h4><Link to="/admin/audit" className="btn btn-outline btn-sm">Full log</Link></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Action</th><th>Entity</th><th>Actor</th><th>When</th></tr></thead>
            <tbody>
              {d.recentActivity.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>No activity yet</td></tr>}
              {d.recentActivity.map((a: any, i: number) => (
                <tr key={i}>
                  <td className="td-strong">{a.action}</td>
                  <td>{a.entity}{a.meta?.business_name ? ` — ${a.meta.business_name}` : a.meta?.title ? ` — ${a.meta.title}` : ''}</td>
                  <td>{a.actor || 'system'}</td>
                  <td>{timeAgo(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
