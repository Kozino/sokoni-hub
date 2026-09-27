import { useEffect, useState } from 'react';
import { api, ApiError, getToken } from '../../lib/api';
import { money, date, titleCase } from '../../lib/format';
import { Alert, Spinner, Empty, Field, Badge } from '../../components/ui';
import { useToast } from '../../state/ToastContext';

interface Statement {
  id: string; number: string | null; period_start: string; period_end: string;
  currency: string; status: string; order_count: number;
  gross_sales: string; commission_rate: string; commission_amount: string;
  net_due_to_platform: string; net_due_to_vendor: string;
  issued_at: string | null; paid_at: string | null; payment_reference: string | null;
}

interface Payout {
  bank_name: string | null; bank_account_name: string | null;
  bank_iban: string | null; payout_notes: string | null;
}

/** Documents sit behind an Authorization header, so open them as a blob. */
async function openDocument(path: string) {
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  const res = await fetch(`${base}/api${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, 'Could not open that statement');
  const url = URL.createObjectURL(await res.blob());
  const w = window.open(url, '_blank');
  if (!w) throw new ApiError(0, 'Your browser blocked the popup — allow popups for this site');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function VendorStatements() {
  const toast = useToast();
  const [rows, setRows] = useState<Statement[] | null>(null);

  useEffect(() => {
    api.get<{ statements: Statement[] }>('/billing/my/statements')
      .then((r) => setRows(r.statements))
      .catch(() => setRows([]));
  }, []);

  const owed = (rows ?? []).filter((s) => s.status === 'issued');
  const owedToPlatform = owed.reduce((a, s) => a + Number(s.net_due_to_platform), 0);
  const owedToMe = owed.reduce((a, s) => a + Number(s.net_due_to_vendor), 0);

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>Statements</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        A statement covers your completed orders for a period. Commission is charged on
        goods only — never on the delivery fee you set.
      </p>

      {owedToPlatform > 0 && (
        <Alert kind="warn">
          You have {money(owedToPlatform)} in outstanding commission. You collected payment
          directly from buyers, so this is payable to Sokoni Hub.
        </Alert>
      )}
      {owedToMe > 0 && (
        <Alert kind="info">{money(owedToMe)} is due to be paid out to you.</Alert>
      )}

      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <Empty icon="🧾" title="No statements yet"
          text="Once your delivered orders are settled for a period, the statement appears here." />
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Statement</th><th>Period</th>
                <th style={{ textAlign: 'right' }}>Orders</th>
                <th style={{ textAlign: 'right' }}>Gross sales</th>
                <th style={{ textAlign: 'right' }}>Commission</th>
                <th style={{ textAlign: 'right' }}>Balance</th>
                <th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const iOwe = Number(s.net_due_to_platform) > 0;
                const owedMe = Number(s.net_due_to_vendor) > 0;
                return (
                  <tr key={s.id}>
                    <td className="td-mono">{s.number}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{date(s.period_start)} – {date(s.period_end)}</td>
                    <td style={{ textAlign: 'right' }}>{s.order_count}</td>
                    <td style={{ textAlign: 'right' }}>{money(s.gross_sales, s.currency)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {money(s.commission_amount, s.currency)}
                      <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
                        {(Number(s.commission_rate) * 100).toFixed(2).replace(/\.00$/, '')}%
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>
                      {iOwe ? `You pay ${money(s.net_due_to_platform, s.currency)}`
                        : owedMe ? `You receive ${money(s.net_due_to_vendor, s.currency)}`
                        : money(0, s.currency)}
                    </td>
                    <td>
                      <Badge tone={s.status === 'paid' ? 'green' : s.status === 'void' ? 'grey' : 'gold'}>
                        {titleCase(s.status)}
                      </Badge>
                      {s.payment_reference && (
                        <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{s.payment_reference}</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-sm btn-outline"
                        onClick={() => openDocument(`/billing/statements/${s.id}/document`)
                          .catch((e) => toast.push(e.message, 'error'))}>
                        View / print
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <PayoutDetails />
    </div>
  );
}

/* --------------------------- bank details -------------------------- */

function PayoutDetails() {
  const toast = useToast();
  const [p, setP] = useState<Payout>({ bank_name: '', bank_account_name: '', bank_iban: '', payout_notes: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<any>('/vendors/me')
      .then((r) => setP({
        bank_name: r.vendor?.bank_name ?? '',
        bank_account_name: r.vendor?.bank_account_name ?? '',
        bank_iban: r.vendor?.bank_iban ?? '',
        payout_notes: r.vendor?.payout_notes ?? '',
      }))
      .catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/vendors/me/payout', p);
      toast.push('Payout details saved', 'success');
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not save', 'error');
    } finally { setBusy(false); }
  };

  const set = (k: keyof Payout) => (e: any) => setP({ ...p, [k]: e.target.value });

  return (
    <div className="card card-pad mt-3" style={{ maxWidth: 560 }}>
      <h3 style={{ marginTop: 0 }}>Payout details</h3>
      <p style={{ color: 'var(--muted)', fontSize: '.88rem', marginTop: 0 }}>
        Where Sokoni Hub should transfer money owed to you. Only needed if a statement
        ever comes out in your favour — today you collect from buyers directly.
      </p>
      <div className="form-row">
        <Field label="Bank"><input value={p.bank_name || ''} onChange={set('bank_name')} placeholder="e.g. QNB" /></Field>
        <Field label="Account name"><input value={p.bank_account_name || ''} onChange={set('bank_account_name')} /></Field>
      </div>
      <Field label="IBAN"><input value={p.bank_iban || ''} onChange={set('bank_iban')} placeholder="QA__ ____ ____ ____ ____ ____" /></Field>
      <Field label="Notes" hint="Anything the finance team should know."><input value={p.payout_notes || ''} onChange={set('payout_notes')} /></Field>
      <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save payout details'}</button>
    </div>
  );
}
