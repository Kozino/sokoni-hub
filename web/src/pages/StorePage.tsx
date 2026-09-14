import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Listing, Vendor } from '../types';
import { waLink, date } from '../lib/format';
import ListingCard from '../components/ListingCard';
import { Badge, Empty, Spinner, Tabs } from '../components/ui';

export default function StorePage() {
  const { slug } = useParams();
  const [data, setData] = useState<{ vendor: Vendor; listings: Listing[]; reviews: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'product' | 'service'>('all');

  useEffect(() => {
    setLoading(true);
    api.get<any>(`/vendors/${slug}`).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="container"><Spinner /></div>;
  if (!data) return <div className="container"><Empty icon="🏪" title="Store not found" text="This store may not be verified yet." action={<Link to="/vendors" className="btn btn-primary">All stores</Link>} /></div>;

  const { vendor, listings, reviews } = data;
  const shown = tab === 'all' ? listings : listings.filter((l) => l.kind === tab);

  return (
    <div className="container">
      <div className="card card-pad">
        <div className="row-between">
          <div className="row">
            <div className="avatar" style={{ width: 64, height: 64, fontSize: '1.6rem' }}>
              {vendor.logo_url ? <img src={vendor.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} /> : vendor.business_name[0]}
            </div>
            <div>
              <h1 style={{ marginBottom: 4 }}>{vendor.business_name}</h1>
              <div className="row wrap" style={{ gap: 8, fontSize: '.85rem', color: 'var(--muted)' }}>
                <Badge tone="green">✓ Admin verified</Badge>
                <span>📍 {vendor.city}, {vendor.country}</span>
                {Number(vendor.rating_avg) > 0 && <span>★ {Number(vendor.rating_avg).toFixed(1)} ({vendor.rating_count})</span>}
                <span>Since {date(vendor.created_at)}</span>
              </div>
            </div>
          </div>
          <div className="row">
            <a className="btn btn-wa" href={waLink(vendor.whatsapp, `Hello ${vendor.business_name}, I found your store on Sokoni Hub.`)} target="_blank" rel="noreferrer">Chat on WhatsApp</a>
            <Link to={`/support?vendor=${vendor.id}`} className="btn btn-outline">Report store</Link>
          </div>
        </div>
        {vendor.description && <p className="mt-2" style={{ marginBottom: 0 }}>{vendor.description}</p>}
      </div>

      <div className="mt-3">
        <Tabs
          value={tab} onChange={setTab}
          tabs={[
            { id: 'all', label: 'All', count: listings.length },
            { id: 'product', label: 'Products', count: listings.filter((l) => l.kind === 'product').length },
            { id: 'service', label: 'Services', count: listings.filter((l) => l.kind === 'service').length },
          ]}
        />
        {shown.length === 0
          ? <Empty icon="📦" title="Nothing listed here yet" />
          : <div className="grid grid-4">{shown.map((l) => <ListingCard key={l.id} l={{ ...l, business_name: vendor.business_name, vendor_city: vendor.city }} />)}</div>}
      </div>

      {reviews.length > 0 && (
        <div className="mt-4">
          <h2>Buyer reviews</h2>
          <div className="grid grid-2">
            {reviews.map((r, i) => (
              <div key={i} className="card card-pad">
                <div className="row-between mb-1">
                  <strong style={{ color: 'var(--ink)' }}>{r.full_name}</strong>
                  <span style={{ color: 'var(--gold)' }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                </div>
                <p style={{ margin: 0, fontSize: '.9rem' }}>{r.comment || '—'}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
