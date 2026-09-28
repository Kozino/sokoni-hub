import { ReactNode, useEffect, useState } from 'react';
import { IconBox, IconReceipt, IconChart, IconCheck, IconInbox, IconAlert, IconSearch } from './icons';

/* Pages pass an emoji to <Empty icon="..."/>. Rather than edit every call site,
   emoji are mapped to the line-icon set here so empty states match the rest of
   the UI; anything unmapped falls through and renders as given. */
const EMPTY_ICONS: Record<string, ReactNode> = {
  '📦': IconBox, '🧾': IconReceipt, '📈': IconChart, '📊': IconChart,
  '✅': IconCheck, '📭': IconInbox, '⚠️': IconAlert, '🔍': IconSearch,
};

export const Spinner = () => <div className="spinner" />;

export function Alert({ kind = 'info', children }: { kind?: 'error' | 'success' | 'warn' | 'info'; children: ReactNode }) {
  if (!children) return null;
  return <div className={`alert alert-${kind}`}>{children}</div>;
}

export function Badge({ tone = 'grey', children }: { tone?: 'grey' | 'green' | 'gold' | 'red' | 'blue' | 'terra'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

const STATUS_TONES: Record<string, 'grey' | 'green' | 'gold' | 'red' | 'blue' | 'terra'> = {
  pending: 'gold', verified: 'green', rejected: 'red', suspended: 'red',
  active: 'green', paused: 'gold', draft: 'grey', removed: 'red', pending_review: 'gold',
  confirmed: 'blue', dispatched: 'terra', delivered: 'green', cancelled: 'red',
  open: 'red', investigating: 'gold', resolved: 'green', dismissed: 'grey',
};

export const StatusBadge = ({ status }: { status: string }) => (
  <Badge tone={STATUS_TONES[status] ?? 'grey'}>{status.replace(/_/g, ' ')}</Badge>
);

export function Empty({ icon = '📭', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  const mapped = EMPTY_ICONS[icon];
  return (
    <div className="empty">
      <div className="ico">{mapped ?? icon}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: string; accent?: 'terra' | 'green' | 'gold' | 'red' | 'blue' }) {
  return (
    <div className={`stat${accent ? ` accent-${accent}` : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="x-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <div className="err">{error}</div>}
    </div>
  );
}

/**
 * Tab strip.
 *
 * Carries real tab semantics: a screen reader announces "tab 2 of 3, selected",
 * and Left/Right/Home/End move between tabs as the platform conventions
 * require. Previously these were plain buttons, which read as an unrelated row
 * of controls.
 *
 * `panelId` opts a caller into the full tab/tabpanel pairing. Callers that use
 * Tabs purely as a filter row (the admin tables) leave it off and are
 * unaffected.
 */
export function Tabs<T extends string>({ tabs, value, onChange, panelId }: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  panelId?: string;
}) {
  const keyNav = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === value);
    if (i < 0) return;
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next].id);
    // Follow focus, so the next Tab keypress leaves the strip rather than
    // walking the remaining tabs.
    (e.currentTarget.querySelectorAll('button')[next] as HTMLButtonElement | undefined)?.focus();
  };

  return (
    <div className="tabs" role="tablist" onKeyDown={keyNav}>
      {tabs.map((t) => {
        const selected = value === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            id={panelId ? `${panelId}-tab-${t.id}` : undefined}
            aria-selected={selected}
            aria-controls={panelId}
            // Roving tabindex: the strip is one stop, arrows move within it.
            tabIndex={selected ? 0 : -1}
            className={selected ? 'active' : ''}
            onClick={() => onChange(t.id)}
          >
            {t.label}{t.count !== undefined && ` (${t.count})`}
          </button>
        );
      })}
    </div>
  );
}

/** Styled stand-in for window.confirm() for destructive actions. Renders nothing until asked. */
export function ConfirmDialog({ state, onCancel, onConfirm }: {
  state: { title: string; body: ReactNode; confirmLabel?: string; danger?: boolean } | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={!!state}
      title={state?.title ?? ''}
      onClose={onCancel}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={`btn ${state?.danger === false ? 'btn-primary' : 'btn-danger'}`} onClick={onConfirm}>
            {state?.confirmLabel ?? 'Confirm'}
          </button>
        </>
      }
    >
      {state?.body}
    </Modal>
  );
}

/**
 * Replaces window.confirm() for destructive actions with the app's own modal.
 * Usage: const confirm = useConfirm(); const ok = await confirm({ title, body }); if (!ok) return;
 */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; body: ReactNode; confirmLabel?: string; danger?: boolean } | null>(null);
  const [resolver, setResolver] = useState<((v: boolean) => void) | null>(null);

  const confirm = (opts: { title: string; body: ReactNode; confirmLabel?: string; danger?: boolean }) =>
    new Promise<boolean>((resolve) => {
      setState(opts);
      setResolver(() => resolve);
    });

  const close = (result: boolean) => {
    resolver?.(result);
    setState(null);
    setResolver(null);
  };

  const dialog = <ConfirmDialog state={state} onCancel={() => close(false)} onConfirm={() => close(true)} />;
  return { confirm, dialog };
}

/* Quantity stepper: type freely (the field is allowed to go blank mid-edit)
   and only clamps to [min,max] on blur/Enter/±click — a plain controlled
   <input type="number"> that clamps on every keystroke can never be emptied
   out to retype, since the re-render snaps it straight back to the old value. */
export function QtyInput({
  value, onChange, min = 1, max,
}: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const [raw, setRaw] = useState(String(value));

  useEffect(() => { setRaw(String(value)); }, [value]);

  const clamp = (n: number) => Math.min(Math.max(n, min), max ?? Infinity);
  const commit = (n: number) => { const c = clamp(isNaN(n) ? min : n); onChange(c); setRaw(String(c)); };

  return (
    <div className="qty-stepper">
      <button type="button" className="qty-btn" aria-label="Decrease quantity"
        onClick={() => commit((raw === '' ? value : Number(raw)) - 1)}>−</button>
      <input
        type="text" inputMode="numeric" pattern="[0-9]*" className="qty-input"
        value={raw}
        onChange={(e) => { const v = e.target.value; if (/^\d*$/.test(v)) setRaw(v); }}
        onBlur={() => commit(raw === '' ? min : Number(raw))}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      <button type="button" className="qty-btn" aria-label="Increase quantity"
        onClick={() => commit((raw === '' ? value : Number(raw)) + 1)}>+</button>
    </div>
  );
}
