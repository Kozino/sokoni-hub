import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { money } from '../lib/format';
import { Spinner } from './ui';
import { useToast } from '../state/ToastContext';

// Admin controls for the per-booking fee on service vendors, and for service-only monthly plans.
// Everything here is saved to the database and applies to new bookings straight away.

export type ServiceFeeRules = {
  fee_enabled: boolean;
  amount: number;
  charge_on: 'every_booking' | 'new_clients';
  waive_for_plan: boolean;
  plan_enabled: boolean;
  due_days: number;
  payment_instructions: string;
};

type Bill = {
  id: string;
  period_start: string;
  period_end: string;
  amount: number;
  status: 'open' | 'submitted' | 'paid' | 'void';
  due_date: string;
  payment_method: string | null;
  payment_reference: string | null;
  receipt_url: string | null;
  submitted_at: string | null;
  paid_at: string | null;
  paid_from_wallet: boolean;
  admin_note: string | null;
  business_name: string;
  fee_count: number;
};

type FeeRow = {
  id: string;
  amount: number;
  currency: string;
  status: 'due' | 'paid' | 'waived' | 'void';
  charge_on: string;
  created_at: string;
  paid_at: string | null;
  payment_reference: string | null;
  booking_code: string;
  business_name: string;
};

type Ledger = {
  rules: ServiceFeeRules;
  fees: FeeRow[];
  totals: { due: number; paid: number; due_count: number };
};

const FILTERS = ['', 'due', 'paid', 'waived', 'void'] as const;
const BILL_FILTERS = ['submitted', 'open', 'paid'] as const;

type Schedule = {
  enabled: boolean;
  day_of_month: number;
  hour: number;
  last_run_month: string | null;
  last_run_at: string | null;
  last_result: { bills: number; fees: number } | null;
  last_error: string | null;
};

const lastMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function ServiceFeesAdmin() {
  const toast = useToast();
  const [rules, setRules] = useState<ServiceFeeRules | null>(null);
  const [draft, setDraft] = useState<ServiceFeeRules | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [billTotals, setBillTotals] = useState({ open: 0, submitted: 0, submitted_count: 0 });
  const [billFilter, setBillFilter] = useState<(typeof BILL_FILTERS)[number]>('submitted');
  const [month, setMonth] = useState(lastMonth());
  const [generating, setGenerating] = useState(false);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const loadSchedule = () =>
    api.get<{ schedule: Schedule }>('/admin/service-fee-bills/schedule').then((r) => setSchedule(r.schedule)).catch(() => {});

  const saveSchedule = async (patch: Partial<Schedule>) => {
    if (!schedule) return;
    const next = { enabled: schedule.enabled, day_of_month: schedule.day_of_month, hour: schedule.hour, ...patch };
    setSavingSchedule(true);
    try {
      const r = await api.put<{ schedule: Schedule }>('/admin/service-fee-bills/schedule', next);
      setSchedule(r.schedule);
      toast.push(next.enabled ? 'Monthly bill run is ON' : 'Monthly bill run is OFF', 'success');
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not save the schedule', 'error');
    } finally {
      setSavingSchedule(false);
    }
  };

  const loadBills = (status: string) =>
    api
      .get<{ bills: Bill[]; totals: { open: number; submitted: number; submitted_count: number } }>(`/admin/service-fee-bills?status=${status}`)
      .then((r) => {
        setBills(r.bills);
        setBillTotals(r.totals);
      });

  const generateBills = async () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return toast.push('Choose a month', 'error');
    setGenerating(true);
    try {
      const r = await api.post<{ bills: number; fees: number }>('/admin/service-fee-bills/generate', { month });
      toast.push(r.bills ? `Issued ${r.bills} bill${r.bills === 1 ? '' : 's'} covering ${r.fees} booking${r.fees === 1 ? '' : 's'}` : 'No new bills for that month', 'success');
      await Promise.all([loadBills(billFilter), loadLedger(filter)]);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not issue the bills', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const confirmBill = async (b: Bill) => {
    const reference = window.prompt('Bank reference to record (optional)', b.payment_reference ?? '') ?? null;
    if (reference === null) return;
    setBusyId(b.id);
    try {
      await api.post(`/admin/service-fee-bills/${b.id}/confirm`, { reference: reference.trim() || undefined });
      toast.push('Bill marked as paid', 'success');
      await Promise.all([loadBills(billFilter), loadLedger(filter)]);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not confirm the bill', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const sendBack = async (b: Bill) => {
    const note = window.prompt('Reason the vendor will see (for example: receipt unreadable, amount does not match)');
    if (!note || note.trim().length < 3) return;
    setBusyId(b.id);
    try {
      await api.post(`/admin/service-fee-bills/${b.id}/reject`, { note: note.trim() });
      toast.push('Sent back to the vendor', 'success');
      await loadBills(billFilter);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not send the bill back', 'error');
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    void loadSchedule();
  }, []);

  useEffect(() => {
    void loadBills(billFilter).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billFilter]);

  const loadLedger = (status: string) =>
    api.get<Ledger>(`/admin/service-fees${status ? `?status=${status}` : ''}`).then((r) => {
      setLedger(r);
      setRules(r.rules);
      setDraft((d) => d ?? r.rules);
    });

  useEffect(() => {
    void loadLedger(filter).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  if (!draft || !rules || !ledger) return <Spinner />;

  const dirty = JSON.stringify(draft) !== JSON.stringify(rules);
  const amountOk = Number.isFinite(draft.amount) && draft.amount >= 0 && draft.amount <= 10000;

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put<{ rules: ServiceFeeRules }>('/admin/service-fees', { ...draft, amount: Number(draft.amount) });
      setRules(r.rules);
      setDraft(r.rules);
      toast.push('Service fee settings saved', 'success');
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not save the service fee settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (id: string) => {
    const reference = window.prompt('Bank transfer or receipt reference (optional)') ?? null;
    if (reference === null) return;
    setBusyId(id);
    try {
      await api.post(`/admin/service-fees/${id}/paid`, { reference: reference.trim() || undefined });
      toast.push('Fee marked as paid', 'success');
      await loadLedger(filter);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not update the fee', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const waive = async (id: string) => {
    if (!window.confirm('Waive this fee? The vendor will not be charged it.')) return;
    setBusyId(id);
    try {
      await api.post(`/admin/service-fees/${id}/waive`, {});
      toast.push('Fee waived', 'success');
      await loadLedger(filter);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not waive the fee', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const label = { display: 'block', fontWeight: 600, marginBottom: 4 } as const;
  const check = { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border, #e5e7eb)', marginTop: 8, cursor: 'pointer' } as const;

  return (
    <div className="card card-pad" style={{ maxWidth: 760, marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Service bookings</h3>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        A fee the vendor owes for each booking. Product commission is set separately above. Changes apply to bookings made from now on.
      </p>

      <label style={check}>
        <input type="checkbox" checked={draft.fee_enabled} onChange={(e) => setDraft({ ...draft, fee_enabled: e.target.checked })} style={{ marginTop: 3 }} />
        <span><strong>Charge a fee per booking</strong><div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Vendors owe this fee for each booking made through Sokoni Hub.</div></span>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
        <div>
          <span style={label}>Fee amount (QAR)</span>
          <input
            type="number"
            min={0}
            max={10000}
            step="0.01"
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
            disabled={!draft.fee_enabled}
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--border, #e5e7eb)' }}
          />
          {!amountOk ? <div style={{ color: '#b91c1c', fontSize: '.8rem' }}>Enter an amount from 0 to 10,000.</div> : null}
        </div>
        <div>
          <span style={label}>Charge on</span>
          <select
            value={draft.charge_on}
            onChange={(e) => setDraft({ ...draft, charge_on: e.target.value as ServiceFeeRules['charge_on'] })}
            disabled={!draft.fee_enabled}
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--border, #e5e7eb)' }}
          >
            <option value="every_booking">Every booking</option>
            <option value="new_clients">New clients only (first booking from each client)</option>
          </select>
        </div>
      </div>

      <label style={check}>
        <input type="checkbox" checked={draft.waive_for_plan} onChange={(e) => setDraft({ ...draft, waive_for_plan: e.target.checked })} style={{ marginTop: 3 }} />
        <span><strong>No fee for vendors on a paid plan</strong><div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Vendors with an active Standard or Pro plan do not pay the booking fee.</div></span>
      </label>

      <label style={check}>
        <input type="checkbox" checked={draft.plan_enabled} onChange={(e) => setDraft({ ...draft, plan_enabled: e.target.checked })} style={{ marginTop: 3 }} />
        <span><strong>Offer monthly plans to service vendors</strong><div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Works even when product subscriptions are off. A plan then sets the limits for service listings only.</div></span>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginTop: 14 }}>
        <div>
          <span style={label}>Days to pay after month end</span>
          <input
            type="number"
            min={1}
            max={90}
            value={draft.due_days}
            onChange={(e) => setDraft({ ...draft, due_days: Number(e.target.value) })}
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--border, #e5e7eb)' }}
          />
        </div>
        <div>
          <span style={label}>Payment instructions shown to vendors</span>
          <textarea
            rows={3}
            maxLength={1000}
            value={draft.payment_instructions}
            onChange={(e) => setDraft({ ...draft, payment_instructions: e.target.value })}
            placeholder="Bank name, account name, IBAN, and the bill reference to quote"
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--border, #e5e7eb)' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
        <button className="btn btn-primary" disabled={!dirty || !amountOk || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save service settings'}
        </button>
        {dirty ? <span style={{ color: '#b45309', fontSize: '.85rem' }}>Unsaved changes</span> : null}
      </div>

      <hr style={{ margin: '22px 0', border: 0, borderTop: '1px solid var(--border, #e5e7eb)' }} />

      <h4 style={{ margin: '0 0 8px' }}>Monthly bill run</h4>
      {schedule ? (
        <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border, #e5e7eb)', marginBottom: 16 }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={schedule.enabled}
              disabled={savingSchedule}
              onChange={(e) => void saveSchedule({ enabled: e.target.checked })}
            />
            {schedule.enabled ? 'ON: bills are issued automatically' : 'OFF: bills are issued only when you press the button below'}
          </label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginTop: 12 }}>
            <label>
              <span style={label}>Day of the month</span>
              <select value={schedule.day_of_month} onChange={(e) => setSchedule({ ...schedule, day_of_month: Number(e.target.value) })} style={{ padding: 6, borderRadius: 8, border: '1px solid var(--border, #e5e7eb)' }}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>
              <span style={label}>From hour (Qatar time)</span>
              <select value={schedule.hour} onChange={(e) => setSchedule({ ...schedule, hour: Number(e.target.value) })} style={{ padding: 6, borderRadius: 8, border: '1px solid var(--border, #e5e7eb)' }}>
                {Array.from({ length: 24 }, (_, i) => i).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </label>
            <button
              className="btn"
              disabled={savingSchedule}
              onClick={() => void saveSchedule({ day_of_month: schedule.day_of_month, hour: schedule.hour })}
            >
              Save timing
            </button>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '.85rem', margin: '12px 0 0' }}>
            On the chosen day and hour each month, the run issues bills for the previous month. Running it again is safe. A vendor is never billed twice.
            {schedule.last_run_month ? ` Last run: ${schedule.last_run_month}` : ' No run yet.'}
            {schedule.last_run_at ? ` (${new Date(schedule.last_run_at).toLocaleString('en-GB', { timeZone: 'Asia/Qatar' })})` : ''}
            {schedule.last_result ? ` · ${schedule.last_result.bills} bills, ${schedule.last_result.fees} bookings` : ''}
          </p>
          {schedule.last_error ? <div style={{ color: '#b91c1c', fontSize: '.85rem', marginTop: 6 }}>Last run failed: {schedule.last_error}. It will retry on the next check.</div> : null}
        </div>
      ) : null}

      <h4 style={{ margin: '0 0 8px' }}>Monthly bills</h4>
      <p style={{ color: 'var(--muted)', margin: '0 0 10px', fontSize: '.85rem' }}>
        Issue each month's bills after the month ends. Transfers the vendor submits wait here for you to confirm.
        Open bills are also settled automatically from the vendor's wallet when they request a payout.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Month</span>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: 6, borderRadius: 8, border: '1px solid var(--border, #e5e7eb)' }} />
        <button className="btn btn-primary" disabled={generating} onClick={() => void generateBills()}>
          {generating ? 'Issuing…' : 'Issue bills now'}
        </button>
        <span style={{ fontSize: '.85rem', color: 'var(--muted)', marginLeft: 'auto' }}>
          Open: <strong>{money(billTotals.open)}</strong> · Awaiting confirmation: <strong>{billTotals.submitted_count}</strong> ({money(billTotals.submitted)})
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {BILL_FILTERS.map((f) => (
          <button key={f} className={`btn ${billFilter === f ? 'btn-primary' : ''}`} onClick={() => setBillFilter(f)} style={{ padding: '4px 10px', fontSize: '.85rem' }}>
            {f === 'submitted' ? 'Awaiting confirmation' : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {bills.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No bills here.</p>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: 22 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                <th style={{ padding: 6 }}>Month</th>
                <th style={{ padding: 6 }}>Vendor</th>
                <th style={{ padding: 6 }}>Bookings</th>
                <th style={{ padding: 6 }}>Amount</th>
                <th style={{ padding: 6 }}>Due</th>
                <th style={{ padding: 6 }}>Transfer</th>
                <th style={{ padding: 6 }}></th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id} style={{ borderBottom: '1px solid var(--border, #f1f5f9)', verticalAlign: 'top' }}>
                  <td style={{ padding: 6 }}>{new Date(b.period_start).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</td>
                  <td style={{ padding: 6 }}>{b.business_name}</td>
                  <td style={{ padding: 6 }}>{b.fee_count}</td>
                  <td style={{ padding: 6 }}>{money(Number(b.amount))}</td>
                  <td style={{ padding: 6 }}>{new Date(b.due_date).toLocaleDateString('en-GB', { timeZone: 'UTC' })}</td>
                  <td style={{ padding: 6 }}>
                    {b.status === 'paid' ? (b.paid_from_wallet ? 'Paid from wallet' : `Paid${b.payment_reference ? ` · ${b.payment_reference}` : ''}`) : b.status}
                    {b.payment_reference && b.status !== 'paid' ? <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>Ref {b.payment_reference}</div> : null}
                    {b.receipt_url ? <div><a href={b.receipt_url} target="_blank" rel="noreferrer" style={{ fontSize: '.8rem' }}>View receipt</a></div> : null}
                    {b.admin_note ? <div style={{ fontSize: '.75rem', color: '#b45309' }}>Sent back: {b.admin_note}</div> : null}
                  </td>
                  <td style={{ padding: 6, whiteSpace: 'nowrap' }}>
                    {b.status === 'submitted' || b.status === 'open' ? (
                      <>
                        <button className="btn" disabled={busyId === b.id} onClick={() => void confirmBill(b)} style={{ marginRight: 6, padding: '4px 8px', fontSize: '.8rem' }}>Confirm paid</button>
                        {b.status === 'submitted' ? (
                          <button className="btn" disabled={busyId === b.id} onClick={() => void sendBack(b)} style={{ padding: '4px 8px', fontSize: '.8rem' }}>Send back</button>
                        ) : null}
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <h4 style={{ margin: 0 }}>Booking fee ledger</h4>
        <div style={{ display: 'flex', gap: 14, fontSize: '.9rem' }}>
          <span>Owed: <strong>{money(ledger.totals.due)}</strong> ({ledger.totals.due_count})</span>
          <span>Paid: <strong>{money(ledger.totals.paid)}</strong></span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
        {FILTERS.map((f) => (
          <button key={f || 'all'} className={`btn ${filter === f ? 'btn-primary' : ''}`} onClick={() => setFilter(f)} style={{ padding: '4px 10px', fontSize: '.85rem' }}>
            {f ? f[0].toUpperCase() + f.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {ledger.fees.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No booking fees yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                <th style={{ padding: 6 }}>Date</th>
                <th style={{ padding: 6 }}>Vendor</th>
                <th style={{ padding: 6 }}>Booking</th>
                <th style={{ padding: 6 }}>Amount</th>
                <th style={{ padding: 6 }}>Status</th>
                <th style={{ padding: 6 }}></th>
              </tr>
            </thead>
            <tbody>
              {ledger.fees.map((f) => (
                <tr key={f.id} style={{ borderBottom: '1px solid var(--border, #f1f5f9)' }}>
                  <td style={{ padding: 6 }}>{new Date(f.created_at).toLocaleDateString('en-GB')}</td>
                  <td style={{ padding: 6 }}>{f.business_name}</td>
                  <td style={{ padding: 6 }}>{f.booking_code}</td>
                  <td style={{ padding: 6 }}>{money(Number(f.amount))}</td>
                  <td style={{ padding: 6 }}>
                    {f.status}
                    {f.payment_reference ? <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>Ref {f.payment_reference}</div> : null}
                  </td>
                  <td style={{ padding: 6, whiteSpace: 'nowrap' }}>
                    {f.status === 'due' ? (
                      <>
                        <button className="btn" disabled={busyId === f.id} onClick={() => void markPaid(f.id)} style={{ marginRight: 6, padding: '4px 8px', fontSize: '.8rem' }}>Mark paid</button>
                        <button className="btn" disabled={busyId === f.id} onClick={() => void waive(f.id)} style={{ padding: '4px 8px', fontSize: '.8rem' }}>Waive</button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
