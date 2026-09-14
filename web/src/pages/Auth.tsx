import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { ApiError } from '../lib/api';
import { Alert, Field } from '../components/ui';

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [f, setF] = useState({ identifier: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const u = await login(f.identifier, f.password);
      const next = params.get('next');
      nav(next || (u.role === 'admin' ? '/admin' : u.role === 'vendor' ? '/vendor' : '/'), { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Login failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="container container-narrow">
      <div className="card card-pad">
        <h1>Welcome back</h1>
        <p style={{ color: 'var(--muted)' }}>Log in to manage your store or track your orders.</p>
        <form onSubmit={submit}>
          <Alert kind="error">{err}</Alert>
          <Field label="Phone number or email">
            <input required value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} placeholder="+234 801 234 5678" autoComplete="username" />
          </Field>
          <Field label="Password">
            <input required type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
          </Field>
          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        </form>
        <p className="center mt-3" style={{ margin: 0 }}>
          No account? <Link to="/register">Create one</Link> · <Link to="/sell">Sell on Sokoni</Link>
        </p>
      </div>
    </div>
  );
}

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initialRole = params.get('role') === 'vendor' ? 'vendor' : 'buyer';
  const [f, setF] = useState({ full_name: '', phone: '', email: '', password: '', confirm: '', role: initialRole as 'buyer' | 'vendor', agree: false });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (f.password !== f.confirm) return setErr('Passwords do not match');
    if (!f.agree) return setErr('You must accept the marketplace rules');
    setBusy(true);
    try {
      const u = await register({ full_name: f.full_name, phone: f.phone, email: f.email || undefined, password: f.password, role: f.role });
      nav(u.role === 'vendor' ? '/vendor/onboard' : '/', { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Registration failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="container container-narrow">
      <div className="card card-pad">
        <h1>Create your account</h1>
        <form onSubmit={submit}>
          <Alert kind="error">{err}</Alert>

          <Field label="I want to…">
            <div className="grid grid-2" style={{ gap: 10 }}>
              {([['buyer', '🛒 Buy goods & book services'], ['vendor', '🏪 Sell goods or offer services']] as const).map(([v, label]) => (
                <label key={v} className="checkbox card card-pad" style={{ borderColor: f.role === v ? 'var(--terra)' : undefined, margin: 0 }}>
                  <input type="radio" checked={f.role === v} onChange={() => setF({ ...f, role: v })} />
                  <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{label}</span>
                </label>
              ))}
            </div>
          </Field>

          <Field label="Full name *"><input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <div className="form-row">
            <Field label="Phone number *" hint="Used to log in"><input required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+234 801 234 5678" /></Field>
            <Field label="Email (optional)"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          </div>
          <div className="form-row">
            <Field label="Password *" hint="At least 6 characters"><input required type="password" minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
            <Field label="Confirm password *"><input required type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} autoComplete="new-password" /></Field>
          </div>

          <label className="checkbox mb-2">
            <input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} />
            <span>I confirm I will not list <strong>cosmetics</strong> or <strong>medicine/drugs</strong>, and I accept the marketplace rules.</span>
          </label>

          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        </form>
        <p className="center mt-3" style={{ margin: 0 }}>Already registered? <Link to="/login">Log in</Link></p>
      </div>
    </div>
  );
}
