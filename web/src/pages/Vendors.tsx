import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../lib/api';
import type { Vendor } from '../types';
import { Empty, Spinner, Badge, Alert } from '../components/ui';
import { useLocation, formatDistance } from '../state/LocationContext';
import { money } from '../lib/format';

export default function Vendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [q, setQ] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [near, setNear] = useState(false);
  const { location, city, status, error, detect, setCity, clear, hasLocation } = useLocation();

  const load = useCallback(
    (term = '') => {
      setLoading(true);
      api
        .get<{ vendors: Vendor[]; near?: boolean }>(
          `/vendors${qs({
            q: term,
            city: location ? '' : city, // precise coords beat a city name
            lat: location?.lat,
            lng: location?.lng,
            limit: 48,
          })}`
        )
        .then((r) => { setVendors(r.vendors); setNear(!!r.near); })
        .catch(() => setVendors([]))
        .finally(() => setLoading(false));
    },
    [location, city]
  );

  useEffect(() => { load(q); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [load]);

  useEffect(() => {
    api.get<{ cities: string[] }>('/listings/cities')
      .then((r) => setCities(r.cities || []))
      .catch(() => setCities([]));
  }, []);

  // Where the "near you" group ends — used to label the rest of the list.
  const nearbyCount = near ? vendors.filter((v) => v.distance_km !== null && v.distance_km !== undefined).length : 0;

  return (
    <div className="container">
      <h1>Verified stores</h1>
      <p style={{ color: 'var(--muted)' }}>Every store below was reviewed and approved by our admin team.</p>

      {/* Location bar — optional, never blocking. Buyers always see every store;
          sharing a location only changes the order. */}
      <div className="card card-pad mt-2" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: '1.1rem' }} aria-hidden>📍</span>
        <div className="grow" style={{ minWidth: 200 }}>
          {location ? (
            <>
              <strong style={{ fontSize: '.9rem' }}>Showing stores nearest to you</strong>
              <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Using your current location</div>
            </>
          ) : city ? (
            <>
              <strong style={{ fontSize: '.9rem' }}>Showing stores in {city}</strong>
              <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Other cities are listed below</div>
            </>
          ) : (
            <>
              <strong style={{ fontSize: '.9rem' }}>Find stores near you</strong>
              <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                Share your location or pick a city — you'll still see every store.
              </div>
            </>
          )}
        </div>

        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          aria-label="Filter by city"
          style={{ minWidth: 150 }}
        >
          <option value="">All cities</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        {!location ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={detect} disabled={status === 'locating'}>
            {status === 'locating' ? 'Locating…' : 'Use my location'}
          </button>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>
        )}
      </div>

      {error && <Alert kind="warn">{error}</Alert>}

      <form className="filters mt-2" onSubmit={(e) => { e.preventDefault(); load(q); }}>
        <input placeholder="Search store name…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
        <button className="btn btn-primary">Search</button>
      </form>

      {loading ? <Spinner /> : vendors.length === 0 ? (
        <Empty icon="🏪" title="No stores yet" text="Verified stores will appear here as vendors are approved." action={<Link to="/sell" className="btn btn-primary">Be the first to register</Link>} />
      ) : (
        <>
          {near && nearbyCount > 0 && (
            <h2 style={{ fontSize: '1rem', marginTop: 20, marginBottom: 8 }}>Nearest to you</h2>
          )}
          <div className="grid grid-3">
            {vendors.map((v, i) => (
              <VendorCard
                key={v.id}
                v={v}
                // Insert a divider once we cross from located to unlocated stores.
                showRestHeading={near && nearbyCount > 0 && i === nearbyCount}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function VendorCard({ v, showRestHeading }: { v: Vendor; showRestHeading?: boolean }) {
  const dist = formatDistance(v.distance_km);
  const fee = Number(v.delivery_fee ?? 0);
  return (
    <>
      {showRestHeading && (
        <h2 style={{ gridColumn: '1 / -1', fontSize: '1rem', marginTop: 16, marginBottom: 0 }}>More stores</h2>
      )}
      <Link to={`/store/${v.slug}`} className="card card-pad card-hover" style={{ color: 'inherit' }}>
        <div className="row mb-2">
          <div className="avatar">
            {v.logo_url ? <img src={v.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} /> : v.business_name[0]}
          </div>
          <div className="grow">
            <strong style={{ color: 'var(--ink)' }}>{v.business_name}</strong>
            <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
              {v.city}, {v.country}{dist && <> · <strong style={{ color: 'var(--terra-dark)' }}>{dist} away</strong></>}
            </div>
          </div>
        </div>
        <p style={{ fontSize: '.86rem', color: 'var(--muted)', minHeight: 40 }}>
          {v.description ? v.description.slice(0, 110) + (v.description.length > 110 ? '…' : '') : 'No description provided.'}
        </p>
        <div className="row mb-2" style={{ gap: 6, flexWrap: 'wrap' }}>
          {v.offers_delivery && (
            <Badge tone="blue">🛵 {fee > 0 ? `Delivery ${money(fee, 'QAR')}` : 'Free delivery'}</Badge>
          )}
          {v.offers_pickup && <Badge tone="grey">🏬 Collection</Badge>}
        </div>
        <div className="row-between">
          <Badge tone="green">✓ Verified</Badge>
          <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
            {v.listings as number} listings {Number(v.rating_avg) > 0 && `· ★ ${Number(v.rating_avg).toFixed(1)}`}
          </span>
        </div>
      </Link>
    </>
  );
}
