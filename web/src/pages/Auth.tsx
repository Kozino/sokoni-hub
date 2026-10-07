// The file that currently holds Login and Register.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, type LoginStep } from '../state/AuthContext';
import { ApiError } from '../lib/api';
import { Field } from '../components/ui';
import PinField from '../components/PinField';
import { useT } from '../i18n';
import type { User } from '../types';
import { AuthShell } from './AuthShell'; // UI only – shared split-screen layout

const SUPPORT_WHATSAPP = '97466046431'; // same support number as the footer

type Stage = Exclude<LoginStep, { step: 'done' }>;

function ErrorToast({ message, onClose }: { message: string; onClose: () => void }) {
  if (!message) return null;

  return (
    <div role="alert" aria-live="assertive" className="auth-toast">
      <span aria-hidden="true" className="auth-toast-icon">!</span>
      <span className="auth-toast-msg">{message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss alert" className="auth-toast-close">
        ×
      </button>
    </div>
  );
}

export function Login() {
  const t = useT();
  const { login, verifyMfa, verifyPin, setupPin } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [f, setF] = useState({ identifier: '', password: '' });
  const [stage, setStage] = useState<Stage | null>(null); // null = password step
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const alertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAlert = () => {
    if (alertTimer.current) {
      clearTimeout(alertTimer.current);
      alertTimer.current = null;
    }
    setErr('');
  };

  const showAlert = (message: string) => {
    if (alertTimer.current) clearTimeout(alertTimer.current);

    setErr(message);
    alertTimer.current = setTimeout(() => {
      setErr('');
      alertTimer.current = null;
    }, 4000);
  };

  useEffect(() => {
    return () => {
      if (alertTimer.current) clearTimeout(alertTimer.current);
    };
  }, []);

  const errorAlert = err ? (
    <ErrorToast message={err} onClose={clearAlert} />
  ) : null;

  const goHome = (u: User) =>
    nav((/^\/(?![\/\\])[A-Za-z0-9/_?=&%.-]*$/.test(params.get('next')||'') ? params.get('next') : null) || (u.role === 'admin' ? '/admin' : u.role === 'vendor' ? '/vendor' : '/'), { replace: true });

  const advance = (r: LoginStep) => {
    if (r.step === 'done') return goHome(r.user);
    setStage(r);
    setPin('');
    setPin2('');
  };

  const run = async (fn: () => Promise<void>) => {
    clearAlert();
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      showAlert(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setStage(null);
    setPin('');
    setPin2('');
    clearAlert();
  };

  /* ---- administrator verification ---- */
  if (stage?.step === 'mfa') {
    return (
      <AuthShell variant="login">
        {errorAlert}
        <h1 className="auth-title">Administrator verification</h1>
        <p className="auth-sub">Enter the six-digit code from your authenticator, or one of your recovery codes.</p>
        <form onSubmit={e => { e.preventDefault(); run(async () => advance(await verifyMfa(stage.mfaToken, pin))); }}>
          <Field label="Authenticator or recovery code">
            <input aria-label="Authenticator or recovery code" autoFocus autoComplete="one-time-code" required value={pin} maxLength={64} onChange={e => setPin(e.target.value)} />
          </Field>
          <div className="auth-actions">
            <button className="btn btn-primary" disabled={busy}>Verify</button>
            <button type="button" className="btn btn-outline" onClick={startOver}>Start again</button>
          </div>
        </form>
      </AuthShell>
    );
  }

  /* ---- step 2: enter PIN ---- */
  if (stage?.step === 'pin') {
    const first = stage.fullName.split(' ')[0];
    const helpMsg = encodeURIComponent('Hi, I forgot my Sokoni Hub PIN and need it reset.');

    return (
      <AuthShell variant="login">
        {errorAlert}
        <h1 className="auth-title">Enter your PIN</h1>
        <p className="auth-sub">
          {first ? `Hi ${first}, e` : 'E'}nter your 4-digit PIN to finish signing in.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); run(async () => advance(await verifyPin(stage.pinToken, pin))); }}>
          <PinField label="4-digit PIN" value={pin} onChange={setPin} autoFocus />
          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy || pin.length !== 4}>
            {busy ? t('auth.loggingIn') : t('auth.login.cta')}
          </button>
        </form>
        <div className="auth-help pin-help">
          Forgot your PIN?{' '}
          <a href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${helpMsg}`} target="_blank" rel="noopener noreferrer">
            Message support on WhatsApp
          </a>{' '}
          and we will reset it once we have confirmed it is you.
        </div>
        <p className="auth-back">
          <button type="button" className="btn btn-ghost btn-sm" onClick={startOver}>← Use a different account</button>
        </p>
      </AuthShell>
    );
  }

  /* ---- create a PIN (existing accounts, or after an admin reset) ---- */
  if (stage?.step === 'setup') {
    const submitSetup = (e: React.FormEvent) => {
      e.preventDefault();
      if (pin !== pin2) return showAlert('The two PINs do not match');

      run(async () => goHome(await setupPin({
        setupToken: stage.setupToken,
        pin,
        email: stage.needsEmail ? email : undefined,
      })));
    };

    return (
      <AuthShell variant="login">
        {errorAlert}
        <h1 className="auth-title">Create your PIN</h1>
        <p className="auth-sub">
          For extra security, Sokoni Hub now asks for a 4-digit PIN after your password each time you sign in.
        </p>
        <form onSubmit={submitSetup}>
          {stage.needsEmail && (
            <Field label="Email address *" hint="Every account now needs an email address.">
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </Field>
          )}
          <div className="form-row">
            <PinField label="New PIN" value={pin} onChange={setPin} autoFocus />
            <PinField label="Confirm PIN" value={pin2} onChange={setPin2} />
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            disabled={busy || pin.length !== 4 || pin2.length !== 4}
          >
            {busy ? t('auth.creating') : 'Save PIN and continue'}
          </button>
        </form>
        <p className="auth-back">
          <button type="button" className="btn btn-ghost btn-sm" onClick={startOver}>← Cancel</button>
        </p>
      </AuthShell>
    );
  }

  /* ---- step 1: identifier + password ---- */
  return (
    <AuthShell variant="login">
      {errorAlert}
      <h1 className="auth-title">{t('auth.login.title')}</h1>
      <p className="auth-sub">{t('auth.login.sub')}</p>
      <form onSubmit={(e) => { e.preventDefault(); run(async () => advance(await login(f.identifier, f.password))); }}>
        <Field label={t('auth.identifier')}>
          <input
            required
            value={f.identifier}
            onChange={(e) => setF({ ...f, identifier: e.target.value })}
            placeholder="+234 801 234 5678"
            autoComplete="username"
          />
        </Field>
        <Field label={t('auth.password')}>
          <input
            required
            type="password"
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
            autoComplete="current-password"
          />
        </Field>
        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
          {busy ? t('auth.loggingIn') : t('auth.login.cta')}
        </button>
      </form>
      <p className="auth-links">
        <span>{t('auth.noAccount')} <Link to="/register">{t('auth.createOne')}</Link></span>
        <Link to="/verify-email">Verify email</Link>
        <Link to="/sell">{t('auth.sellOn')}</Link>
      </p>
    </AuthShell>
  );
}

export function Register() {
  const t = useT();
  const { register } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initialRole = params.get('role') === 'vendor' ? 'vendor' : 'buyer';
  const [f, setF] = useState({
    full_name: '',
    phone: '',
    email: '',
    password: '',
    confirm: '',
    pin: '',
    pinConfirm: '',
    role: initialRole as 'buyer' | 'vendor',
    agree: false,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const alertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAlert = () => {
    if (alertTimer.current) {
      clearTimeout(alertTimer.current);
      alertTimer.current = null;
    }
    setErr('');
  };

  const showAlert = (message: string) => {
    if (alertTimer.current) clearTimeout(alertTimer.current);

    setErr(message);
    alertTimer.current = setTimeout(() => {
      setErr('');
      alertTimer.current = null;
    }, 4000);
  };

  useEffect(() => {
    return () => {
      if (alertTimer.current) clearTimeout(alertTimer.current);
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlert();

    if (f.password !== f.confirm) return showAlert('Passwords do not match');
    if (f.pin !== f.pinConfirm) return showAlert('The two PINs do not match');
    if (!f.agree) return showAlert('You must accept the marketplace rules');

    setBusy(true);
    try {
      const result = await register({
        full_name: f.full_name,
        phone: f.phone,
        email: f.email,
        password: f.password,
        pin: f.pin,
        role: f.role,
      });
      nav(`/verify-email?email=${encodeURIComponent(result.email)}`, { replace: true });
    } catch (e) {
      showAlert(e instanceof ApiError ? e.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  const errorAlert = err ? (
    <ErrorToast message={err} onClose={clearAlert} />
  ) : null;

  return (
    <AuthShell variant="register">
      {errorAlert}
      <h1 className="auth-title">{t('auth.register.title')}</h1>
      <p className="auth-sub">
        Already registered? <Link to="/login">{t('auth.login.cta')}</Link>
      </p>

      <form onSubmit={submit}>
        <fieldset className="auth-section">
          <legend>{t('auth.iWantTo')}</legend>
          <div className="auth-roles" role="radiogroup">
            {([
              ['buyer', '🛒', t('auth.roleBuyer'), 'Browse and buy from traders'],
              ['vendor', '🏪', t('auth.roleVendor'), 'List products and services'],
            ] as const).map(([v, icon, label, hint]) => (
              <label key={v} className={`auth-role${f.role === v ? ' is-active' : ''}`}>
                <input type="radio" name="role" checked={f.role === v} onChange={() => setF({ ...f, role: v })} />
                <span className="auth-role-icon" aria-hidden="true">{icon}</span>
                <span className="auth-role-text">
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="auth-section">
          <legend>Your details</legend>
          <Field label={t('auth.fullNameReq')}>
            <input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoComplete="name" />
          </Field>

          <div className="form-row">
            <Field label={t('auth.phoneReq')} hint={t('auth.phoneHint')}>
              <input required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+234 801 234 5678" autoComplete="tel" />
            </Field>
            <Field label="Email address *">
              <input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
            </Field>
          </div>
        </fieldset>

        <fieldset className="auth-section">
          <legend>Sign-in security</legend>
          <div className="form-row">
            <Field label={t('auth.passwordReq')} hint={t('auth.passwordHint')}>
              <input required type="password" minLength={12} maxLength={72} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
            </Field>
            <Field label={t('auth.confirmPassword')}>
              <input required type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} autoComplete="new-password" />
            </Field>
          </div>

          <div className="form-row">
            <PinField
              label="Create a 4-digit PIN *"
              hint="You will enter this after your password every time you sign in."
              value={f.pin}
              onChange={(v) => setF({ ...f, pin: v })}
            />
            <PinField label="Confirm PIN *" value={f.pinConfirm} onChange={(v) => setF({ ...f, pinConfirm: v })} />
          </div>
        </fieldset>

        <label className="checkbox mb-2">
          <input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} />
          <span>{t('auth.rulesConfirm')}</span>
        </label>

        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
          {busy ? t('auth.creating') : t('auth.register.cta')}
        </button>

        <p className="auth-legal">
          Read our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link> for account and data information. These drafts are still awaiting finalisation.
        </p>
      </form>
    </AuthShell>
  );
}
