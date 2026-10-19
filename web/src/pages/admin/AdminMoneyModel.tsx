import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Spinner } from '../../components/ui';
import { useToast } from '../../state/ToastContext';

// How Sokoni Hub earns from vendors. Exactly one mode is active at a time (QC item 2).
// Changes apply straight away, with no code change.

type MoneyModel = { commission_enabled: boolean; subscription_enabled: boolean };
type Mode = 'commission' | 'subscription';

const toModel = (mode: Mode): MoneyModel => ({
  commission_enabled: mode === 'commission',
  subscription_enabled: mode === 'subscription',
});

const toMode = (m: MoneyModel): Mode => (m.commission_enabled ? 'commission' : 'subscription');

export function AdminMoneyModel() {
  const toast = useToast();
  const [model, setModel] = useState<MoneyModel | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<MoneyModel>('/admin/money-model').then(setModel).catch(() => {});
  }, []);

  if (!model) return <Spinner />;

  const current = toMode(model);

  const choose = async (mode: Mode) => {
    if (mode === current || busy) return;
    setBusy(true);
    try {
      const saved = await api.put<MoneyModel>('/admin/money-model', toModel(mode));
      setModel(saved);
      toast.push('Money model updated', 'success');
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not update the money model', 'error');
    } finally {
      setBusy(false);
    }
  };

  const option = (mode: Mode, title: string, text: string) => {
    const active = current === mode;
    return (
      <label
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          padding: '12px 14px',
          marginTop: 10,
          borderRadius: 10,
          border: `2px solid ${active ? '#047857' : 'var(--border, #e5e7eb)'}`,
          background: active ? 'rgba(4,120,87,.06)' : 'transparent',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        <input
          type="radio"
          name="money-model"
          value={mode}
          checked={active}
          disabled={busy}
          onChange={() => void choose(mode)}
          style={{ marginTop: 4, width: 18, height: 18 }}
        />
        <span>
          <strong>{title}</strong>{' '}
          <span style={{ fontSize: '.8rem', color: active ? '#047857' : 'var(--muted)' }}>{active ? 'Active' : ''}</span>
          <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginTop: 4 }}>{text}</div>
        </span>
      </label>
    );
  };

  return (
    <div className="card card-pad" style={{ maxWidth: 640, marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Money model</h3>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Choose one model. Switching takes effect straight away.
      </p>
      {option(
        'commission',
        'Commission per order',
        'Sokoni Hub takes the commission rate set below from each delivered order (the model used by delivery companies such as Talabat). Plan limits do not apply, and vendors need no plan.',
      )}
      {option(
        'subscription',
        'Monthly subscription plans',
        'Vendors buy Standard or Pro plans, and plan limits apply. No commission is charged. The plan page is shown to vendors.',
      )}
    </div>
  );
}
