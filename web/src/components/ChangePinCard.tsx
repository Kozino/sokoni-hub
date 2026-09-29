// web/src/components/ChangePinCard.tsx
// Drop <ChangePinCard /> into the buyer account page and the vendor store-profile page.
import { useState } from 'react';
import { api, ApiError, setToken } from '../lib/api';
import { Alert } from './ui';
import PinField from './PinField';

export default function ChangePinCard() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setOk('');
    if (next !== again) return setErr('The two new PINs do not match');
    setBusy(true);
    try {
      const r = await api.post<{ ok: boolean; token: string }>('/auth/pin/change', { current_pin: cur, new_pin: next });
      setToken(r.token); // other devices are signed out; keep this one signed in
      setCur(''); setNext(''); setAgain('');
      setOk('PIN changed. You have been signed out on your other devices.');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not change PIN');
    } finally { setBusy(false); }
  };

  return (
    <form className="card card-pad" onSubmit={submit}>
      <h3>Change PIN</h3>
      <p style={{ color: 'var(--muted)' }}>Your 4-digit PIN is asked for after your password each time you sign in.</p>
      <Alert kind="error">{err}</Alert>
      <Alert kind="success">{ok}</Alert>
      <PinField label="Current PIN" value={cur} onChange={setCur} />
      <div className="form-row">
        <PinField label="New PIN" value={next} onChange={setNext} />
        <PinField label="Confirm new PIN" value={again} onChange={setAgain} />
      </div>
      <button className="btn btn-primary" disabled={busy || cur.length !== 4 || next.length !== 4 || again.length !== 4}>
        {busy ? 'Saving…' : 'Change PIN'}
      </button>
    </form>
  );
}
