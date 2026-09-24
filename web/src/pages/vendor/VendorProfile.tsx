import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../state/AuthContext';
import { Alert, Field, Spinner, StatusBadge } from '../../components/ui';
import ImageUploader from '../../components/ImageUploader';
import { useToast } from '../../state/ToastContext';
import { date } from '../../lib/format';
import DeliverySettings from './DeliverySettings';

export default function VendorProfile() {
  const { vendor, refresh } = useAuth();
  const { push } = useToast();
  const [f, setF] = useState<any>(null);
  const [logo, setLogo] = useState<string[]>([]);
  const [doc, setDoc] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!vendor) return;
    setF({
      business_name: vendor.business_name, description: vendor.description || '',
      whatsapp: vendor.whatsapp, country: vendor.country, city: vendor.city, address: vendor.address || '',
    });
    setLogo(vendor.logo_url ? [vendor.logo_url] : []);
    setDoc(vendor.id_document_url ? [vendor.id_document_url] : []);
  }, [vendor]);

  if (!vendor || !f) return <Spinner />;
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await api.patch('/vendors/me', { ...f, logo_url: logo[0] || null, id_document_url: doc[0] || null });
      await refresh();
      push('Store profile updated', 'success');
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="dash-title"><h1>Store profile</h1><p>What buyers see on your storefront.</p></div>

      <div className="card card-pad mb-3">
        <div className="row-between">
          <div>
            <div style={{ fontSize: '.76rem', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', fontWeight: 800 }}>Verification status</div>
            <div className="row mt-1"><StatusBadge status={vendor.status} />
              {vendor.verified_at && <span style={{ fontSize: '.82rem', color: 'var(--muted)' }}>Verified {date(vendor.verified_at)}</span>}
            </div>
          </div>
          {vendor.status === 'verified' && <Link to={`/store/${vendor.slug}`} className="btn btn-outline btn-sm">View public store →</Link>}
        </div>
        {vendor.rejection_reason && <Alert kind="error"><strong>Admin note:</strong> {vendor.rejection_reason}</Alert>}
      </div>

      <form className="card card-pad" onSubmit={submit} style={{ maxWidth: 780 }}>
        <Alert kind="error">{err}</Alert>
        <Field label="Business name *"><input required value={f.business_name} onChange={set('business_name')} /></Field>
        <Field label="Description"><textarea value={f.description} onChange={set('description')} style={{ minHeight: 110 }} /></Field>
        <div className="form-row">
          <Field label="Country *"><input required value={f.country} onChange={set('country')} /></Field>
          <Field label="City *"><input required value={f.city} onChange={set('city')} /></Field>
        </div>
        <Field label="WhatsApp number *"><input required value={f.whatsapp} onChange={set('whatsapp')} /></Field>
        <Field label="Shop address"><input value={f.address} onChange={set('address')} /></Field>
        <Field label="Store logo"><ImageUploader value={logo} onChange={setLogo} max={1} label="Upload logo" /></Field>
        <Field label="ID document" hint="Visible to admins only"><ImageUploader value={doc} onChange={setDoc} max={1} label="Upload ID document" /></Field>
        {vendor.status === 'rejected' && <Alert kind="warn">Saving changes resubmits your store for verification.</Alert>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </form>

      <div className="mt-3" style={{ maxWidth: 780 }}>
        <DeliverySettings />
      </div>
    </>
  );
}
