import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Alert, Field, StatusBadge } from '../../components/ui';
import { money, dateTime } from '../../lib/format';
import { useAuth } from '../../state/AuthContext';

export function VendorWallet() {
  const { vendor } = useAuth();
  const [wallet, setWallet] = useState<any>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [bank, setBank] = useState({ bank_name: '', bank_account_name: '', bank_iban: '' });
  const [reqAmount, setReqAmount] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      const w = await api.get<{ wallet: any }>('/wallet');
      const t = await api.get<{ transactions: any[] }>('/wallet/transactions');
      setWallet(w.wallet);
      setTxs(t.transactions);
      setBank({
        bank_name: w.wallet.bank_name || '',
        bank_account_name: w.wallet.bank_account_name || '',
        bank_iban: w.wallet.bank_iban || ''
      });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not load wallet');
    }
  };

  useEffect(() => { load(); }, []);

  const saveBank = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      await api.put('/wallet/bank', bank);
      setMsg('Bank details saved.');
      await load();
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Save failed'); }
  };

  const requestPayout = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      await api.post('/wallet/payout', { amount: Number(reqAmount) });
      setMsg('Payout requested successfully!');
      setReqAmount('');
      await load();
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Payout request failed'); }
  };

  return (
    <div className="card card-pad">
      <h2>Wallet &amp; Earnings</h2>
      {err && <Alert kind="error">{err}</Alert>}
      {msg && <Alert kind="success">{msg}</Alert>}
      
      {wallet && (
        <div className="grid grid-2 mt-2">
          <div className="card card-pad" style={{ background: 'var(--green)', color: '#fff' }}>
            <h3 style={{ color: '#fff' }}>Available to Withdraw</h3>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{money(wallet.wallet_available, 'QAR')}</div>
          </div>
          <div className="card card-pad">
            <h3>Pending (Escrow)</h3>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--muted)' }}>{money(wallet.wallet_pending, 'QAR')}</div>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>Funds move to available once delivery is completed.</p>
          </div>
        </div>
      )}

      <h3 className="mt-4">Withdraw Funds</h3>
      {!wallet?.bank_iban ? (
        <Alert kind="warn">Please save your bank details below to request a payout.</Alert>
      ) : (
        <form onSubmit={requestPayout} className="form-row mt-2" style={{ alignItems: 'flex-end' }}>
          <Field label="Amount to withdraw (QAR)">
            <input type="number" step="0.01" max={wallet?.wallet_available} value={reqAmount} onChange={e => setReqAmount(e.target.value)} required />
          </Field>
          <button className="btn btn-primary" disabled={!Number(reqAmount) || Number(reqAmount) > wallet?.wallet_available}>Request Payout</button>
        </form>
      )}

      <h3 className="mt-4">Bank Details</h3>
      <form onSubmit={saveBank}>
        <div className="form-row">
          <Field label="Bank Name"><input required value={bank.bank_name} onChange={e => setBank({ ...bank, bank_name: e.target.value })} /></Field>
          <Field label="Account Name"><input required value={bank.bank_account_name} onChange={e => setBank({ ...bank, bank_account_name: e.target.value })} /></Field>
        </div>
        <Field label="IBAN"><input required value={bank.bank_iban} onChange={e => setBank({ ...bank, bank_iban: e.target.value })} minLength={10} /></Field>
        <button className="btn btn-outline mt-2">Save Bank Details</button>
      </form>

      <h3 className="mt-4">Transaction Ledger</h3>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Date</th><th>Type</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
          </thead>
          <tbody>
            {txs.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>No transactions yet</td></tr>}
            {txs.map(tx => (
              <tr key={tx.id}>
                <td>{dateTime(tx.created_at)}</td>
                <td style={{ textTransform: 'capitalize' }}>{tx.type.replace(/_/g, ' ')}</td>
                <td>{tx.description}</td>
                <td className="td-strong" style={{ textAlign: 'right', color: tx.amount < 0 ? 'var(--danger)' : 'var(--green)' }}>
                  {tx.amount > 0 ? '+' : ''}{money(tx.amount, tx.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
