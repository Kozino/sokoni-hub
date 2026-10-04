import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../state/AuthContext';
import { Alert, Spinner } from '../../components/ui';
import type { VendorSubscription } from '../../types';
import ImageUploader from '../../components/ImageUploader';

export default function VendorPlans() {
  const { vendor, refresh } = useAuth();
  const [subs, setSubs] = useState<VendorSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [form, setForm] = useState({ visible: false, plan: 'standard' as 'standard'|'pro', months: 1, method: 'bank_transfer', ref: '', receipt: [] as string[] });
  const [busy, setBusy] = useState(false);

  const [limits, setLimits] = useState<any>({
    product: {
      free: { listings: 10, photos: 3, options: 3 },
      standard: { listings: 50, photos: 6, options: 10 },
      pro: { listings: 999999, photos: 6, options: 999999 }
    },
    service: {
      free: { listings: 3, photos: 3, options: 3 },
      standard: { listings: 10, photos: 6, options: 10 },
      pro: { listings: 999999, photos: 6, options: 999999 }
    }
  });

  const [prices, setPrices] = useState<any>({
    standard: 100,
    pro: 250
  });

  useEffect(() => {
    Promise.all([
      api.get<{subscriptions: VendorSubscription[]}>('/vendors/me/subscriptions').catch(() => ({ subscriptions: [] })),
      api.get<{limits: any, prices: any}>('/meta/plan-limits').catch(() => ({ limits: null, prices: null }))
    ]).then(([rSubs, rMeta]) => {
      if (rSubs.subscriptions) setSubs(rSubs.subscriptions);
      if (rMeta.limits) setLimits(rMeta.limits);
      if (rMeta.prices) setPrices(rMeta.prices);
    }).finally(() => setLoading(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.method === 'bank_transfer' && !form.receipt[0]) return setErr('Please upload your transfer receipt');
    setBusy(true); setErr('');
    try {
      const res = await api.post<{subscription: VendorSubscription}>('/vendors/me/subscriptions', {
        plan: form.plan, months: form.months, payment_method: form.method, reference: form.ref, receipt_url: form.receipt[0] || undefined
      });
      setSubs([res.subscription, ...subs]);
      setForm({...form, visible: false, receipt: [], ref: ''});
    } catch(err: any) { setErr(err.message); }
    finally { setBusy(false); }
  };

  const plan = vendor?.plan !== 'free' && (!vendor?.plan_expires_at || new Date(vendor.plan_expires_at) > new Date()) ? (vendor?.plan || 'free') : 'free';

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="dash-header">
        <h1>Plans & Billing</h1>
        {form.visible ? <button className="btn btn-ghost" onClick={() => setForm({...form, visible: false})}>Back</button> : null}
      </div>

      {!form.visible ? (
        <>
          <div style={{ padding: 20, background: '#fff', borderRadius: 8, marginBottom: 20, border: '1px solid #eee' }}>
            <h3 style={{marginTop:0}}>Current Plan: <strong style={{textTransform:'capitalize'}}>{plan}</strong></h3>
            {plan !== 'free' && vendor?.plan_expires_at && <p>Expires: {new Date(vendor.plan_expires_at).toLocaleDateString()}</p>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 30 }}>
            {/* Free */}
            <div style={{ padding: 20, border: '1px solid #ddd', borderRadius: 8, background: plan === 'free' ? '#F8F9FA' : '#fff' }}>
              <h3>Free</h3>
              <p>0 QAR / month</p>
              <ul style={{ paddingLeft: 20, marginBottom: 20 }}>
                <li>{limits.product.free.listings} Products or {limits.service.free.listings} Services</li>
                <li>{limits.product.free.photos} Photos per Listing</li>
                <li>{limits.product.free.options} Size Options per Listing</li>
              </ul>
              {plan === 'free' ? <button className="btn btn-block" disabled>Current Plan</button> : null}
            </div>
            
            {/* Standard */}
            <div style={{ padding: 20, border: '2px solid var(--primary)', borderRadius: 8, background: plan === 'standard' ? '#F0FFF6' : '#fff' }}>
              <h3>Standard</h3>
              <p>{prices.standard} QAR / month</p>
              <ul style={{ paddingLeft: 20, marginBottom: 20 }}>
                <li>{limits.product.standard.listings} Products or {limits.service.standard.listings} Services</li>
                <li>{limits.product.standard.photos} Photos per Listing</li>
                <li>{limits.product.standard.options} Size Options per Listing</li>
              </ul>
              <button className="btn btn-primary btn-block" onClick={() => setForm({...form, visible: true, plan: 'standard'})}>{plan === 'standard' ? 'Renew' : 'Upgrade'}</button>
            </div>

            {/* Pro */}
            <div style={{ padding: 20, border: '1px solid #ddd', borderRadius: 8, background: plan === 'pro' ? '#FFF9F0' : '#fff' }}>
              <h3>Pro</h3>
              <p>{prices.pro} QAR / month</p>
              <ul style={{ paddingLeft: 20, marginBottom: 20 }}>
                <li>Unlimited Listings</li>
                <li>Unlimited Photos per Listing</li>
                <li>Unlimited Options</li>
                <li>1 Featured Slot included</li>
              </ul>
              <button className="btn btn-block" onClick={() => setForm({...form, visible: true, plan: 'pro'})} style={{background: '#333', color: '#fff'}}>{plan === 'pro' ? 'Renew' : 'Upgrade'}</button>
            </div>
          </div>

          {subs.length > 0 && (
            <>
              <h3>Billing History</h3>
              <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', marginTop: 10 }}>
                <thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead>
                <tbody>
                  {subs.map(s => (
                    <tr key={s.id} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{padding: '10px 0'}}>{new Date(s.created_at).toLocaleDateString()}</td>
                      <td style={{textTransform:'capitalize'}}>{s.plan} ({s.months}mo)</td>
                      <td>{s.amount} {s.currency}</td>
                      <td>{s.payment_method.replace('_', ' ')}</td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, background: s.status === 'approved' ? '#d4edda' : s.status === 'rejected' ? '#f8d7da' : '#fff3cd' }}>
                          {s.status}
                        </span>
                        {s.admin_note && <div style={{fontSize: 11, color: 'red', marginTop: 4}}>{s.admin_note}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      ) : (
        <form onSubmit={submit} style={{ maxWidth: 500, background: '#fff', padding: 24, borderRadius: 8, border: '1px solid #eee' }}>
          <h3>Subscribe to <span style={{textTransform:'capitalize'}}>{form.plan}</span></h3>
          <p>Amount: {(form.plan === 'pro' ? prices.pro : prices.standard) * form.months} QAR</p>
          
          {err && <Alert kind="error">{err}</Alert>}

          <div className="field">
            <label>Duration</label>
            <select value={form.months} onChange={e => setForm({...form, months: Number(e.target.value)})}>
              <option value={1}>1 Month</option>
              <option value={3}>3 Months</option>
              <option value={6}>6 Months</option>
              <option value={12}>12 Months</option>
            </select>
          </div>

          <div className="field">
            <label>Payment Method</label>
            <select value={form.method} onChange={e => setForm({...form, method: e.target.value})}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash / In Person</option>
            </select>
          </div>

          {form.method === 'bank_transfer' && (
            <div style={{ padding: 16, background: '#F8F9FA', borderRadius: 8, marginBottom: 20 }}>
              <p style={{marginTop:0, fontWeight:'bold'}}>Bank Details</p>
              <p style={{fontSize: 14, margin: '4px 0'}}>Bank: Commercial Bank of Qatar</p>
              <p style={{fontSize: 14, margin: '4px 0'}}>Account Name: Sokoni Hub</p>
              <p style={{fontSize: 14, margin: '4px 0'}}>IBAN: QA00 CBQA 0000 0000 1234 5678</p>
              <p style={{fontSize: 13, color: '#666', marginTop: 8}}>Please transfer the exact amount and upload your receipt below. Our team will verify it within 24 hours.</p>
            </div>
          )}

          <div className="field">
            <label>Payment Reference (Optional)</label>
            <input type="text" value={form.ref} onChange={e => setForm({...form, ref: e.target.value})} placeholder="e.g. TRF-12345" />
          </div>

          {(form.method === 'bank_transfer' || form.receipt.length > 0) && (
            <div className="field">
              <label>Upload Receipt</label>
              <ImageUploader value={form.receipt} onChange={r => setForm({...form, receipt: r})} max={1} />
            </div>
          )}

          <button className="btn btn-primary btn-block" disabled={busy} style={{marginTop: 20}}>{busy ? 'Submitting...' : 'Submit Payment'}</button>
        </form>
      )}
    </div>
  );
}
