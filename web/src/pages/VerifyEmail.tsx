import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { Alert, Field } from '../components/ui';

/** Public landing page for the one-time link sent after registration. */
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState<'checking' | 'verified' | 'needs-link' | 'error'>(token ? 'checking' : 'needs-link');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(params.get('email') || '');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    api.post<{ ok: true }>('/auth/verify-email', { token })
      .then(() => { if (alive) setState('verified'); })
      .catch((error) => {
        if (!alive) return;
        setState('error');
        setMessage(error instanceof ApiError ? error.message : 'We could not verify this email link.');
      });
    return () => { alive = false; };
  }, [token]);

  const resend = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setState('needs-link');
    setMessage('');
    try {
      const response = await api.post<{ message: string }>('/auth/verify-email/resend', { email });
      setMessage(response.message);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Could not send a new verification link.');
    } finally { setSending(false); }
  };

  return (
    <div className="container container-narrow">
      <div className="card card-pad" style={{ maxWidth: 560, margin: '36px auto' }}>
        {state === 'checking' && <><h1>Verifying your email…</h1><p className="muted">Please wait while we confirm your Sokoni Hub account.</p></>}
        {state === 'verified' && <>
          <div style={{ fontSize: '2.4rem' }} aria-hidden="true">✓</div>
          <h1>Email verified</h1>
          <p>Your email address is confirmed. You can now sign in to Sokoni Hub.</p>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </>}
        {(state === 'needs-link' || state === 'error') && <>
          <h1>{state === 'error' ? 'This link cannot be used' : 'Verify your email'}</h1>
          <p className="muted">{state === 'error' ? message : 'We sent a verification link when you created your account. Check your inbox and spam folder.'}</p>
          <form onSubmit={resend}>
            <Field label="Email address">
              <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <button className="btn btn-primary" disabled={sending}>{sending ? 'Sending…' : 'Send a new verification link'}</button>
          </form>
          {message && state !== 'error' && <Alert kind="success">{message}</Alert>}
          <p className="mt-3" style={{ marginBottom: 0 }}>Already verified? <Link to="/login">Sign in</Link></p>
        </>}
      </div>
    </div>
  );
}
