import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { money, dateTime } from '../lib/format';
import { Alert, Badge } from './ui';
import ImageUploader from './ImageUploader';

// The vendor's Sokoni Hub bill for booking fees, shown on the Wallet page.
// One bill per calendar month. A bill is paid by bank transfer (reference + receipt, then the admin
// confirms it), or it is deducted automatically from the next wallet payout.

type BillFee = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  booking_code: string;
  service: string | null;
  scheduled_at: string | null;
};

type Bill = {
  id: string;
  period_start: string;
  period_end: string;
  amount: number;
  currency: string;
  status: 'open' | 'submitted' | 'paid' | 'void';
  due_date: string;
  payment_reference: string | null;
  receipt_url: string | null;
  submitted_at: string | null;
  paid_at: string | null;
  paid_from_wallet: boolean;
  admin_note: string | null;
  fees: BillFee[];
};

type Summary = {
  bills: Bill[];
  pending: { amount: number; count: number };
  payment_instructions: string;
  due_days: number;
};

const TONE: Record<Bill['status'], 'gold' | 'blue' | 'green' | 'grey' | 'red'> = {
  open: 'gold',
  submitted: 'blue',
  paid: 'green',
  void: 'grey',
};

const LABEL: Record<Bill['status'], string> = {
  open: 'Due',
  submitted: 'Awaiting confirmation',
  paid: 'Paid',
  void: 'Void',
};

const monthName = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Qatar' });

const dateOnly = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Qatar' });

export function ServiceFeeBillsVendor() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [receipt, setReceipt] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState('');

  const load = () =>
    api
      .get<Summary>('/vendors/me/service-fee-bills')
      .then((r) => setData(r))
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void load();
  }, []);

  if (error) return <Alert kind="error">Could not load your Sokoni Hub bill: {error}</Alert>;
  if (!data) return null;
  if (!data.bills.length && !data.pending.count) return null;

  const openTotal = data.bills.filter((b) => b.status === 'open').reduce((s, b) => s + Number(b.amount), 0);

  const submit = async (billId: string) => {
    setFormError('');
    if (reference.trim().length < 3) return setFormError('Enter the bank transfer reference.');
    if (!receipt[0]) return setFormError('Upload a photo or PDF of the transfer receipt.');
    setBusy(true);
    try {
      await api.post(`/vendors/me/service-fee-bills/${billId}/payment`, { reference: reference.trim(), receipt_url: receipt[0] });
      setPayingId(null);
      setReference('');
      setReceipt([]);
      setDone('Thank you. We will confirm your transfer and update this bill.');
      await load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Could not send your payment details. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>Sokoni Hub bill</h2>
        <span style={{ fontSize: '.95rem' }}>
          Owed now: <strong>{money(openTotal)}</strong>
        </span>
      </div>
      <p style={{ color: 'var(--muted)', margin: '6px 0 12px', fontSize: '.88rem' }}>
        Booking fees for services, billed once a month. Pay by bank transfer, or we deduct it from your next wallet payout
        automatically. Cancelled bookings are not charged.
      </p>

      {data.pending.count > 0 ? (
        <div style={{ padding: 12, borderRadius: 10, background: 'rgba(15,23,42,.04)', marginBottom: 12, fontSize: '.9rem' }}>
          This month so far: <strong>{money(data.pending.amount)}</strong> across {data.pending.count} booking{data.pending.count === 1 ? '' : 's'}.
          It will appear on your bill after the month closes.
        </div>
      ) : null}

      {done ? <Alert kind="success">{done}</Alert> : null}

      {data.bills.map((b) => {
        const open = openId === b.id;
        return (
          <div key={b.id} style={{ borderTop: '1px solid var(--border, #eee)', padding: '12px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <strong>{monthName(b.period_start)}</strong>
                <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                  {b.fees.length} booking{b.fees.length === 1 ? '' : 's'} · due {dateOnly(b.due_date)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <strong>{money(Number(b.amount))}</strong>
                <Badge tone={TONE[b.status]}>{LABEL[b.status]}</Badge>
              </div>
            </div>

            {b.status === 'open' && b.admin_note ? (
              <Alert kind="warn">Your last transfer was not accepted: {b.admin_note}</Alert>
            ) : null}
            {b.status === 'submitted' ? (
              <p style={{ fontSize: '.85rem', margin: '6px 0 0', color: 'var(--muted)' }}>
                Transfer reference {b.payment_reference}. We are checking it.
              </p>
            ) : null}
            {b.status === 'paid' ? (
              <p style={{ fontSize: '.85rem', margin: '6px 0 0', color: 'var(--muted)' }}>
                {b.paid_from_wallet ? 'Deducted from your wallet balance' : `Paid by transfer${b.payment_reference ? `, reference ${b.payment_reference}` : ''}`}
                {b.paid_at ? ` on ${dateOnly(b.paid_at)}` : ''}.
              </p>
            ) : null}

            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => setOpenId(open ? null : b.id)} style={{ padding: '4px 10px', fontSize: '.85rem' }}>
                {open ? 'Hide bookings' : 'View bookings'}
              </button>
              {b.status === 'open' && payingId !== b.id ? (
                <button className="btn btn-primary" onClick={() => { setPayingId(b.id); setFormError(''); setDone(''); }} style={{ padding: '4px 10px', fontSize: '.85rem' }}>
                  Pay by bank transfer
                </button>
              ) : null}
            </div>

            {open ? (
              <div style={{ marginTop: 10, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                      <th style={{ padding: 4 }}>Booking</th>
                      <th style={{ padding: 4 }}>Service</th>
                      <th style={{ padding: 4 }}>Date</th>
                      <th style={{ padding: 4, textAlign: 'right' }}>Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.fees.map((f) => (
                      <tr key={f.id} style={{ borderTop: '1px solid var(--border, #f1f5f9)' }}>
                        <td style={{ padding: 4 }}>{f.booking_code}</td>
                        <td style={{ padding: 4 }}>{f.service || '—'}</td>
                        <td style={{ padding: 4 }}>{f.scheduled_at ? dateTime(f.scheduled_at) : dateOnly(f.created_at)}</td>
                        <td style={{ padding: 4, textAlign: 'right' }}>
                          {money(Number(f.amount))}
                          {f.status === 'void' ? <span style={{ color: 'var(--muted)' }}> (cancelled)</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {payingId === b.id ? (
              <div style={{ marginTop: 12, padding: 14, borderRadius: 10, border: '1px solid var(--border, #e5e7eb)' }}>
                <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Pay {money(Number(b.amount))} by bank transfer</p>
                <p style={{ margin: '0 0 12px', fontSize: '.88rem', whiteSpace: 'pre-line' }}>
                  {data.payment_instructions || 'Ask Sokoni Hub support for our bank details before you transfer.'}
                </p>
                <label style={{ display: 'block', marginBottom: 10 }}>
                  <span style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, marginBottom: 4 }}>Transfer reference</span>
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    maxLength={120}
                    placeholder="e.g. the reference from your bank"
                    style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--border, #e5e7eb)' }}
                  />
                </label>
                <span style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, marginBottom: 4 }}>Transfer receipt</span>
                <ImageUploader value={receipt} onChange={setReceipt} max={1} label="Upload receipt" purpose="service-fee-receipt" />
                {formError ? <Alert kind="error">{formError}</Alert> : null}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-primary" disabled={busy} onClick={() => void submit(b.id)}>
                    {busy ? 'Sending…' : 'Send payment details'}
                  </button>
                  <button className="btn" disabled={busy} onClick={() => setPayingId(null)}>Cancel</button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      <p style={{ fontSize: '.8rem', color: 'var(--muted)', margin: '10px 0 0' }}>
        Bills are due {data.due_days} days after the month ends. Each bill lists the bookings it covers.
      </p>
    </div>
  );
}
