/**
 * Vendor inventory.
 *
 * Products only. A vendor who sells services has no stock, and this page — plus
 * its nav entry and its dashboard card — is hidden from them entirely rather
 * than shown reading zero, which would train them to ignore stock warnings that
 * will never apply.
 *
 * The page answers two questions and nothing else:
 *
 *   what do I need to reorder, and how urgently?   -> the list, sorted by urgency
 *   why does this say 12 when I counted 15?        -> the movement ledger
 *
 * Ordering is by state then by 30-day sales, so the product costing the most
 * money right now is at the top. Alphabetical would bury it.
 *
 * Reuses the .bk-* responsive grid from the bookings inbox: aligned columns on
 * desktop, stacked cards on a phone. Same reasoning — a vendor checking stock is
 * usually standing in front of the stock, on a phone.
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { Alert, Badge, Empty, Field, Modal, Spinner, Stat, Tabs } from '../../components/ui';
import { useToast } from '../../state/ToastContext';
import { money, num, timeAgo, titleCase } from '../../lib/format';

type State = 'out' | 'low' | 'ok' | 'untracked';

interface Item {
  id: string; title: string; quantity: number | null; unit: string | null;
  price: string; currency: string; status: string;
  threshold: number; threshold_override: number | null;
  reorder_to: number | null; reorder_qty: number | null;
  supplier_note: string | null; stock_state: State; sold_30d: number;
  last_counted_at: string | null;
}
interface Movement {
  id: string; delta: number; balance_after: number; reason: string;
  note: string | null; created_at: string; title: string; unit: string | null;
  actor_name: string | null; order_code: string | null;
}

const TONE: Record<State, 'red' | 'gold' | 'green' | 'grey'> = {
  out: 'red', low: 'gold', ok: 'green', untracked: 'grey',
};
const REASONS = [
  { id: 'restock', label: 'Received new stock', hint: 'A delivery arrived from your supplier.' },
  { id: 'adjustment', label: 'Correcting a count', hint: 'You counted the shelf and the number was wrong.' },
  { id: 'return', label: 'Customer returned it', hint: 'An item came back and can be sold again.' },
  { id: 'damage', label: 'Damaged or expired', hint: 'Writing stock off so it is not sold.' },
] as const;

export default function VendorInventory() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [tab, setTab] = useState<'needs_attention' | 'all' | 'untracked'>('needs_attention');
  const [q, setQ] = useState('');
  const [def, setDef] = useState(5);
  const [err, setErr] = useState('');
  const { push } = useToast();

  // Adjust drawer
  const [adjust, setAdjust] = useState<Item | null>(null);
  const [mode, setMode] = useState<'delta' | 'count'>('delta');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<typeof REASONS[number]['id']>('restock');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Rules drawer
  const [rules, setRules] = useState<Item | null>(null);
  const [rThreshold, setRThreshold] = useState('');
  const [rReorder, setRReorder] = useState('');
  const [rSupplier, setRSupplier] = useState('');

  // Ledger
  const [ledgerFor, setLedgerFor] = useState<Item | null>(null);
  const [movements, setMovements] = useState<Movement[] | null>(null);

  const load = () =>
    api.get<{ items: Item[]; threshold_default: number }>('/inventory')
      .then((r) => { setItems(r.items); setDef(r.threshold_default); })
      .catch((e) => setErr(e.message));

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const i = items ?? [];
    return {
      needs: i.filter((x) => x.stock_state === 'out' || x.stock_state === 'low').length,
      all: i.length,
      untracked: i.filter((x) => x.stock_state === 'untracked').length,
      out: i.filter((x) => x.stock_state === 'out').length,
      reorder: i.reduce((s, x) => s + (x.stock_state !== 'ok' ? (x.reorder_qty ?? 0) : 0), 0),
    };
  }, [items]);

  const shown = (items ?? [])
    .filter((i) => tab === 'all'
      || (tab === 'untracked' && i.stock_state === 'untracked')
      || (tab === 'needs_attention' && (i.stock_state === 'out' || i.stock_state === 'low')))
    .filter((i) => !q || i.title.toLowerCase().includes(q.toLowerCase()));

  const openAdjust = (i: Item) => {
    setAdjust(i); setMode('delta'); setAmount(''); setReason('restock'); setNote(''); setErr('');
  };
  const openRules = (i: Item) => {
    setRules(i);
    setRThreshold(i.threshold_override === null ? '' : String(i.threshold_override));
    setRReorder(i.reorder_to === null ? '' : String(i.reorder_to));
    setRSupplier(i.supplier_note ?? '');
    setErr('');
  };
  const openLedger = (i: Item) => {
    setLedgerFor(i); setMovements(null);
    api.get<{ movements: Movement[] }>(`/inventory/movements?listing_id=${i.id}`)
      .then((r) => setMovements(r.movements)).catch((e) => setErr(e.message));
  };

  const submitAdjust = async () => {
    if (!adjust) return;
    const n = Number(amount);
    if (!amount.trim() || Number.isNaN(n)) { setErr('Enter a number'); return; }
    setBusy(true); setErr('');
    try {
      const body = mode === 'delta'
        ? { delta: n, reason, note: note || undefined }
        : { set_to: n, reason, note: note || undefined };
      const r = await api.post<{ item: Item }>(`/inventory/${adjust.id}/adjust`, body);
      setItems((prev) => (prev ?? []).map((x) => (x.id === r.item.id ? r.item : x)));
      push(`${r.item.title} is now ${r.item.quantity} ${r.item.unit || 'units'}`, 'success');
      setAdjust(null);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const submitRules = async () => {
    if (!rules) return;
    setBusy(true); setErr('');
    try {
      const r = await api.patch<{ item: Item }>(`/inventory/${rules.id}/settings`, {
        low_stock_threshold: rThreshold.trim() === '' ? null : Number(rThreshold),
        reorder_to: rReorder.trim() === '' ? null : Number(rReorder),
        supplier_note: rSupplier.trim() === '' ? null : rSupplier.trim(),
      });
      setItems((prev) => (prev ?? []).map((x) => (x.id === r.item.id ? r.item : x)));
      push('Reorder rules saved', 'success');
      setRules(null);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const saveDefault = async (v: number) => {
    try {
      await api.patch('/inventory/settings', { low_stock_threshold: v });
      setDef(v); await load();
      push(`Warning you at ${v} units and below`, 'success');
    } catch (e: any) { setErr(e.message); }
  };

  if (!items) return <Spinner />;

  // A vendor with no products at all should not have reached this page, but the
  // nav is driven by an async count, so handle it rather than show an empty grid.
  if (items.length === 0) {
    return (
      <>
        <h1 className="dash-title">Inventory</h1>
        <Empty icon="📦" title="No products yet"
          text="Inventory tracking is for physical products. Add a product listing and its stock will appear here." />
      </>
    );
  }

  return (
    <>
      <h1 className="dash-title">Inventory</h1>
      <p className="bk-sub">
        Stock counts down automatically as orders come in. Record what you receive so the
        numbers stay true.
      </p>

      <div className="grid grid-stats bk-stats mt-2">
        <Stat label="Out of stock" value={counts.out} accent={counts.out > 0 ? 'red' : 'green'}
          sub={counts.out > 0 ? 'Losing sales now' : 'Nothing sold out'} />
        <Stat label="Running low" value={counts.needs - counts.out}
          accent={counts.needs - counts.out > 0 ? 'gold' : 'green'} sub={`At or below your limit`} />
        <Stat label="Units to reorder" value={num(counts.reorder)} sub="Across flagged products" />
      </div>

      {err && <Alert kind="error">{err}</Alert>}

      {counts.out > 0 && (
        <Alert kind="warn">
          {counts.out} product{counts.out === 1 ? ' is' : 's are'} out of stock. Buyers can still
          see {counts.out === 1 ? 'it' : 'them'}, but cannot order — restock or pause to keep your
          storefront honest.
        </Alert>
      )}

      {counts.untracked > 0 && tab !== 'untracked' && (
        <Alert kind="info">
          {counts.untracked} product{counts.untracked === 1 ? ' has' : 's have'} no stock count, so
          {counts.untracked === 1 ? ' it is' : ' they are'} never flagged.{' '}
          <button className="btn btn-ghost btn-sm" onClick={() => setTab('untracked')}>
            Start counting {counts.untracked === 1 ? 'it' : 'them'}
          </button>
        </Alert>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'needs_attention' as const, label: 'Needs attention', count: counts.needs },
          { id: 'all' as const, label: 'All products', count: counts.all },
          { id: 'untracked' as const, label: 'Not counted', count: counts.untracked },
        ]}
      />

      <div className="filters">
        <input className="input" placeholder="Search products…" value={q}
          onChange={(e) => setQ(e.target.value)} />
        <label className="inv-default">
          <span>Warn me at</span>
          <input className="input inv-default-input" type="number" min={0} defaultValue={def}
            onBlur={(e) => { const v = Number(e.target.value); if (v !== def && v >= 0) saveDefault(v); }} />
          <span>units or fewer</span>
        </label>
      </div>

      {shown.length === 0 ? (
        <Empty
          icon={tab === 'needs_attention' ? '✅' : '🔍'}
          title={tab === 'needs_attention' ? 'Everything is in stock' : 'Nothing matches'}
          text={tab === 'needs_attention'
            ? 'No product is at or below its reorder point.'
            : 'Try a different search.'}
        />
      ) : (
        <div className="bk-list inv-list mt-3">
          <div className="bk-head">
            <span>Product</span><span>In stock</span><span>Reorder point</span>
            <span>Sold (30d)</span><span>Status</span><span />
          </div>

          {shown.map((i) => (
            <div key={i.id} className={`bk-item inv-${i.stock_state}`}>
              <div className="bk-c-ref inv-c-title">
                <strong>{i.title}</strong>
                <span className="bk-sub">{money(i.price, i.currency)}</span>
              </div>

              <div className="bk-c-service">
                <span className="bk-label">In stock</span>
                <strong className={i.stock_state === 'out' ? 'inv-zero' : undefined}>
                  {i.quantity === null ? 'Not counted' : `${num(i.quantity)} ${i.unit || 'units'}`}
                </strong>
                {i.reorder_qty ? <span className="bk-sub">Buy {num(i.reorder_qty)} to reach {num(i.reorder_to!)}</span> : null}
              </div>

              <div className="bk-c-customer">
                <span className="bk-label">Reorder point</span>
                <span>{i.threshold} {i.unit || 'units'}</span>
                <span className="bk-sub">
                  {i.threshold_override === null ? 'Your default' : 'Set for this product'}
                </span>
              </div>

              <div className="bk-c-when">
                <span className="bk-label">Sold (30 days)</span>
                <span>{num(i.sold_30d)}</span>
                {i.last_counted_at
                  ? <span className="bk-sub">Counted {timeAgo(i.last_counted_at)}</span>
                  : <span className="bk-sub">Never counted</span>}
              </div>

              <div className="bk-c-status">
                <span className="bk-label">Status</span>
                <Badge tone={TONE[i.stock_state]}>
                  {i.stock_state === 'out' ? 'Out of stock'
                    : i.stock_state === 'low' ? 'Low'
                    : i.stock_state === 'untracked' ? 'Not counted' : 'In stock'}
                </Badge>
              </div>

              <div className="bk-c-action inv-actions">
                <button className="btn btn-primary btn-sm" onClick={() => openAdjust(i)}>
                  Update stock
                </button>
                <button className="btn btn-ghost btn-sm" title="Reorder rules" onClick={() => openRules(i)}>
                  Rules
                </button>
                <button className="btn btn-ghost btn-sm" title="Stock history" onClick={() => openLedger(i)}>
                  History
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------------- update stock ---------------- */}
      <Modal open={!!adjust} title={adjust ? `Update ${adjust.title}` : ''} onClose={() => setAdjust(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setAdjust(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={submitAdjust}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </>
        }>
        {adjust && (
          <>
            <p className="bk-sub">
              Currently {adjust.quantity === null ? 'not counted' : `${num(adjust.quantity)} ${adjust.unit || 'units'}`}.
            </p>

            <div className="inv-mode">
              <button className={`btn btn-sm ${mode === 'delta' ? 'btn-primary' : ''}`}
                onClick={() => setMode('delta')}>Add or remove</button>
              <button className={`btn btn-sm ${mode === 'count' ? 'btn-primary' : ''}`}
                onClick={() => setMode('count')}>Set exact count</button>
            </div>

            <Field
              label={mode === 'delta' ? 'Change by' : 'New total'}
              hint={mode === 'delta'
                ? 'Use a minus sign to remove, e.g. -3. Safer than typing a total: it cannot wipe out a sale that happens while you type.'
                : 'Use this after physically counting the shelf.'}>
              <input className="input" type="number" inputMode="numeric" value={amount}
                placeholder={mode === 'delta' ? 'e.g. 50' : 'e.g. 12'}
                onChange={(e) => setAmount(e.target.value)} autoFocus />
            </Field>

            {mode === 'delta' && amount.trim() !== '' && !Number.isNaN(Number(amount)) && (
              <p className="bk-sub">
                New total: <strong>{Math.max(0, (adjust.quantity ?? 0) + Number(amount))}</strong> {adjust.unit || 'units'}
              </p>
            )}

            <Field label="Why" hint={REASONS.find((r) => r.id === reason)?.hint}>
              <select className="input" value={reason} onChange={(e) => setReason(e.target.value as any)}>
                {REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </Field>

            <Field label="Note" hint="Optional. Shows in the product's history.">
              <input className="input" value={note} maxLength={500}
                placeholder="e.g. Invoice 4471" onChange={(e) => setNote(e.target.value)} />
            </Field>

            {err && <Alert kind="error">{err}</Alert>}
          </>
        )}
      </Modal>

      {/* ---------------- reorder rules ---------------- */}
      <Modal open={!!rules} title={rules ? `Reorder rules — ${rules.title}` : ''} onClose={() => setRules(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setRules(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={submitRules}>
              {busy ? 'Saving…' : 'Save rules'}
            </button>
          </>
        }>
        {rules && (
          <>
            <Field label="Warn me at"
              hint={`Leave empty to use your default of ${def}. Set 0 to never warn for this product.`}>
              <input className="input" type="number" min={0} value={rThreshold}
                placeholder={`${def} (your default)`}
                onChange={(e) => setRThreshold(e.target.value)} />
            </Field>
            <Field label="Restock up to" hint="Optional. Lets this page tell you how many to buy.">
              <input className="input" type="number" min={1} value={rReorder}
                placeholder="e.g. 100" onChange={(e) => setRReorder(e.target.value)} />
            </Field>
            <Field label="Supplier note" hint="Optional. Who you buy this from, or a reference.">
              <input className="input" value={rSupplier} maxLength={500}
                placeholder="e.g. Mama Ade, Souq Waqif" onChange={(e) => setRSupplier(e.target.value)} />
            </Field>
            {err && <Alert kind="error">{err}</Alert>}
          </>
        )}
      </Modal>

      {/* ---------------- history ---------------- */}
      <Modal open={!!ledgerFor} title={ledgerFor ? `Stock history — ${ledgerFor.title}` : ''}
        onClose={() => setLedgerFor(null)}
        footer={<button className="btn btn-ghost" onClick={() => setLedgerFor(null)}>Close</button>}>
        {!movements ? <Spinner /> : movements.length === 0 ? (
          <Empty icon="🧾" title="No movements yet" text="Changes to this product's stock will be listed here." />
        ) : (
          <ul className="inv-ledger">
            {movements.map((m) => (
              <li key={m.id}>
                <span className={`inv-delta ${m.delta > 0 ? 'up' : 'down'}`}>
                  {m.delta > 0 ? `+${m.delta}` : m.delta}
                </span>
                <span className="inv-ledger-body">
                  <strong>{titleCase(m.reason)}</strong>
                  {m.order_code ? <span className="bk-sub"> · order {m.order_code}</span> : null}
                  {m.note ? <span className="bk-sub"> · {m.note}</span> : null}
                  <span className="bk-sub">
                    {timeAgo(m.created_at)} · left {num(m.balance_after)} {m.unit || 'units'}
                    {m.actor_name ? ` · ${m.actor_name}` : ' · automatic'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
