/**
 * Admin: offers and coupons.
 *
 * Discounts, coupon codes and free or reduced delivery that Sokoni Hub pays for. Vendors are still paid the
 * full price of their goods and riders the full delivery fee; only the cash the customer hands over is lower.
 *
 * Two rules shape the screen:
 *
 *   NOTHING IS LIVE UNTIL YOU SWITCH IT ON.  A new offer is saved as a draft. "Go live" is its own deliberate
 *   action, and "Pause" takes effect straight away.
 *
 *   THE STATE IS DERIVED, NOT STORED.  Whether an offer is scheduled, live, ended or used up is worked out from
 *   the clock and its redemptions each time, so nobody has to remember to switch anything off.
 */
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Alert, Badge, Empty, Field, Modal, Spinner, Stat, Tabs, useConfirm } from '../../components/ui';
import { useToast } from '../../state/ToastContext';
import { dateTime, money, num } from '../../lib/format';
import './offers.css';

type State = 'draft' | 'paused' | 'scheduled' | 'live' | 'expired' | 'exhausted';
type Kind = 'percent_off' | 'amount_off' | 'free_delivery' | 'delivery_percent_off' | 'delivery_amount_off';
type Accent = 'green' | 'orange' | 'violet' | 'sky' | 'rose' | 'amber';

interface Offer {
  id: string; code: string | null; title: string; description: string | null; kind: Kind; value: number;
  max_discount: number | null; min_subtotal: number; scope: 'all' | 'vendor' | 'category';
  vendor_id: string | null; category_id: string | null; vendor_name: string | null; category_name: string | null;
  fulfilment: 'any' | 'delivery' | 'pickup'; first_order_only: boolean;
  usage_limit: number | null; per_customer_limit: number | null; budget_total: number | null;
  starts_at: string; ends_at: string; is_active: boolean; show_in_app: boolean; badge: string | null; accent: Accent; priority: number;
  state: State; redemptions: number; funded: number; funded_goods: number; funded_delivery: number; link: string;
}
interface Summary { live: number; scheduled: number; drafts: number; checkouts_month: number; funded_today: number; funded_month: number; funded_all: number }
interface Redemption { id: string; created_at: string; goods_discount: number; delivery_discount: number; order_code: string; status: string; contact_name: string; total: number; currency: string; business_name: string }
interface Vendor { id: string; business_name: string; city: string }
interface Category { id: string; name: string; kind: string }
interface PushRow { id: string; title: string; body: string; audience: string; recipients: number; created_at: string; offer_title: string | null }

const TONE: Record<State, 'green' | 'blue' | 'grey' | 'gold' | 'red'> = { live: 'green', scheduled: 'blue', draft: 'grey', paused: 'gold', expired: 'grey', exhausted: 'red' };
const STATE_LABEL: Record<State, string> = { live: 'Live', scheduled: 'Scheduled', draft: 'Draft', paused: 'Paused', expired: 'Ended', exhausted: 'Used up' };

const KIND_OPTIONS: { value: Kind; label: string; hint: string }[] = [
  { value: 'percent_off', label: 'Percentage off the items', hint: 'e.g. 10% off the goods' },
  { value: 'amount_off', label: 'Fixed amount off the items', hint: 'e.g. 10 QAR off the goods' },
  { value: 'free_delivery', label: 'Free delivery', hint: 'The delivery fee is waived' },
  { value: 'delivery_percent_off', label: 'Percentage off delivery', hint: 'e.g. 50% off the delivery fee' },
  { value: 'delivery_amount_off', label: 'Fixed amount off delivery', hint: 'e.g. 5 QAR off the delivery fee' },
];
const ACCENTS: { id: Accent; hex: string }[] = [
  { id: 'green', hex: '#05663F' }, { id: 'orange', hex: '#FC7800' }, { id: 'violet', hex: '#5B4BDB' },
  { id: 'sky', hex: '#0B76C2' }, { id: 'rose', hex: '#D9304F' }, { id: 'amber', hex: '#B97800' },
];
const accentHex = (a: Accent) => ACCENTS.find((x) => x.id === a)?.hex ?? '#05663F';
const isDelivery = (k: Kind) => k === 'free_delivery' || k === 'delivery_percent_off' || k === 'delivery_amount_off';
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

/** What the offer gives, in the words a customer reads. */
function gives(kind: Kind, value: number, cap: number | null): string {
  switch (kind) {
    case 'percent_off': return `${fmt(value)}% off${cap ? `, up to ${money(cap)}` : ''}`;
    case 'amount_off': return `${money(value)} off`;
    case 'free_delivery': return `Free delivery${cap ? ` (up to ${money(cap)})` : ''}`;
    case 'delivery_percent_off': return `${fmt(value)}% off delivery${cap ? `, up to ${money(cap)}` : ''}`;
    default: return `${money(value)} off delivery`;
  }
}

/* ------------------------------------------------------------------------------------------- form */
interface Form {
  title: string; description: string; mode: 'auto' | 'code'; code: string; kind: Kind; value: string; max_discount: string;
  min_subtotal: string; scope: 'all' | 'vendor' | 'category'; vendor_id: string; category_id: string;
  fulfilment: 'any' | 'delivery' | 'pickup'; first_order_only: boolean; usage_limit: string; per_customer_limit: string; budget_total: string;
  starts_at: string; ends_at: string; show_in_app: boolean; badge: string; accent: Accent; priority: string;
}
const localInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const blank = (): Form => {
  const now = new Date(); now.setSeconds(0, 0);
  return {
    title: '', description: '', mode: 'code', code: '', kind: 'percent_off', value: '10', max_discount: '', min_subtotal: '', scope: 'all', vendor_id: '',
    category_id: '', fulfilment: 'any', first_order_only: false, usage_limit: '', per_customer_limit: '1', budget_total: '',
    starts_at: localInput(now), ends_at: localInput(new Date(now.getTime() + 30 * 86400000)), show_in_app: true, badge: '', accent: 'green', priority: '0',
  };
};
const fromOffer = (o: Offer): Form => ({
  title: o.title, description: o.description ?? '', mode: o.code ? 'code' : 'auto', code: o.code ?? '', kind: o.kind, value: o.kind === 'free_delivery' ? '' : String(o.value),
  max_discount: o.max_discount ? String(o.max_discount) : '', min_subtotal: o.min_subtotal ? String(o.min_subtotal) : '', scope: o.scope,
  vendor_id: o.vendor_id ?? '', category_id: o.category_id ?? '', fulfilment: o.fulfilment, first_order_only: o.first_order_only,
  usage_limit: o.usage_limit ? String(o.usage_limit) : '', per_customer_limit: o.per_customer_limit ? String(o.per_customer_limit) : '',
  budget_total: o.budget_total ? String(o.budget_total) : '', starts_at: localInput(new Date(o.starts_at)), ends_at: localInput(new Date(o.ends_at)),
  show_in_app: o.show_in_app, badge: o.badge ?? '', accent: o.accent, priority: String(o.priority),
});
const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));
const toPayload = (f: Form) => ({
  title: f.title.trim(), description: f.description.trim() || null, code: f.mode === 'code' ? f.code.trim().toUpperCase() || null : null, kind: f.kind,
  value: f.kind === 'free_delivery' ? 0 : Number(f.value || 0), max_discount: numOrNull(f.max_discount), min_subtotal: Number(f.min_subtotal || 0),
  scope: f.scope, vendor_id: f.scope === 'vendor' ? f.vendor_id || null : null, category_id: f.scope === 'category' ? f.category_id || null : null,
  fulfilment: f.fulfilment, first_order_only: f.first_order_only, usage_limit: numOrNull(f.usage_limit), per_customer_limit: numOrNull(f.per_customer_limit),
  budget_total: numOrNull(f.budget_total), starts_at: new Date(f.starts_at).toISOString(), ends_at: new Date(f.ends_at).toISOString(),
  show_in_app: f.show_in_app, badge: f.badge.trim() || null, accent: f.accent, priority: Number(f.priority || 0),
});
const randomCode = () => Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

/** One plain sentence describing the rule, so the admin can read back exactly what they are about to publish. */
function sentence(f: Form, vendors: Vendor[], cats: Category[]): string {
  const v = Number(f.value || 0);
  const cap = numOrNull(f.max_discount);
  const what = gives(f.kind, v, cap).toLowerCase();
  const where = f.scope === 'vendor' ? ` at ${vendors.find((x) => x.id === f.vendor_id)?.business_name ?? 'one store'}` : f.scope === 'category' ? ` on ${cats.find((x) => x.id === f.category_id)?.name ?? 'one category'}` : '';
  const when = [
    Number(f.min_subtotal) > 0 ? `spend ${money(Number(f.min_subtotal))} or more` : '',
    f.fulfilment === 'delivery' ? 'choose delivery' : f.fulfilment === 'pickup' ? 'choose store collection' : '',
    f.first_order_only ? 'are ordering for the first time' : '',
  ].filter(Boolean);
  const how = f.mode === 'code' ? `enter ${f.code.trim().toUpperCase() || 'the code'} at checkout` : 'nothing to enter, it applies automatically';
  return `Customers get ${what}${where}${when.length ? ` when they ${when.join(' and ')}` : ''}. ${f.mode === 'code' ? `They ${how}.` : `Customers do not need to ${how.split(',')[0]}: it applies automatically.`}`;
}

/* ------------------------------------------------------------------------------------------- page */
export default function AdminOffers() {
  const { push: toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pushes, setPushes] = useState<PushRow[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [tab, setTab] = useState<'all' | 'live' | 'scheduled' | 'draft' | 'paused' | 'ended'>('all');
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<{ offer: Offer | null; form: Form } | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uses, setUses] = useState<{ offer: Offer; rows: Redemption[] | null } | null>(null);
  const [pushFor, setPushFor] = useState<Offer | 'none' | null>(null);

  const load = () => {
    api.get<{ offers: Offer[] }>('/offers/admin').then((r) => { setOffers(r.offers); setErr(''); }).catch((e) => { setErr(e.message); setOffers([]); });
    api.get<Summary>('/offers/admin/summary').then(setSummary).catch(() => {});
    api.get<{ pushes: PushRow[] }>('/offers/admin/push/history').then((r) => setPushes(r.pushes)).catch(() => {});
  };
  useEffect(() => {
    load();
    api.get<{ vendors: Vendor[] }>('/vendors?limit=60').then((r) => setVendors(r.vendors)).catch(() => {});
    api.get<{ categories: Category[] }>('/meta/categories').then((r) => setCats(r.categories.filter((c) => c.kind === 'product'))).catch(() => {});
  }, []);

  const counts = useMemo(() => {
    const c = { all: 0, live: 0, scheduled: 0, draft: 0, paused: 0, ended: 0 };
    (offers ?? []).forEach((o) => { c.all += 1; if (o.state === 'expired' || o.state === 'exhausted') c.ended += 1; else c[o.state] += 1; });
    return c;
  }, [offers]);
  const shown = useMemo(() => (offers ?? []).filter((o) => tab === 'all' || (tab === 'ended' ? o.state === 'expired' || o.state === 'exhausted' : o.state === tab)), [offers, tab]);

  const openNew = (from?: Offer) => {
    setFieldErr({}); setErr('');
    const form = from ? { ...fromOffer(from), code: '', title: `${from.title} (copy)` } : blank();
    setEditing({ offer: null, form });
  };
  const openEdit = (o: Offer) => { setFieldErr({}); setErr(''); setEditing({ offer: o, form: fromOffer(o) }); };
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setEditing((e) => (e ? { ...e, form: { ...e.form, [key]: value } } : e));

  const save = async (goLive: boolean) => {
    if (!editing) return;
    setBusy(true); setFieldErr({}); setErr('');
    try {
      const body = toPayload(editing.form);
      const saved = editing.offer
        ? await api.patch<{ offer: Offer }>(`/offers/admin/${editing.offer.id}`, body)
        : await api.post<{ offer: Offer }>('/offers/admin', body);
      if (goLive) await api.post(`/offers/admin/${saved.offer.id}/activate`, {});
      toast(goLive ? 'Offer is live' : editing.offer ? 'Offer updated' : 'Saved as a draft. It is not live yet.', 'success');
      setEditing(null);
      load();
    } catch (e) {
      if (e instanceof ApiError && e.details) setFieldErr(Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, (v as string[])[0]])));
      setErr(e instanceof Error ? e.message : 'Could not save');
    } finally { setBusy(false); }
  };

  const goLive = async (o: Offer) => {
    const when = new Date(o.starts_at) > new Date() ? `It will start on ${dateTime(o.starts_at)}.` : 'Customers can use it straight away.';
    const ok = await confirm({
      title: `Switch on “${o.title}”?`, confirmLabel: 'Go live', danger: false,
      body: <p>{gives(o.kind, o.value, o.max_discount)}. {when} Sokoni Hub pays for every use{o.budget_total ? `, up to ${money(o.budget_total)}` : ''}. You can pause it at any time.</p>,
    });
    if (!ok) return;
    try { await api.post(`/offers/admin/${o.id}/activate`, {}); toast('Offer is live', 'success'); load(); } catch (e) { toast(e instanceof Error ? e.message : 'Could not switch on', 'error'); }
  };
  const pause = async (o: Offer) => {
    try { await api.post(`/offers/admin/${o.id}/pause`, {}); toast('Paused. Customers can no longer use it.', 'success'); load(); } catch (e) { toast(e instanceof Error ? e.message : 'Could not pause', 'error'); }
  };
  const remove = async (o: Offer) => {
    const ok = await confirm({ title: `Delete “${o.title}”?`, body: <p>This offer has never been used, so it can be deleted. This cannot be undone.</p>, confirmLabel: 'Delete' });
    if (!ok) return;
    try { await api.del(`/offers/admin/${o.id}`); toast('Deleted', 'success'); load(); } catch (e) { toast(e instanceof Error ? e.message : 'Could not delete', 'error'); }
  };
  const showUses = (o: Offer) => {
    setUses({ offer: o, rows: null });
    api.get<{ redemptions: Redemption[] }>(`/offers/admin/${o.id}/redemptions`).then((r) => setUses({ offer: o, rows: r.redemptions })).catch((e) => { setErr(e.message); setUses(null); });
  };

  if (!offers) return <Spinner />;
  const f = editing?.form;

  return (
    <div className="of-page">
      <div className="row-between mb-3">
        <div>
          <h1 className="dash-title">Offers &amp; coupons</h1>
          <p className="bk-sub">
            Discounts, coupon codes and free or reduced delivery, paid for by Sokoni Hub. Nothing reaches customers until you switch it on.
          </p>
        </div>
        <div className="row" style={{ gap: 'var(--s-2)' }}>
          <button className="btn btn-ghost" onClick={() => setPushFor('none')}>Send a notification</button>
          <button className="btn btn-primary" onClick={() => openNew()}>Create offer</button>
        </div>
      </div>

      <div className="grid grid-stats bk-stats mt-2">
        <Stat label="Live now" value={String(summary?.live ?? counts.live)} sub={`${summary?.scheduled ?? counts.scheduled} scheduled · ${summary?.drafts ?? counts.draft} drafts`} accent="green" />
        <Stat label="Funded this month" value={money(summary?.funded_month ?? 0)} sub={`${num(summary?.checkouts_month ?? 0)} orders used an offer`} accent="gold" />
        <Stat label="Funded today" value={money(summary?.funded_today ?? 0)} sub="Discounts Sokoni Hub paid" />
        <Stat label="Funded all time" value={money(summary?.funded_all ?? 0)} sub="Cancelled orders are not counted" />
      </div>

      <div className="of-funding">
        <strong>How this is paid for.</strong> Vendors are still paid the full price of their goods and riders the full delivery fee. The customer
        simply hands over less cash, so the cost lands on Sokoni Hub. A customer always pays at least 1 QAR per order, so a rider always has cash to collect.
      </div>

      {err && <Alert kind="error">{err}</Alert>}
      {counts.live === 0 && !err && (
        <Alert kind="info">No offers are live. Customers see normal prices and the app shows no offers.</Alert>
      )}

      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'all' as const, label: 'All', count: counts.all }, { id: 'live' as const, label: 'Live', count: counts.live },
        { id: 'scheduled' as const, label: 'Scheduled', count: counts.scheduled }, { id: 'draft' as const, label: 'Drafts', count: counts.draft },
        { id: 'paused' as const, label: 'Paused', count: counts.paused }, { id: 'ended' as const, label: 'Ended', count: counts.ended },
      ]} />

      {shown.length === 0 ? (
        <Empty icon="🏷️" title="No offers here" text="Create an offer, then switch it on when you are ready for customers to see it."
          action={<button className="btn btn-primary" onClick={() => openNew()}>Create offer</button>} />
      ) : (
        <div className="of-list mt-3">
          {shown.map((o) => {
            const where = o.scope === 'vendor' ? o.vendor_name : o.scope === 'category' ? o.category_name : 'All stores';
            const pct = o.budget_total ? Math.min(100, Math.round((o.funded / o.budget_total) * 100)) : null;
            return (
              <article key={o.id} className="of-card" style={{ ['--of-accent' as string]: accentHex(o.accent) }}>
                <div className="of-main">
                  <div className="of-title">
                    <span className="of-dot" />
                    <strong>{o.title}</strong>
                    {o.code ? <span className="of-code">{o.code}</span> : <Badge tone="blue">Automatic</Badge>}
                    {!o.show_in_app && <Badge tone="grey">Private</Badge>}
                  </div>
                  <div className="of-gives">{gives(o.kind, o.value, o.max_discount)}</div>
                  {o.description && <div className="bk-sub">{o.description}</div>}
                </div>
                <div className="of-rules">
                  <span className="bk-label">Rules</span>
                  <span>{where}</span>
                  <span className="bk-sub">
                    {[o.min_subtotal > 0 ? `Min ${money(o.min_subtotal)}` : 'No minimum', o.fulfilment === 'delivery' ? 'Delivery only' : o.fulfilment === 'pickup' ? 'Collection only' : '',
                      o.first_order_only ? 'First order only' : '', o.per_customer_limit ? `${o.per_customer_limit} per customer` : ''].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <div className="of-runs">
                  <span className="bk-label">Runs</span>
                  <span>{dateTime(o.starts_at)}</span>
                  <span className="bk-sub">to {dateTime(o.ends_at)}</span>
                </div>
                <div className="of-used">
                  <span className="bk-label">Used</span>
                  <span><strong>{num(o.redemptions)}</strong>{o.usage_limit ? ` of ${num(o.usage_limit)}` : ''} {o.redemptions === 1 ? 'order' : 'orders'}</span>
                  <span className="bk-sub">{money(o.funded)} funded{o.budget_total ? ` of ${money(o.budget_total)}` : ''}</span>
                  {pct !== null && <span className="of-bar"><i style={{ width: `${pct}%` }} /></span>}
                </div>
                <div className="of-status">
                  <span className="bk-label">Status</span>
                  <Badge tone={TONE[o.state]}>{STATE_LABEL[o.state]}</Badge>
                </div>
                <div className="of-actions">
                  {(o.state === 'draft' || o.state === 'paused') && <button className="btn btn-primary btn-sm" onClick={() => goLive(o)}>Go live</button>}
                  {(o.state === 'live' || o.state === 'scheduled') && <button className="btn btn-ghost btn-sm" onClick={() => pause(o)}>Pause</button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(o)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openNew(o)}>Duplicate</button>
                  {(o.state === 'live' || o.state === 'scheduled') && <button className="btn btn-ghost btn-sm" onClick={() => setPushFor(o)}>Notify</button>}
                  {o.redemptions > 0 && <button className="btn btn-ghost btn-sm" onClick={() => showUses(o)}>Uses</button>}
                  {o.redemptions === 0 && <button className="btn btn-ghost btn-sm" onClick={() => remove(o)}>Delete</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pushes.length > 0 && (
        <div className="of-history mt-4">
          <h2 className="of-h2">Recent notifications</h2>
          {pushes.slice(0, 6).map((p) => (
            <div key={p.id} className="of-hrow">
              <div><strong>{p.title}</strong><div className="bk-sub">{p.body}</div></div>
              <div className="bk-sub" style={{ textAlign: 'right' }}>{num(p.recipients)} phones · {p.audience === 'all' ? 'everyone' : p.audience === 'buyers' ? 'signed-in customers' : 'guests'}<br />{dateTime(p.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------------ create / edit */}
      <Modal wide open={!!editing} title={editing?.offer ? 'Edit offer' : 'Create offer'} onClose={() => setEditing(null)}
        footer={editing && f ? (
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            {editing.offer
              ? <button className="btn btn-primary" disabled={busy} onClick={() => save(false)}>{busy ? 'Saving…' : 'Save changes'}</button>
              : <>
                  {/* Saving a draft is the safe default: nothing reaches customers until an admin chooses "go live". */}
                  <button className="btn btn-ghost" disabled={busy} onClick={() => save(true)}>Save and go live</button>
                  <button className="btn btn-primary" disabled={busy} onClick={() => save(false)}>{busy ? 'Saving…' : 'Save as draft'}</button>
                </>}
          </>
        ) : undefined}>
        {editing && f && (
          <div className="of-form">
            <div className="of-preview" style={{ ['--of-accent' as string]: accentHex(f.accent) }}>
              <div className="of-pv-badge">{f.badge.trim() || (isDelivery(f.kind) ? 'DELIVERY' : 'OFFER')}</div>
              <div className="of-pv-title">{f.title.trim() || 'Your offer title'}</div>
              <div className="of-pv-sub">{gives(f.kind, Number(f.value || 0), numOrNull(f.max_discount))}{Number(f.min_subtotal) > 0 ? ` · min ${money(Number(f.min_subtotal))}` : ''}</div>
              <div className="of-pv-cta">{f.mode === 'code' ? (f.code.trim().toUpperCase() || 'CODE') : 'Applies automatically'}</div>
            </div>
            <p className="of-sentence">{sentence(f, vendors, cats)}</p>

            <h3 className="of-h3">Basics</h3>
            <Field label="Title" hint="What customers read. Keep it short." error={fieldErr.title}>
              <input className="input" value={f.title} maxLength={80} placeholder="e.g. 10% off your first order" onChange={(e) => set('title', e.target.value)} />
            </Field>
            <Field label="Description" hint="Optional. One line shown under the title in the app." error={fieldErr.description}>
              <input className="input" value={f.description} maxLength={240} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <div className="of-seg" role="radiogroup" aria-label="How customers get it">
              <button type="button" role="radio" aria-checked={f.mode === 'code'} className={f.mode === 'code' ? 'is-on' : ''} disabled={!!editing.offer && editing.offer.redemptions > 0} onClick={() => set('mode', 'code')}>Customer enters a code</button>
              <button type="button" role="radio" aria-checked={f.mode === 'auto'} className={f.mode === 'auto' ? 'is-on' : ''} disabled={!!editing.offer && editing.offer.redemptions > 0} onClick={() => set('mode', 'auto')}>Applies automatically</button>
            </div>
            {f.mode === 'code' && (
              <Field label="Code" hint="3 to 24 letters, numbers, - or _. Customers can type it in any case." error={fieldErr.code}>
                <div className="row" style={{ gap: 'var(--s-2)' }}>
                  <input className="input grow" value={f.code} maxLength={24} placeholder="WELCOME10" disabled={!!editing.offer && editing.offer.redemptions > 0}
                    onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} />
                  {!(editing.offer && editing.offer.redemptions > 0) && <button type="button" className="btn btn-ghost" onClick={() => set('code', randomCode())}>Generate</button>}
                </div>
              </Field>
            )}

            <h3 className="of-h3">What it gives</h3>
            <Field label="Type" error={fieldErr.kind}>
              <select className="input" value={f.kind} disabled={!!editing.offer && editing.offer.redemptions > 0}
                onChange={(e) => { const k = e.target.value as Kind; set('kind', k); if (isDelivery(k) && f.fulfilment === 'pickup') set('fulfilment', 'any'); }}>
                {KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </Field>
            <div className="row of-two">
              {f.kind !== 'free_delivery' && (
                <Field label={f.kind.includes('percent') ? 'Percentage' : 'Amount (QAR)'} error={fieldErr.value}>
                  <input className="input" type="number" min={0} step={f.kind.includes('percent') ? 1 : 0.5} value={f.value} onChange={(e) => set('value', e.target.value)} />
                </Field>
              )}
              <Field label="Most one order can save (QAR)" hint="Optional cap per checkout." error={fieldErr.max_discount}>
                <input className="input" type="number" min={0} step="0.5" value={f.max_discount} placeholder="No cap" onChange={(e) => set('max_discount', e.target.value)} />
              </Field>
            </div>
            {(f.kind === 'percent_off' || f.kind === 'delivery_percent_off') && Number(f.value) > 50 && !f.max_discount && (
              <Alert kind="warn">A large percentage with no cap can cost a lot on big orders. Consider a cap, or a budget below.</Alert>
            )}

            <h3 className="of-h3">Who and what it applies to</h3>
            <div className="row of-two">
              <Field label="Minimum spend (QAR)" hint="On the items it applies to." error={fieldErr.min_subtotal}>
                <input className="input" type="number" min={0} step="1" value={f.min_subtotal} placeholder="No minimum" onChange={(e) => set('min_subtotal', e.target.value)} />
              </Field>
              <Field label="Orders" error={fieldErr.fulfilment}>
                <select className="input" value={f.fulfilment} onChange={(e) => set('fulfilment', e.target.value as Form['fulfilment'])}>
                  <option value="any">Delivery and collection</option>
                  <option value="delivery">Delivery only</option>
                  {!isDelivery(f.kind) && <option value="pickup">Collection only</option>}
                </select>
              </Field>
            </div>
            <div className="row of-two">
              <Field label="Applies to" error={fieldErr.scope}>
                <select className="input" value={f.scope} onChange={(e) => set('scope', e.target.value as Form['scope'])}>
                  <option value="all">Everything</option>
                  <option value="vendor">One store</option>
                  <option value="category">One category</option>
                </select>
              </Field>
              {f.scope === 'vendor' && (
                <Field label="Store" error={fieldErr.vendor_id}>
                  <select className="input" value={f.vendor_id} onChange={(e) => set('vendor_id', e.target.value)}>
                    <option value="">Choose a store…</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.business_name} — {v.city}</option>)}
                  </select>
                </Field>
              )}
              {f.scope === 'category' && (
                <Field label="Category" error={fieldErr.category_id}>
                  <select className="input" value={f.category_id} onChange={(e) => set('category_id', e.target.value)}>
                    <option value="">Choose a category…</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <label className="checkbox of-check"><input type="checkbox" checked={f.first_order_only} onChange={(e) => set('first_order_only', e.target.checked)} /> <span>First order only <small>(customers with an earlier order are not eligible)</small></span></label>

            <h3 className="of-h3">Limits</h3>
            <div className="row of-three">
              <Field label="Total uses" hint="Whole offer." error={fieldErr.usage_limit}>
                <input className="input" type="number" min={1} step="1" value={f.usage_limit} placeholder="Unlimited" onChange={(e) => set('usage_limit', e.target.value)} />
              </Field>
              <Field label="Per customer" hint="By account or phone." error={fieldErr.per_customer_limit}>
                <input className="input" type="number" min={1} step="1" value={f.per_customer_limit} placeholder="Unlimited" onChange={(e) => set('per_customer_limit', e.target.value)} />
              </Field>
              <Field label="Budget (QAR)" hint="Stops when this much is funded." error={fieldErr.budget_total}>
                <input className="input" type="number" min={1} step="1" value={f.budget_total} placeholder="No budget" onChange={(e) => set('budget_total', e.target.value)} />
              </Field>
            </div>

            <h3 className="of-h3">Schedule</h3>
            <div className="row of-two">
              <Field label="Starts" error={fieldErr.starts_at}><input className="input" type="datetime-local" value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} /></Field>
              <Field label="Ends" error={fieldErr.ends_at}><input className="input" type="datetime-local" value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} /></Field>
            </div>

            <h3 className="of-h3">In the app</h3>
            <label className="checkbox of-check"><input type="checkbox" checked={f.show_in_app} onChange={(e) => set('show_in_app', e.target.checked)} /> <span>Show in the app’s Offers <small>(turn off for a private code you hand out yourself)</small></span></label>
            <div className="row of-two">
              <Field label="Badge" hint="Optional short label, e.g. NEW" error={fieldErr.badge}>
                <input className="input" value={f.badge} maxLength={16} onChange={(e) => set('badge', e.target.value.toUpperCase())} />
              </Field>
              <Field label="Order in the list" hint="Higher shows first." error={fieldErr.priority}>
                <input className="input" type="number" min={-100} max={100} step="1" value={f.priority} onChange={(e) => set('priority', e.target.value)} />
              </Field>
            </div>
            <Field label="Colour">
              <div className="of-swatches" role="radiogroup" aria-label="Offer colour">
                {ACCENTS.map((a) => (
                  <button key={a.id} type="button" role="radio" aria-checked={f.accent === a.id} aria-label={a.id} className={f.accent === a.id ? 'is-on' : ''} style={{ background: a.hex }} onClick={() => set('accent', a.id)} />
                ))}
              </div>
            </Field>
            {err && <Alert kind="error">{err}</Alert>}
          </div>
        )}
      </Modal>

      {uses && (
        <Modal wide open title={`Uses — ${uses.offer.title}`} onClose={() => setUses(null)} footer={<button className="btn btn-ghost" onClick={() => setUses(null)}>Close</button>}>
          {!uses.rows ? <Spinner /> : uses.rows.length === 0 ? <p className="bk-sub">Nobody has used this offer yet.</p> : (
            <div className="of-table">
              <div className="of-trow of-thead"><span>Order</span><span>Customer</span><span>Store</span><span>Funded</span><span>When</span></div>
              {uses.rows.map((r) => (
                <div key={r.id} className="of-trow">
                  <span><strong>{r.order_code}</strong>{r.status === 'cancelled' && <Badge tone="red">Cancelled</Badge>}</span>
                  <span>{r.contact_name}</span>
                  <span>{r.business_name}</span>
                  <span>{money(r.goods_discount + r.delivery_discount, r.currency)}</span>
                  <span className="bk-sub">{dateTime(r.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {pushFor && <PushModal offer={pushFor === 'none' ? null : pushFor} onClose={() => setPushFor(null)} onSent={() => { setPushFor(null); load(); }} />}
      {dialog}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------- push */
function PushModal({ offer, onClose, onSent }: { offer: Offer | null; onClose: () => void; onSent: () => void }) {
  const { push: toast } = useToast();
  const [title, setTitle] = useState(offer ? offer.title : '');
  const [body, setBody] = useState(offer ? `${gives(offer.kind, offer.value, offer.max_discount)}${offer.code ? `. Use code ${offer.code} at checkout.` : '. Applied automatically at checkout.'}` : '');
  const [audience, setAudience] = useState<'all' | 'buyers' | 'guests'>('all');
  const [link, setLink] = useState(offer ? offer.link : 'sokonihub://offers');
  const [aud, setAud] = useState<{ buyers: number; guests: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api.get<{ buyers: number; guests: number; total: number }>('/offers/admin/push/audience').then(setAud).catch(() => {}); }, []);
  const reach = aud ? (audience === 'all' ? aud.total : audience === 'buyers' ? aud.buyers : aud.guests) : null;
  const LINKS = [
    { v: 'sokonihub://offers', l: 'Offers screen' }, { v: 'sokonihub://browse', l: 'Browse the market' }, { v: 'sokonihub://services', l: 'Services' },
    ...(offer && offer.link !== 'sokonihub://browse' ? [{ v: offer.link, l: offer.scope === 'vendor' ? `${offer.vendor_name ?? 'Store'}'s page` : `${offer.category_name ?? 'Category'} items` }] : []),
  ];
  const send = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.post<{ push: { recipients: number } }>('/offers/admin/push', { offer_id: offer?.id ?? null, title: title.trim(), body: body.trim(), audience, link });
      toast(`Notification sent to ${r.push.recipients} phone${r.push.recipients === 1 ? '' : 's'}`, 'success');
      onSent();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send'); } finally { setBusy(false); }
  };
  return (
    <Modal open title={offer ? `Notify customers — ${offer.title}` : 'Send a notification'} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || title.trim().length < 3 || body.trim().length < 3 || reach === 0} onClick={send}>{busy ? 'Sending…' : `Send${reach ? ` to ${num(reach)} phone${reach === 1 ? '' : 's'}` : ''}`}</button></>}>
      <div className="of-form">
      <p className="bk-sub">Goes to customers only. Vendors and riders never receive offer notifications. Customers who have not allowed notifications are not counted.</p>
      <Field label="Title" hint="Up to 65 characters."><input className="input" value={title} maxLength={65} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Message" hint="Up to 178 characters."><textarea className="input" rows={3} value={body} maxLength={178} onChange={(e) => setBody(e.target.value)} /></Field>
      <div className="row of-two">
        <Field label="Who gets it" hint={aud ? `${num(aud.buyers)} signed-in customers · ${num(aud.guests)} guest devices` : undefined}>
          <select className="input" value={audience} onChange={(e) => setAudience(e.target.value as any)}>
            <option value="all">All customers and guests</option><option value="buyers">Signed-in customers only</option><option value="guests">Guests only</option>
          </select>
        </Field>
        <Field label="Opens" hint="Where the tap takes them, inside the app.">
          <select className="input" value={link} onChange={(e) => setLink(e.target.value)}>{LINKS.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}</select>
        </Field>
      </div>
      {reach === 0 && <Alert kind="warn">No devices to reach yet. Customers appear here once they open the app and allow notifications.</Alert>}
      {err && <Alert kind="error">{err}</Alert>}
      </div>
    </Modal>
  );
}
