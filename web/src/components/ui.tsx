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

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={value === t.id ? 'active' : ''} onClick={() => onChange(t.id)}>
          {t.label}{t.count !== undefined && ` (${t.count})`}
        </button>
      ))}
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
