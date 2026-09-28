/**
 * Admin: paid placement.
 *
 * The screen is built around the two moments where money is at stake:
 *
 *   selling  — before quoting, the admin must see whether the tier is already
 *              full for those dates, because overselling silently converts a
 *              "front page slot" into "a share of a front page slot". The
 *              availability check runs as the dates are typed, not after.
 *
 *   revoking — pulling paid placement without a recorded reason is what turns
 *              into an argument later, so a reason is required.
 *
 * Expiry is not an action. Placements lapse on their own; the table shows the
 * derived state so nobody has to remember to switch anyone off.
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { Alert, Badge, Empty, Field, Modal, Spinner, Stat, Tabs } from '../../components/ui';
import { useToast } from '../../state/ToastContext';
import { money, date, num } from '../../lib/format';

type State = 'live' | 'scheduled' | 'expired' | 'revoked' | 'suspended';

interface Promo {
  id: string; vendor_id: string; business_name: string; slug: string; city: string;
  tier: 'vip' | 'featured'; state: State;
  starts_at: string; ends_at: string; days_remaining: number;
  price_amount: string; currency: string; is_paid: boolean; paid_at: string | null;
  payment_reference: string | null; note: string | null;
  impressions: number; clicks: number;
  revoke_reason: string | null; created_by_name: string | null;
}
interface Vendor { id: string; business_name: string; city: string; status: string }

const TONE: Record<State, 'green' | 'blue' | 'grey' | 'red'> = {
  live: 'green', scheduled: 'blue', expired: 'grey', revoked: 'red', suspended: 'red',
};
const ctr = (p: Promo) =>
  p.impressions > 0 ? `${((p.clicks / p.impressions) * 100).toFixed(1)}%` : '—';

export default function AdminPromotions() {
  const [rows, setRows] = useState<Promo[] | null>(null);
  const [slots, setSlots] = useState<{ vip: number; featured: number }>({ vip: 0, featured: 0 });
  const [tab, setTab] = useState<'all' | State>('all');
  const [err, setErr] = useState('');
  const { push } = useToast();

  // sell
  const [sellOpen, setSellOpen] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [tier, setTier] = useState<'vip' | 'featured'>('featured');
  const [days, setDays] = useState('30');
  const [startsAt, setStartsAt] = useState('');
  const [price, setPrice] = useState('');
  const [paid, setPaid] = useState(true);
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [avail, setAvail] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  // revoke / extend
  const [revoking, setRevoking] = useState<Promo | null>(null);
  const [reason, setReason] = useState('');
  const [extending, setExtending] = useState<Promo | null>(null);
  const [extraDays, setExtraDays] = useState('30');

  const load = () =>
    api.get<{ promotions: Promo[]; slots: any }>('/promotions/admin')
      .then((r) => { setRows(r.promotions); setSlots(r.slots); })
      .catch((e) => setErr(e.message));

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!sellOpen) return;
    api.get<{ vendors: Vendor[] }>('/vendors?limit=60')
      .then((r) => setVendors(r.vendors)).catch(() => {});
  }, [sellOpen]);

  // Availability is recomputed whenever the shape of the sale changes.
  const window_ = useMemo(() => {
    const s = startsAt ? new Date(startsAt) : new Date();
    const n = Number(days) || 0;
    return { start: s, end: new Date(s.getTime() + n * 86400_000) };
  }, [startsAt, days]);

  useEffect(() => {
    if (!sellOpen || !Number(days)) { setAvail(null); return; }
    const t = setTimeout(() => {
      api.get<any>(`/promotions/admin/availability?tier=${tier}` +
        `&starts_at=${encodeURIComponent(window_.start.toISOString())}` +
        `&ends_at=${encodeURIComponent(window_.end.toISOString())}`)
        .then(setAvail).catch(() => setAvail(null));
    }, 250);
    return () => clearTimeout(t);
  }, [sellOpen, tier, days, startsAt]);

  const counts = useMemo(() => {
    const r = rows ?? [];
    return {
      all: r.length,
      live: r.filter((x) => x.state === 'live').length,
      scheduled: r.filter((x) => x.state === 'scheduled').length,
      expired: r.filter((x) => x.state === 'expired').length,
      revoked: r.filter((x) => x.state === 'revoked').length,
      unpaid: r.filter((x) => !x.is_paid && x.state !== 'revoked').length,
      revenue: r.filter((x) => x.is_paid).reduce((a, x) => a + Number(x.price_amount), 0),
      outstanding: r.filter((x) => !x.is_paid && x.state !== 'revoked')
        .reduce((a, x) => a + Number(x.price_amount), 0),
    };
  }, [rows]);

  const shown = (rows ?? []).filter((r) => tab === 'all' || r.state === tab);

  const sell = async () => {
    if (!vendorId) { setErr('Choose a store'); return; }
    setBusy(true); setErr('');
    try {
      await api.post('/promotions/admin', {
        vendor_id: vendorId, tier,
        starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
        days: Number(days),
        price_amount: Number(price) || 0,
        paid, payment_reference: ref || undefined, note: note || undefined,
      });
      push('Placement created', 'success');
      setSellOpen(false); setVendorId(''); setPrice(''); setRef(''); setNote('');
      await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true); setErr('');
    try {
      await api.post(`/promotions/admin/${revoking.id}/revoke`, { reason });
      push(`${revoking.business_name} removed from placement`, 'success');
      setRevoking(null); setReason(''); await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const extend = async () => {
    if (!extending) return;
    setBusy(true); setErr('');
    try {
      await api.patch(`/promotions/admin/${extending.id}`, { extend_days: Number(extraDays) });
      push('Placement extended', 'success');
      setExtending(null); await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const markPaid = async (p: Promo) => {
    try {
      await api.patch(`/promotions/admin/${p.id}`, { paid: true });
      push('Marked as paid', 'success'); await load();
    } catch (e: any) { setErr(e.message); }
  };

  if (!rows) return <Spinner />;

  return (
    <>
      <div className="row-between mb-3">
        <div>
          <h1 className="dash-title">Placements</h1>
          <p className="bk-sub">
            Paid VIP and Featured slots on the landing page. Placements end on their
            own when the paid period runs out — there is nothing to switch off.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setSellOpen(true); setErr(''); }}>
          Sell a placement
        </button>
      </div>

      <div className="grid grid-stats bk-stats mt-2">
        <Stat label="Live now" value={`${counts.live}`}
          sub={`${slots.vip} VIP + ${slots.featured} Featured slots`} accent="green" />
        <Stat label="Collected" value={money(counts.revenue)} sub="Paid placements" />
        <Stat label="Outstanding" value={money(counts.outstanding)}
          accent={counts.outstanding > 0 ? 'gold' : undefined}
          sub={`${counts.unpaid} unpaid`} />
      </div>

      {err && <Alert kind="error">{err}</Alert>}

      {counts.unpaid > 0 && (
        <Alert kind="warn">
          {counts.unpaid} placement{counts.unpaid === 1 ? ' is' : 's are'} running without
          a recorded payment. They are live on the landing page regardless — record the
          payment or revoke them.
        </Alert>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'all' as const, label: 'All', count: counts.all },
          { id: 'live' as const, label: 'Live', count: counts.live },
          { id: 'scheduled' as const, label: 'Scheduled', count: counts.scheduled },
          { id: 'expired' as const, label: 'Expired', count: counts.expired },
          { id: 'revoked' as const, label: 'Revoked', count: counts.revoked },
        ]}
      />

      {shown.length === 0 ? (
        <Empty icon="⭐" title="No placements here"
          text="Sell a VIP or Featured slot to put a store on the landing page." />
      ) : (
        <div className="bk-list pm-list mt-3">
          <div className="bk-head">
            <span>Store</span><span>Tier</span><span>Runs</span>
            <span>Performance</span><span>Status</span><span />
          </div>

          {shown.map((p) => (
            <div key={p.id} className="bk-item">
              <div className="bk-c-ref">
                <strong>{p.business_name}</strong>
                <span className="bk-sub">{p.city}</span>
              </div>

              <div className="bk-c-service">
                <span className="bk-label">Tier</span>
                <Badge tone={p.tier === 'vip' ? 'gold' : 'grey'}>
                  {p.tier === 'vip' ? 'VIP' : 'Featured'}
                </Badge>
                <span className="bk-sub">
                  {money(p.price_amount, p.currency)}{' · '}
                  {p.is_paid ? 'paid' : (
                    // The payment state is the control. A third button in the
                    // action column pushed Revoke off the edge of the card.
                    p.state === 'revoked'
                      ? 'unpaid'
                      : <button type="button" className="pm-link" onClick={() => markPaid(p)}>
                          unpaid — mark paid
                        </button>
                  )}
                </span>
              </div>

              <div className="bk-c-customer">
                <span className="bk-label">Runs</span>
                <span>{date(p.starts_at)} → {date(p.ends_at)}</span>
                <span className="bk-sub">
                  {p.state === 'live' ? `${p.days_remaining} day${p.days_remaining === 1 ? '' : 's'} left`
                    : p.state === 'scheduled' ? 'Starts later'
                    : p.state === 'revoked' ? `Revoked — ${p.revoke_reason ?? 'no reason given'}`
                    : 'Ended'}
                </span>
              </div>

              <div className="bk-c-when">
                <span className="bk-label">Performance</span>
                <span>{num(p.impressions)} views</span>
                <span className="bk-sub">{num(p.clicks)} clicks · {ctr(p)} CTR</span>
              </div>

              <div className="bk-c-status">
                <span className="bk-label">Status</span>
                <Badge tone={TONE[p.state]}>
                  {p.state === 'suspended' ? 'Store suspended' : p.state}
                </Badge>
              </div>

              <div className="bk-c-action pm-actions">
                {(p.state === 'live' || p.state === 'scheduled' || p.state === 'expired') && (
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => { setExtending(p); setExtraDays('30'); setErr(''); }}>
                    Extend
                  </button>
                )}
                {(p.state === 'live' || p.state === 'scheduled') && (
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => { setRevoking(p); setReason(''); setErr(''); }}>
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------ sell */}
      <Modal open={sellOpen} title="Sell a placement" onClose={() => setSellOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setSellOpen(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={sell}>
              {busy ? 'Saving…' : 'Create placement'}
            </button>
          </>
        }>
        <Field label="Store" hint="Only verified stores can be promoted.">
          <select className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">Choose a store…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.business_name} — {v.city}</option>
            ))}
          </select>
        </Field>

        <Field label="Tier" hint="VIP appears above Featured, in a larger card.">
          <select className="input" value={tier} onChange={(e) => setTier(e.target.value as any)}>
            <option value="featured">Featured</option>
            <option value="vip">VIP</option>
          </select>
        </Field>

        <div className="row">
          <Field label="Starts" hint="Leave empty to start now.">
            <input className="input" type="date" value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Days" hint="How long it runs for.">
            <input className="input" type="number" min={1} value={days}
              onChange={(e) => setDays(e.target.value)} />
          </Field>
        </div>

        {avail && (
          <Alert kind={avail.oversubscribed ? 'warn' : 'info'}>
            {avail.oversubscribed ? (
              <>
                <strong>{avail.tier === 'vip' ? 'VIP' : 'Featured'} is full for those dates.</strong>{' '}
                {avail.taken} placements for {avail.slots} slots. You can still sell this
                one, but positions rotate — each store would be visible roughly{' '}
                <strong>{Math.round((avail.slots / (avail.taken + 1)) * 100)}%</strong> of
                the time. Price it accordingly, or raise the slot count.
              </>
            ) : (
              <>{avail.free} of {avail.slots} {avail.tier === 'vip' ? 'VIP' : 'Featured'} slots
                free for those dates.</>
            )}
          </Alert>
        )}

        <div className="row">
          <Field label="Price" hint="What the vendor agreed to pay.">
            <input className="input" type="number" min={0} step="0.01" value={price}
              placeholder="0.00" onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Payment reference" hint="Optional. Transfer or receipt number.">
            <input className="input" value={ref} maxLength={120}
              onChange={(e) => setRef(e.target.value)} />
          </Field>
        </div>

        <label className="row" style={{ gap: 'var(--s-2)', alignItems: 'center' }}>
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          <span>Payment already received</span>
        </label>

        <Field label="Note" hint="Optional. Visible to admins only.">
          <input className="input" value={note} maxLength={500}
            onChange={(e) => setNote(e.target.value)} />
        </Field>

        {err && <Alert kind="error">{err}</Alert>}
      </Modal>

      {/* ---------------------------------------------------------- revoke */}
      <Modal open={!!revoking} title={revoking ? `Revoke — ${revoking.business_name}` : ''}
        onClose={() => setRevoking(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setRevoking(null)}>Cancel</button>
            <button className="btn btn-danger" disabled={busy || reason.trim().length < 3}
              onClick={revoke}>
              {busy ? 'Revoking…' : 'Revoke placement'}
            </button>
          </>
        }>
        {revoking && (
          <>
            <p className="bk-sub">
              This removes {revoking.business_name} from the landing page immediately.
              They paid {money(revoking.price_amount, revoking.currency)} and have{' '}
              {revoking.days_remaining} day{revoking.days_remaining === 1 ? '' : 's'} left,
              so a refund may be owed. The record is kept either way.
            </p>
            <Field label="Reason" hint="Required. Shown in the audit log and on the placement.">
              <input className="input" value={reason} maxLength={500} autoFocus
                placeholder="e.g. Refunded at vendor's request"
                onChange={(e) => setReason(e.target.value)} />
            </Field>
            {err && <Alert kind="error">{err}</Alert>}
          </>
        )}
      </Modal>

      {/* ---------------------------------------------------------- extend */}
      <Modal open={!!extending} title={extending ? `Extend — ${extending.business_name}` : ''}
        onClose={() => setExtending(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setExtending(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={extend}>
              {busy ? 'Saving…' : 'Extend'}
            </button>
          </>
        }>
        {extending && (
          <>
            <p className="bk-sub">
              Currently ends {date(extending.ends_at)}.
              {new Date(extending.ends_at) < new Date()
                ? ' This placement has already lapsed, so the extension runs from today.'
                : ' The extension is added to the existing end date.'}
            </p>
            <Field label="Extra days">
              <input className="input" type="number" min={1} value={extraDays}
                onChange={(e) => setExtraDays(e.target.value)} autoFocus />
            </Field>
            {err && <Alert kind="error">{err}</Alert>}
          </>
        )}
      </Modal>
    </>
  );
}
