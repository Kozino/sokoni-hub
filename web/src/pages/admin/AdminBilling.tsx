import { useEffect, useState } from 'react';
import { api, ApiError, getToken } from '../../lib/api';
import { money, date, titleCase } from '../../lib/format';
import { Alert, Spinner, Empty, Field, Modal, Stat, Badge, Tabs, useConfirm } from '../../components/ui';
import { useToast } from '../../state/ToastContext';

/* ------------------------------------------------------------------ */
/* Documents are HTML behind an Authorization header, so a plain <a> will
   not work — fetch with the token and open the result as a blob.       */
/* ------------------------------------------------------------------ */
async function openDocument(path: string) {
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  const res = await fetch(`${base}/api${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new ApiError(res.status, 'Could not open the document');
  const url = URL.createObjectURL(await res.blob());
  const w = window.open(url, '_blank');
  if (!w) throw new ApiError(0, 'Your browser blocked the popup — allow popups for this site');
  // Revoke once the new tab has had time to load, otherwise it renders blank.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function downloadCsv(path: string, filename: string) {
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  const res = await fetch(`${base}/api${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, 'Export failed');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

interface Statement {
  id: string; number: string | null; vendor_id: string; business_name: string;
  period_start: string; period_end: string; currency: string; status: string;
  order_count: number; gross_sales: string; commission_rate: string; commission_amount: string;
  net_due_to_platform: string; net_due_to_vendor: string;
  issued_at: string | null; paid_at: string | null; payment_reference: string | null;
  emailed_at: string | null;
}

interface Settings {
  commission_rate: number; currency: string; business_name: string;
  business_address: string | null; business_email: string | null; business_phone: string | null;
  cr_number: string | null; tax_number: string | null; invoice_footer: string | null;
}

const lastMonth = () => {
  const d = new Date();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export default function AdminBilling() {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useState<'statements' | 'payouts' | 'settings'>('statements');
  const [rows, setRows] = useState<Statement[] | null>(null);
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');

  const load = () => {
    setRows(null);
    api.get<{ statements: Statement[] }>(`/billing/statements${status ? `?status=${status}` : ''}`)
      .then((r) => setRows(r.statements))
      .catch((e) => { setErr(e.message); setRows([]); });
  };
  useEffect(load, [status]);

  const act = async (id: string, path: string, body?: unknown, okMsg = 'Done') => {
    try {
      await api.post(`/billing/statements/${id}/${path}`, body);
      toast.push(okMsg, 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed', 'error');
    }
  };

  return (
    <div>
      <div className="row-between mb-3" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Billing</h1>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0' }}>
            Commission statements, payouts and document settings.
          </p>
        </div>
        <GenerateButton onDone={load} />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'statements' as const, label: 'Statements' },
          { id: 'payouts' as const, label: 'Payouts' },
          { id: 'settings' as const, label: 'Settings' },
        ]}
      />

      <Alert kind="error">{err}</Alert>

      {tab === 'statements' && (
        <>
          <div className="mb-2" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['', 'draft', 'issued', 'paid', 'void'].map((s) => (
              <button key={s} className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setStatus(s)}>{s === '' ? 'All' : titleCase(s)}</button>
            ))}
          </div>

          {rows === null ? <Spinner /> : rows.length === 0 ? (
            <Empty title="No statements yet"
              text="Generate a period to create draft statements from delivered orders." />
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Statement</th><th>Vendor</th><th>Period</th>
                    <th style={{ textAlign: 'right' }}>Gross</th>
                    <th style={{ textAlign: 'right' }}>Commission</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                    <th>Status</th><th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const owesUs = Number(s.net_due_to_platform) > 0;
                    const weOwe = Number(s.net_due_to_vendor) > 0;
                    return (
                      <tr key={s.id}>
                        <td className="td-mono">{s.number || <span style={{ color: 'var(--muted)' }}>draft</span>}</td>
                        <td className="td-strong">{s.business_name}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{date(s.period_start)} – {date(s.period_end)}
                          <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{s.order_count} orders</div>
                        </td>
                        <td style={{ textAlign: 'right' }}>{money(s.gross_sales, s.currency)}</td>
                        <td style={{ textAlign: 'right' }}>{money(s.commission_amount, s.currency)}
                          <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
                            {(Number(s.commission_rate) * 100).toFixed(2).replace(/\.00$/, '')}%
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {owesUs ? <span style={{ color: 'var(--ok, #166534)', fontWeight: 700 }}>
                              +{money(s.net_due_to_platform, s.currency)}</span>
                            : weOwe ? <span style={{ color: 'var(--danger, #b91c1c)', fontWeight: 700 }}>
                              −{money(s.net_due_to_vendor, s.currency)}</span>
                            : money(0, s.currency)}
                          <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                            {owesUs ? 'vendor owes you' : weOwe ? 'you owe vendor' : 'settled'}
                          </div>
                        </td>
                        <td>
                          <Badge tone={s.status === 'paid' ? 'green' : s.status === 'void' ? 'grey' : s.status === 'issued' ? 'gold' : 'grey'}>
                            {titleCase(s.status)}
                          </Badge>
                          {s.emailed_at && <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>emailed</div>}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="btn btn-sm btn-outline"
                            onClick={() => openDocument(`/billing/statements/${s.id}/document`)
                              .catch((e) => toast.push(e.message, 'error'))}>View</button>
                          {s.status === 'draft' && (
                            <button className="btn btn-sm btn-primary" style={{ marginLeft: 6 }}
                              onClick={() => act(s.id, 'issue', undefined, 'Statement issued')}>Issue</button>
                          )}
                          {s.status === 'issued' && (
                            <>
                              <button className="btn btn-sm btn-outline" style={{ marginLeft: 6 }}
                                onClick={() => act(s.id, 'send', undefined, 'Emailed to vendor')}>Email</button>
                              <MarkPaidButton statement={s} onDone={load} />
                            </>
                          )}
                          {s.status !== 'paid' && s.status !== 'void' && (
                            <button className="btn btn-sm btn-outline" style={{ marginLeft: 6 }}
                              onClick={async () => {
                                if (await confirm({
                                  title: 'Void this statement?',
                                  body: 'Its orders are released and the period can be generated again.',
                                  confirmLabel: 'Void',
                                })) act(s.id, 'void', {}, 'Statement voided');
                              }}>Void</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'payouts' && <Payouts onDone={load} />}
      {tab === 'settings' && <BillingSettings />}
      {dialog}
    </div>
  );
}

/* ----------------------------- generate ---------------------------- */

function GenerateButton({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(lastMonth());
  const [preview, setPreview] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const runPreview = async () => {
    setBusy(true); setErr(''); setPreview(null);
    try { setPreview(await api.post<any>('/billing/statements/preview', { month })); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Preview failed'); }
    finally { setBusy(false); }
  };

  const generate = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.post<any>('/billing/statements/generate', { month });
      toast.push(`${r.statements.length} statement${r.statements.length === 1 ? '' : 's'} created`, 'success');
      setOpen(false); setPreview(null); onDone();
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Generation failed'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>Generate statements</button>
      <Modal open={open} onClose={() => { setOpen(false); setPreview(null); setErr(''); }} title="Generate statements">
        <Alert kind="error">{err}</Alert>
        <Field label="Month" hint="Covers delivered orders placed in this month. Orders already on a statement are skipped.">
          <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setPreview(null); }} />
        </Field>

        {preview && (
          <div className="card card-pad mt-2">
            {preview.vendors.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--muted)' }}>No settleable orders in that month.</p>
            ) : (
              <>
                <p style={{ marginTop: 0, fontSize: '.85rem', color: 'var(--muted)' }}>
                  Commission rate {(preview.commission_rate * 100).toFixed(2).replace(/\.00$/, '')}%
                </p>
                <table className="tbl">
                  <thead><tr><th>Vendor</th><th style={{ textAlign: 'right' }}>Orders</th>
                    <th style={{ textAlign: 'right' }}>Gross</th><th style={{ textAlign: 'right' }}>Commission</th></tr></thead>
                  <tbody>
                    {preview.vendors.map((v: any) => (
                      <tr key={v.vendor_id}>
                        <td>{v.business_name}</td>
                        <td style={{ textAlign: 'right' }}>{v.order_count}</td>
                        <td style={{ textAlign: 'right' }}>{money(v.gross_sales)}</td>
                        <td style={{ textAlign: 'right' }}>{money(v.commission_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        <div className="mt-3" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-outline" onClick={runPreview} disabled={busy}>
            {busy && !preview ? 'Checking…' : 'Preview'}
          </button>
          <button className="btn btn-primary" onClick={generate}
            disabled={busy || !preview || preview.vendors.length === 0}>
            {busy ? 'Working…' : 'Create drafts'}
          </button>
        </div>
      </Modal>
    </>
  );
}

/* ----------------------------- mark paid --------------------------- */

function MarkPaidButton({ statement, onDone }: { statement: Statement; onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.post(`/billing/statements/${statement.id}/pay`, { payment_reference: ref });
      toast.push('Recorded as settled', 'success');
      setOpen(false); onDone();
    } catch (e) { toast.push(e instanceof ApiError ? e.message : 'Failed', 'error'); }
    finally { setBusy(false); }
  };

  const owesUs = Number(statement.net_due_to_platform) > 0;

  return (
    <>
      <button className="btn btn-sm btn-primary" style={{ marginLeft: 6 }} onClick={() => setOpen(true)}>Mark paid</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Settle ${statement.number}`}>
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: '.9rem' }}>
          {owesUs
            ? <>Confirm you received {money(statement.net_due_to_platform, statement.currency)} from {statement.business_name}.</>
            : <>Confirm you transferred {money(statement.net_due_to_vendor, statement.currency)} to {statement.business_name}.</>}
        </p>
        <Field label="Bank reference" hint="Transfer reference or receipt number, so this can be traced later.">
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. QNB-20261001-0042" />
        </Field>
        <div className="mt-3" style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={save} disabled={busy || !ref.trim()}>
            {busy ? 'Saving…' : 'Confirm settled'}
          </button>
        </div>
      </Modal>
    </>
  );
}

/* ------------------------------ payouts ---------------------------- */

function Payouts({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<any | null>(null);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setData(null);
    api.get<any>('/billing/payouts/outstanding').then(setData).catch(() => setData({ pay_out: [], collect_in: [] }));
  };
  useEffect(load, []);

  if (!data) return <Spinner />;

  const chosen = Object.keys(sel).filter((k) => sel[k]);

  const runBatch = async () => {
    setBusy(true);
    try {
      const r = await api.post<any>('/billing/payouts/batch', { statement_ids: chosen, reference: ref });
      toast.push(`${r.settled} statement${r.settled === 1 ? '' : 's'} settled`, 'success');
      setSel({}); setRef(''); load(); onDone();
    } catch (e) { toast.push(e instanceof ApiError ? e.message : 'Failed', 'error'); }
    finally { setBusy(false); }
  };

  const missingBank = data.pay_out.filter((r: any) => !r.bank_iban);

  return (
    <div>
      <div className="grid grid-stats mb-3">
        <Stat label="You owe vendors" value={money(data.pay_out_total || 0)} />
        <Stat label="Vendors owe you" value={money(data.collect_in_total || 0)} />
      </div>

      <div className="card card-pad mb-3">
        <p style={{ marginTop: 0, fontSize: '.88rem', color: 'var(--muted)' }}>
          Sokoni Hub cannot move money — there is no payment gateway connected. Make the
          transfer in your bank, then record it here so the statement is closed and traceable.
        </p>
        <button className="btn btn-outline btn-sm"
          onClick={() => downloadCsv('/billing/payouts/export.csv', 'sokoni-payouts.csv')
            .catch((e) => toast.push(e.message, 'error'))}>
          Download bank transfer CSV
        </button>
      </div>

      {missingBank.length > 0 && (
        <Alert kind="warn">
          {missingBank.length} vendor{missingBank.length === 1 ? ' has' : 's have'} no bank details on file
          ({missingBank.map((r: any) => r.business_name).join(', ')}). They cannot be paid until they add an IBAN
          in their dashboard.
        </Alert>
      )}

      <h3>Awaiting settlement</h3>
      {data.pay_out.length === 0 && data.collect_in.length === 0 ? (
        <Empty title="Nothing outstanding" text="Issued statements awaiting payment will appear here." />
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th /><th>Statement</th><th>Vendor</th><th>Bank</th>
              <th style={{ textAlign: 'right' }}>Amount</th><th>Direction</th></tr></thead>
            <tbody>
              {[...data.pay_out, ...data.collect_in].map((r: any) => {
                const out = Number(r.net_due_to_vendor) > 0;
                return (
                  <tr key={r.id}>
                    <td><input type="checkbox" checked={!!sel[r.id]}
                      onChange={(e) => setSel({ ...sel, [r.id]: e.target.checked })} /></td>
                    <td className="td-mono">{r.number}</td>
                    <td className="td-strong">{r.business_name}</td>
                    <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                      {r.bank_iban ? <>{r.bank_name}<br />{r.bank_iban}</> : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {money(out ? r.net_due_to_vendor : r.net_due_to_platform, r.currency)}
                    </td>
                    <td>{out ? 'Pay vendor' : 'Collect'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {chosen.length > 0 && (
        <div className="card card-pad mt-3">
          <strong>{chosen.length} selected</strong>
          <Field label="Bank reference for this run">
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. BULK-2026-10-01" />
          </Field>
          <button className="btn btn-primary" onClick={runBatch} disabled={busy || !ref.trim()}>
            {busy ? 'Recording…' : `Mark ${chosen.length} settled`}
          </button>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- settings ---------------------------- */

function BillingSettings() {
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [ratePct, setRatePct] = useState('0');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ settings: Settings }>('/billing/settings').then((r) => {
      setS(r.settings);
      setRatePct(String(Number(r.settings.commission_rate) * 100));
    }).catch(() => {});
  }, []);

  if (!s) return <Spinner />;

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.patch<{ settings: Settings }>('/billing/settings', {
        ...s,
        commission_rate: Number(ratePct) / 100,
      });
      setS(r.settings);
      toast.push('Settings saved', 'success');
    } catch (e) { toast.push(e instanceof ApiError ? e.message : 'Failed', 'error'); }
    finally { setBusy(false); }
  };

  const set = (k: keyof Settings) => (e: any) => setS({ ...s, [k]: e.target.value });

  return (
    <div className="card card-pad" style={{ maxWidth: 640 }}>
      <Field label="Commission rate (%)"
        hint="Charged on goods only, never on the vendor's delivery fee. 0 means statements are produced with no charge — useful for tracking volume before you start billing.">
        <input type="number" min={0} max={100} step={0.5} value={ratePct}
          onChange={(e) => setRatePct(e.target.value)} />
      </Field>

      <h3 style={{ marginBottom: 4 }}>Appears on every invoice and receipt</h3>
      <div className="form-row">
        <Field label="Business name"><input value={s.business_name || ''} onChange={set('business_name')} /></Field>
        <Field label="Commercial registration (CR)"><input value={s.cr_number || ''} onChange={set('cr_number')} /></Field>
      </div>
      <Field label="Address"><input value={s.business_address || ''} onChange={set('business_address')} /></Field>
      <div className="form-row">
        <Field label="Email"><input type="email" value={s.business_email || ''} onChange={set('business_email')} /></Field>
        <Field label="Phone"><input value={s.business_phone || ''} onChange={set('business_phone')} /></Field>
      </div>
      <Field label="Document footer" hint="Optional line at the bottom of every document.">
        <input value={s.invoice_footer || ''} onChange={set('invoice_footer')} />
      </Field>

      <button className="btn btn-primary" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  );
}
