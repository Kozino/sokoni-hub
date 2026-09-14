import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../lib/api';
import type { Vendor } from '../types';
import { Empty, Spinner, Badge } from '../components/ui';

export default function Vendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const load = (term = '') => {
    setLoading(true);
    api.get<{ vendors: Vendor[] }>(`/vendors${qs({ q: term, limit: 48 })}`)
      .then((r) => setVendors(r.vendors)).catch(() => setVendors([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="container">
      <h1>Verified stores</h1>
      <p style={{ color: 'var(--muted)' }}>Every store below was reviewed and approved by our admin team.</p>

      <form className="filters mt-2" onSubmit={(e) => { e.preventDefault(); load(q); }}>
        <input placeholder="Search store name…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
        <button className="btn btn-primary">Search</button>
      </form>

      {loading ? <Spinner /> : vendors.length === 0 ? (
        <Empty icon="🏪" title="No stores yet" text="Verified stores will appear here as vendors are approved." action={<Link to="/sell" className="btn btn-primary">Be the first to register</Link>} />
      ) : (
        <div className="grid grid-3">
          {vendors.map((v) => (
            <Link key={v.id} to={`/store/${v.slug}`} className="card card-pad card-hover" style={{ color: 'inherit' }}>
              <div className="row mb-2">
                <div className="avatar">
                  {v.logo_url ? <img src={v.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} /> : v.business_name[0]}
                </div>
                <div className="grow">
                  <strong style={{ color: 'var(--ink)' }}>{v.business_name}</strong>
                  <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{v.city}, {v.country}</div>
                </div>
              </div>
              <p style={{ fontSize: '.86rem', color: 'var(--muted)', minHeight: 40 }}>
                {v.description ? v.description.slice(0, 110) + (v.description.length > 110 ? '…' : '') : 'No description provided.'}
              </p>
              <div className="row-between">
                <Badge tone="green">✓ Verified</Badge>
                <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                  {v.listings as number} listings {Number(v.rating_avg) > 0 && `· ★ ${Number(v.rating_avg).toFixed(1)}`}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
