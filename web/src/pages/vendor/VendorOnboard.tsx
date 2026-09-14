import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../state/AuthContext';
import { Alert, Field } from '../../components/ui';
import ImageUploader from '../../components/ImageUploader';

export default function VendorOnboard() {
  const { vendor, refresh } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [f, setF] = useState({
    business_name: '', description: '', whatsapp: '', country: '', city: '', address: '',
  });
  const [logo, setLogo] = useState<string[]>([]);
  const [doc, setDoc] = useState<string[]>([]);
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });

  if (vendor) {
    return (
      <div className="container container-narrow">
        <Alert kind="info">You already have a store profile ({vendor.status}).</Alert>
        <button className="btn btn-primary" onClick={() => nav('/vendor')}>Go to dashboard</button>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agree) return setErr('You must accept the prohibited-goods policy');
    setErr(''); setBusy(true);
    try {
      await api.post('/vendors/onboard', {
        ...f,
        description: f.description || undefined,
        address: f.address || undefined,
        logo_url: logo[0] || undefined,
        id_document_url: doc[0] || undefined,
      });
      await refresh();
      nav('/vendor', { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not submit');
      setStep(1);
    } finally { setBusy(false); }
  };

  return (
    <div className="container container-narrow">
      <h1>Register your business</h1>
      <p style={{ color: 'var(--muted)' }}>An admin reviews every store. You can post listings once you're verified.</p>

      <div className="stepper">
        <div className={`step ${step > 1 ? 'done' : step === 1 ? 'active' : ''}`}>1. Business</div>
        <div className={`step ${step > 2 ? 'done' : step === 2 ? 'active' : ''}`}>2. Verification</div>
        <div className={`step ${step === 3 ? 'active' : ''}`}>3. Confirm</div>
      </div>

      <form className="card card-pad" onSubmit={submit}>
        <Alert kind="error">{err}</Alert>

        {step === 1 && (
          <>
            <Field label="Business / store name *" hint="This is how buyers find you">
              <input required value={f.business_name} onChange={set('business_name')} placeholder="Mama Ngozi Foodstuff" />
            </Field>
            <Field label="What do you sell or offer? *">
              <textarea required value={f.description} onChange={set('description')} placeholder="We sell bulk rice, beans, palm oil and spices, delivered across the city." />
            </Field>
            <div className="form-row">
              <Field label="Country *"><input required value={f.country} onChange={set('country')} placeholder="Nigeria" /></Field>
              <Field label="City *"><input required value={f.city} onChange={set('city')} placeholder="Lagos" /></Field>
            </div>
            <Field label="WhatsApp number *" hint="Buyers will message this number directly">
              <input required value={f.whatsapp} onChange={set('whatsapp')} placeholder="+234 801 234 5678" />
            </Field>
            <Field label="Shop address (optional)"><input value={f.address} onChange={set('address')} /></Field>
            <button type="button" className="btn btn-primary btn-block"
              disabled={!f.business_name || !f.description || !f.country || !f.city || !f.whatsapp}
              onClick={() => setStep(2)}>Continue</button>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Store logo or shop photo (optional)">
              <ImageUploader value={logo} onChange={setLogo} max={1} label="Upload logo" />
            </Field>
            <Field label="Identification document *" hint="National ID, driver's licence, voter's card or business registration. Only admins can see this.">
              <ImageUploader value={doc} onChange={setDoc} max={1} label="Upload ID document" />
            </Field>
            <div className="row">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
              <button type="button" className="btn btn-primary grow" onClick={() => setStep(3)}>Continue</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h3>Confirm your details</h3>
            <dl className="kv mb-2">
              <dt>Business</dt><dd>{f.business_name}</dd>
              <dt>Location</dt><dd>{f.city}, {f.country}</dd>
              <dt>WhatsApp</dt><dd>{f.whatsapp}</dd>
              <dt>Logo</dt><dd>{logo[0] ? 'Uploaded' : 'Not provided'}</dd>
              <dt>ID document</dt><dd>{doc[0] ? 'Uploaded' : 'Not provided — may delay verification'}</dd>
            </dl>
            <div className="prohibited mb-2">
              <strong>Reminder:</strong> cosmetics and medicine/drugs are strictly prohibited. Listing them
              results in removal and suspension.
            </div>
            <label className="checkbox mb-2">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>I confirm my details are accurate and I will not list prohibited items.</span>
            </label>
            <div className="row">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>← Back</button>
              <button className="btn btn-primary grow" disabled={busy}>{busy ? 'Submitting…' : 'Submit for verification'}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
