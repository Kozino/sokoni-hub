import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Alert } from '../../components/ui';
import { dateTime, money } from '../../lib/format';

// Cash and fee reconciliation for riders (QC item 5).
// Cash held   = cash collected on delivery - cash remitted.
// Fees owed   = delivery fees earned - fees paid out.
// The server refuses any entry that would take a balance below zero.

interface RiderCash {
  driver_id: string; user_id: string; status: string; full_name: string; phone: string;
  cash_collected: number; remitted: number; cash_held: number;
  fees_earned: number; fees_paid: number; fees_owed: number;
}
interface LedgerEntry {
  id: string; kind: 'cash_collected' | 'fee_earned' | 'remittance' | 'fee_paid'; amount: number;
  note: string | null; order_code: string | null; created_at: string; driver_name: string;
}

const KIND_LABEL: Record<LedgerEntry['kind'], string> = {
  cash_collected: 'Cash collected',
  fee_earned: 'Fee earned',
  remittance: 'Handed to Sokoni Hub',
  fee_paid: 'Fee paid out',
};

export function AdminDriverCash() {
  const [riders, setRiders] = useState<RiderCash[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ driver_id: '', kind: 'remittance' as 'remittance' | 'fee_paid', amount: '', note: '' });

  const load = async () => {
    try {
      const res = await api.get<{ drivers: RiderCash[]; entries: LedgerEntry[] }>('/admin/driver-cash');
      setRiders(res.drivers);
      setEntries(res.entries);
      setErr('');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not load rider cash');
    }
  };

  useEffect(() => { void load(); }, []);

  const record = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setMsg('');
    const amount = Number(form.amount);
    if (!form.driver_id) return setErr('Choose a rider.');
    if (!Number.isFinite(amount) || amount <= 0) return setErr('Enter an amount above zero.');
    if (form.note.trim().length < 3) return setErr('Add a short note, for example the receipt or payout reference.');
    setBusy(true);
    try {
      await api.post(`/admin/driver-cash/${form.driver_id}/entries`, { kind: form.kind, amount, note: form.note.trim() });
      setMsg(form.kind === 'remittance' ? 'Cash handed to Sokoni Hub recorded.' : 'Fee payout recorded.');
      setForm({ ...form, amount: '', note: '' });
      await load();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Could not record this entry');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card mt-3">
      <div className="card-head"><h3>Rider cash and fees</h3></div>
      <div className="card-pad">
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Cash taken from buyers on delivery, and the fees riders have earned. Record each handover and payout here.
        </p>
        {err && <Alert kind="error">{err}</Alert>}
        {msg && <Alert kind="success">{msg}</Alert>}

        <form onSubmit={record} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: '.8rem', fontWeight: 700 }}>Rider</span>
            <select value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}>
              <option value="">Choose…</option>
              {riders.map((r) => <option key={r.driver_id} value={r.driver_id}>{r.full_name}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: '.8rem', fontWeight: 700 }}>Type</span>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'remittance' | 'fee_paid' })}>
              <option value="remittance">Handed to Sokoni Hub</option>
              <option value="fee_paid">Fee paid out</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: '.8rem', fontWeight: 700 }}>Amount</span>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 4, flex: 1, minWidth: 180 }}>
            <span style={{ fontSize: '.8rem', fontWeight: 700 }}>Note</span>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Handed in at the office, receipt 123" />
          </label>
          <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Record'}</button>
        </form>

        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Rider</th><th>Cash held</th><th>Handed to Sokoni Hub</th><th>Fees owed</th><th>Fees paid out</th>
              </tr>
            </thead>
            <tbody>
              {riders.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No riders yet.</td></tr>}
              {riders.map((r) => (
                <tr key={r.driver_id}>
                  <td>{r.full_name}<div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{r.phone}</div></td>
                  <td className="td-strong">{money(r.cash_held, 'QAR')}</td>
                  <td>{money(r.remitted, 'QAR')}</td>
                  <td className="td-strong">{money(r.fees_owed, 'QAR')}</td>
                  <td>{money(r.fees_paid, 'QAR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 style={{ marginTop: 18 }}>Recent entries</h4>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>When</th><th>Rider</th><th>Entry</th><th>Amount</th><th>Order</th><th>Note</th></tr></thead>
            <tbody>
              {entries.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--muted)' }}>Nothing recorded yet.</td></tr>}
              {entries.map((l) => (
                <tr key={l.id}>
                  <td>{dateTime(l.created_at)}</td>
                  <td>{l.driver_name}</td>
                  <td>{KIND_LABEL[l.kind]}</td>
                  <td>{money(l.amount, 'QAR')}</td>
                  <td className="td-mono">{l.order_code || '—'}</td>
                  <td>{l.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
