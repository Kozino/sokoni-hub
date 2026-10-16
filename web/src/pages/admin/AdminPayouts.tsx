import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Alert, StatusBadge } from '../../components/ui';
import { money, dateTime } from '../../lib/format';

export function AdminPayouts() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      const { payouts } = await api.get<{ payouts: any[] }>('/admin/payouts');
      setPayouts(payouts);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to load payouts');
    }
  };

  useEffect(() => { load(); }, []);

  const markPaid = async (id: string) => {
    if (!window.confirm('Mark this payout as successfully paid in the bank?')) return;
    try {
      await api.post(`/admin/payouts/${id}/mark-paid`, {});
      setMsg('Payout marked as paid!');
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Update failed');
    }
  };

  const pending = payouts.filter(p => p.status === 'pending' || p.status === 'processing');
  const paid = payouts.filter(p => p.status === 'paid');

  return (
    <div>
      <h2>Vendor Payouts</h2>
      <p style={{ color: 'var(--muted)' }}>Manage and process bank transfer requests from vendors.</p>
      
      {err && <Alert kind="error">{err}</Alert>}
      {msg && <Alert kind="success">{msg}</Alert>}

      <div className="card mt-3">
        <div className="card-head"><h3>Action Required: Pending Payouts</h3></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Date Requested</th><th>Vendor</th><th>Bank Details</th><th style={{ textAlign: 'right' }}>Amount</th><th>Action</th></tr>
            </thead>
            <tbody>
              {pending.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>No pending payouts</td></tr>}
              {pending.map(p => (
                <tr key={p.id}>
                  <td>{dateTime(p.created_at)}</td>
                  <td>
                    <strong>{p.business_name}</strong><br/>
                    <small>{p.whatsapp}</small>
                  </td>
                  <td>
                    {p.bank_name}<br/>
                    {p.bank_account_name}<br/>
                    <code style={{ fontSize: '0.8rem' }}>{p.bank_iban}</code>
                  </td>
                  <td className="td-strong" style={{ textAlign: 'right' }}>{money(p.amount, p.currency)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => markPaid(p.id)}>Mark Paid</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-head"><h3>Recently Paid</h3></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Paid At</th><th>Vendor</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
            </thead>
            <tbody>
              {paid.slice(0, 50).length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)' }}>No recent payouts</td></tr>}
              {paid.slice(0, 50).map(p => (
                <tr key={p.id}>
                  <td>{dateTime(p.paid_at || p.updated_at)}</td>
                  <td>{p.business_name}</td>
                  <td className="td-strong" style={{ textAlign: 'right' }}>{money(p.amount, p.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
