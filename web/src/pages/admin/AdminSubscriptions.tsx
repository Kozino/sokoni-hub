import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Spinner, Alert } from '../../components/ui';
import type { VendorSubscription } from '../../types';

export default function AdminSubscriptions() {
  const [subs, setSubs] = useState<VendorSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{subscriptions: VendorSubscription[]}>('/admin/subscriptions').then(r => setSubs(r.subscriptions)).catch(()=>{}).finally(() => setLoading(false));
  }, []);

  const approve = async (id: string) => {
    if (!confirm('Approve this payment and unlock features?')) return;
    setBusy(true);
    try {
      await api.post(`/admin/subscriptions/${id}/approve`);
      setSubs(subs.map(s => s.id === id ? {...s, status: 'approved'} : s));
    } catch(e:any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const reject = async (id: string) => {
    const note = prompt('Reason for rejection (optional):');
    if (note === null) return;
    setBusy(true);
    try {
      await api.post(`/admin/subscriptions/${id}/reject`, { note });
      setSubs(subs.map(s => s.id === id ? {...s, status: 'rejected', admin_note: note} : s));
    } catch(e:any) { alert(e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="dash-header">
        <h1>Subscriptions & Payments</h1>
      </div>
      
      <div className="card">
        <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Date</th><th>Vendor</th><th>Plan</th><th>Amount</th><th>Method</th><th>Receipt</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {subs.length === 0 ? <tr><td colSpan={8} style={{textAlign:'center', padding: 20}}>No subscription requests yet.</td></tr> : null}
            {subs.map(s => (
              <tr key={s.id} style={{ borderTop: '1px solid #eee' }}>
                <td style={{padding: '12px 0'}}>{new Date(s.created_at).toLocaleDateString()}</td>
                <td style={{fontWeight:'bold'}}>{s.business_name}</td>
                <td style={{textTransform:'capitalize'}}>{s.plan} ({s.months}mo)</td>
                <td>{s.amount} {s.currency}</td>
                <td>
                  <div>{s.payment_method.replace('_', ' ')}</div>
                  {s.reference && <div style={{fontSize: 11, color: '#666'}}>Ref: {s.reference}</div>}
                </td>
                <td>
                  {s.receipt_url ? <a href={s.receipt_url} target="_blank" rel="noreferrer" style={{color: 'var(--primary)', fontWeight:'bold', fontSize: 13}}>View Receipt</a> : <span style={{color: '#999', fontSize: 13}}>None</span>}
                </td>
                <td>
                  <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, background: s.status === 'approved' ? '#d4edda' : s.status === 'rejected' ? '#f8d7da' : '#fff3cd' }}>
                    {s.status}
                  </span>
                  {s.admin_note && <div style={{fontSize: 11, color: 'red', marginTop: 4}}>{s.admin_note}</div>}
                </td>
                <td>
                  {s.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => approve(s.id)} disabled={busy}>Approve</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => reject(s.id)} disabled={busy}>Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
