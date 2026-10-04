import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Spinner, Alert } from '../../components/ui';

export default function AdminPlanLimits() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

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
    api.get<{limits: any, prices: any}>('/meta/plan-limits')
       .then(r => { 
         if (r.limits) setLimits(r.limits); 
         if (r.prices) setPrices(r.prices);
       })
       .catch(() => {})
       .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      await api.put('/admin/plan-limits', { limits, prices });
      setMsg('Plan limits and prices saved successfully!');
    } catch(e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateVal = (type: 'product'|'service', plan: 'free'|'standard'|'pro', key: 'listings'|'photos'|'options', val: number) => {
    const newLimits = { ...limits };
    newLimits[type][plan][key] = val;
    setLimits(newLimits);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="dash-header">
        <h1>Plan Limits & Prices</h1>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
      </div>

      {err && <Alert kind="error">{err}</Alert>}
      {msg && <Alert kind="success">{msg}</Alert>}

      <p style={{marginBottom: 20}}>Configure the maximum number of allowed features and the monthly prices for each plan tier. Note: Setting limits very high (e.g., 999999) simulates "unlimited". Free plan is always 0 QAR.</p>

      <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 20, marginBottom: 20 }}>
        <h2 style={{ textTransform: 'capitalize', marginTop: 0 }}>Plan Monthly Prices (QAR)</h2>
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ flex: 1 }}>
            <label style={{display: 'block', marginBottom: 4, fontWeight: 'bold'}}>Standard Plan Price</label>
            <input type="number" min="0" value={prices.standard} onChange={e => setPrices({...prices, standard: Number(e.target.value)})} style={{width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc'}} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{display: 'block', marginBottom: 4, fontWeight: 'bold'}}>Pro Plan Price</label>
            <input type="number" min="0" value={prices.pro} onChange={e => setPrices({...prices, pro: Number(e.target.value)})} style={{width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc'}} />
          </div>
        </div>
      </div>

      {['product', 'service'].map((type) => (
        <div key={type} style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 20, marginBottom: 20 }}>
          <h2 style={{ textTransform: 'capitalize', marginTop: 0 }}>{type} Limits</h2>
          
          <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Plan Tier</th>
                <th>Active Listings</th>
                <th>Photos per Listing</th>
                <th>Size/Variations Options</th>
              </tr>
            </thead>
            <tbody>
              {['free', 'standard', 'pro'].map((plan) => (
                <tr key={plan}>
                  <td style={{ textTransform: 'capitalize', fontWeight: 'bold' }}>{plan}</td>
                  <td><input type="number" min="1" value={limits[type as any][plan as any].listings} onChange={e => updateVal(type as any, plan as any, 'listings', Number(e.target.value))} style={{width: 80, padding: 6, borderRadius: 4, border: '1px solid #ccc'}} /></td>
                  <td><input type="number" min="1" value={limits[type as any][plan as any].photos} onChange={e => updateVal(type as any, plan as any, 'photos', Number(e.target.value))} style={{width: 80, padding: 6, borderRadius: 4, border: '1px solid #ccc'}} /></td>
                  <td><input type="number" min="1" value={limits[type as any][plan as any].options} onChange={e => updateVal(type as any, plan as any, 'options', Number(e.target.value))} style={{width: 80, padding: 6, borderRadius: 4, border: '1px solid #ccc'}} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
