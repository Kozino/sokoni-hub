// web/src/components/ResetPinButton.tsx
// Put <ResetPinButton userId={u.id} name={u.full_name} /> in each row of the admin Users page.
import { useState } from 'react';
import { api, ApiError } from '../lib/api';

export default function ResetPinButton({ userId, name }: { userId: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const reset = async () => {
    if (!window.confirm(`Reset the PIN for ${name}? Their current PIN stops working now and they are signed out everywhere.`)) return;
    setBusy(true); setErr('');
    try {
      const r = await api.post<{ temp_pin: string }>('/auth/admin/reset-pin', { user_id: userId });
      setTemp(r.temp_pin);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not reset PIN');
    } finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" className="btn btn-outline btn-sm" onClick={reset} disabled={busy}>
        {busy ? 'Resetting…' : 'Reset PIN'}
      </button>
      {err && <span className="err" style={{ marginInlineStart: 8, color: 'var(--danger-text)' }}>{err}</span>}

      {temp && (
        <div className="modal-backdrop" onClick={() => setTemp(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Temporary PIN for {name}</h3>
              <button className="x-btn" aria-label="Close" onClick={() => setTemp(null)}>×</button>
            </div>
            <div className="modal-body">
              <p className="center" style={{ fontFamily: 'var(--mono)', fontSize: '2.5rem', letterSpacing: '.4em', margin: '0 0 var(--s-4)', color: 'var(--text)' }}>
                {temp}
              </p>
              <p>
                This is shown <strong>once</strong>. Send it to {name} only after confirming it is really them. It works for 48 hours:
                they sign in with their password, enter this PIN, and are then asked to create a new one.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-outline" onClick={() => navigator.clipboard?.writeText(temp)}>Copy</button>
              <button className="btn btn-primary" onClick={() => setTemp(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
