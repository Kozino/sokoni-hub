// The file that currently holds Login and Register.
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, type LoginStep } from '../state/AuthContext';
import { ApiError } from '../lib/api';
import { Alert, Field } from '../components/ui';
import PinField from '../components/PinField';
import { useT } from '../i18n';
import type { User } from '../types';

const SUPPORT_WHATSAPP = '97466046431'; // same support number as the footer

type Stage = Exclude<LoginStep, { step: 'done' }>;

export function Login() {
  const t = useT();
  const { login, verifyPin, setupPin } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [f, setF] = useState({ identifier: '', password: '' });
  const [stage, setStage] = useState<Stage | null>(null); // null = password step
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const goHome = (u: User) =>
    nav(params.get('next') || (u.role === 'admin' ? '/admin' : u.role === 'vendor' ? '/vendor' : '/'), { replace: true });

  const advance = (r: LoginStep) => {
    if (r.step === 'done') return goHome(r.user);
    setStage(r); setPin(''); setPin2('');
  };

  const run = async (fn: () => Promise<void>) => {
    setErr(''); setBusy(true);
    try { await fn(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  };

  const startOver = () => { setStage(null); setPin(''); setPin2(''); setErr(''); };

  /* ---- step 2: enter PIN ---- */
  if (stage?.step === 'pin') {
    const first = stage.fullName.split(' ')[0];
    const helpMsg = encodeURIComponent('Hi, I forgot my Sokoni Hub PIN and need it reset.');
    return (
      <div className="container container-narrow">
        <div className="card card-pad">
          <h1>Enter your PIN</h1>
          <p style={{ color: 'var(--muted)' }}>{first ? `Hi ${first}, e` : 'E'}nter your 4-digit PIN to finish signing in.</p>
          <form onSubmit={(e) => { e.preventDefault(); run(async () => advance(await verifyPin(stage.pinToken, pin))); }}>
            <Alert kind="error">{err}</Alert>
            <PinField label="4-digit PIN" value={pin} onChange={setPin} autoFocus />
            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy || pin.length !== 4}>
              {busy ? t('auth.loggingIn') : t('auth.login.cta')}
            </button>
          </form>
          <div className="pin-help">
            Forgot your PIN?{' '}
            <a href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${helpMsg}`} target="_blank" rel="noopener noreferrer">
              Message support on WhatsApp
            </a>{' '}
            and we will reset it once we have confirmed it is you.
          </div>
          <p className="center mt-3" style={{ margin: 0 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={startOver}>← Use a different account</button>
          </p>
        </div>
      </div>
    );
  }

  /* ---- create a PIN (existing accounts, or after an admin reset) ---- */
  if (stage?.step === 'setup') {
    const submitSetup = (e: React.FormEvent) => {
      e.preventDefault();
      if (pin !== pin2) return setErr('The two PINs do not match');
      run(async () => goHome(await setupPin({ setupToken: stage.setupToken, pin, email: stage.needsEmail ? email : undefined })));
    };
    return (
      <div className="container container-narrow">
        <div className="card card-pad">
          <h1>Create your PIN</h1>
          <p style={{ color: 'var(--muted)' }}>
            For extra security, Sokoni Hub now asks for a 4-digit PIN after your password each time you sign in.
          </p>
          <form onSubmit={submitSetup}>
            <Alert kind="error">{err}</Alert>
            {stage.needsEmail && (
              <Field label="Email address *" hint="Every account now needs an email address.">
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </Field>
            )}
            <div className="form-row">
              <PinField label="New PIN" value={pin} onChange={setPin} autoFocus />
              <PinField label="Confirm PIN" value={pin2} onChange={setPin2} />
            </div>
            <button type="submit" className="btn btn-primary btn-block btn-lg"
              disabled={busy || pin.length !== 4 || pin2.length !== 4}>
              {busy ? t('auth.creating') : 'Save PIN and continue'}
            </button>
          </form>
          <p className="center mt-3" style={{ margin: 0 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={startOver}>← Cancel</button>
          </p>
        </div>
      </div>
    );
  }

  /* ---- step 1: identifier + password ---- */
  return (
    <div className="container container-narrow">
      <div className="card card-pad">
        <h1>{t('auth.login.title')}</h1>
        <p style={{ color: 'var(--muted)' }}>{t('auth.login.sub')}</p>
        <form onSubmit={(e) => { e.preventDefault(); run(async () => advance(await login(f.identifier, f.password))); }}>
          <Alert kind="error">{err}</Alert>
          <Field label={t('auth.identifier')}>
            <input required value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} placeholder="+234 801 234 5678" autoComplete="username" />
          </Field>
          <Field label={t('auth.password')}>
            <input required type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
          </Field>
          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? t('auth.loggingIn') : t('auth.login.cta')}</button>
        </form>
        <p className="center mt-3" style={{ margin: 0 }}>
          {t('auth.noAccount')} <Link to="/register">{t('auth.createOne')}</Link> · <Link to="/sell">{t('auth.sellOn')}</Link>
        </p>
      </div>
    </div>
  );
}

export function Register() {
  const t = useT();
  const { register } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initialRole = params.get('role') === 'vendor' ? 'vendor' : 'buyer';
  const [f, setF] = useState({
    full_name: '', phone: '', email: '', password: '', confirm: '', pin: '', pinConfirm: '',
    role: initialRole as 'buyer' | 'vendor', agree: false,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (f.password !== f.confirm) return setErr('Passwords do not match');
    if (f.pin !== f.pinConfirm) return setErr('The two PINs do not match');
    if (!f.agree) return setErr('You must accept the marketplace rules');
    setBusy(true);
    try {
      const u = await register({ full_name: f.full_name, phone: f.phone, email: f.email, password: f.password, pin: f.pin, role: f.role });
      nav(u.role === 'vendor' ? '/vendor/onboard' : '/', { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Registration failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="container container-narrow">
      <div className="card card-pad">
        <h1>{t('auth.register.title')}</h1>
        <form onSubmit={submit}>
          <Alert kind="error">{err}</Alert>

          <Field label={t('auth.iWantTo')}>
            <div className="grid grid-2" style={{ gap: 10 }}>
              {([['buyer', `🛒 ${t('auth.roleBuyer')}`], ['vendor', `🏪 ${t('auth.roleVendor')}`]] as const).map(([v, label]) => (
                <label key={v} className="checkbox card card-pad" style={{ borderColor: f.role === v ? 'var(--terra)' : undefined, margin: 0 }}>
                  <input type="radio" checked={f.role === v} onChange={() => setF({ ...f, role: v })} />
                  <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{label}</span>
                </label>
              ))}
            </div>
          </Field>

          <Field label={t('auth.fullNameReq')}><input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <div className="form-row">
            <Field label={t('auth.phoneReq')} hint={t('auth.phoneHint')}><input required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+234 801 234 5678" /></Field>
            <Field label="Email address *"><input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
          </div>
          <div className="form-row">
            <Field label={t('auth.passwordReq')} hint={t('auth.passwordHint')}><input required type="password" minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
            <Field label={t('auth.confirmPassword')}><input required type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} autoComplete="new-password" /></Field>
          </div>
          <div className="form-row">
            <PinField label="Create a 4-digit PIN *" hint="You will enter this after your password every time you sign in." value={f.pin} onChange={(v) => setF({ ...f, pin: v })} />
            <PinField label="Confirm PIN *" value={f.pinConfirm} onChange={(v) => setF({ ...f, pinConfirm: v })} />
          </div>

          <label className="checkbox mb-2">
            <input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} />
            <span>{t('auth.rulesConfirm')}</span>
          </label>

          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? t('auth.creating') : t('auth.register.cta')}</button>
        </form>
        <p className="center mt-3" style={{ margin: 0 }}>{t('auth.alreadyRegistered')} <Link to="/login">{t('auth.login.cta')}</Link></p>
      </div>
    </div>
  );
}
