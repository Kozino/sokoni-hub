/**
 * Paid placement on the landing page — VIP and Sponsored stores.
 *
 * Two rules this component exists to enforce, both of which are easy to lose
 * if the markup is inlined into Home.tsx:
 *
 * 1. EVERY PROMOTED STORE CARRIES A VISIBLE LABEL. Paid position presented as
 *    organic ranking is a consumer-protection problem, not a styling choice.
 *    The badge is rendered from the same `tier` field that got the store into
 *    the list, so there is no code path that shows one without the other.
 *
 * 2. THE SECTION DISAPPEARS WHEN NOTHING IS SOLD. A landing page with an empty
 *    "VIP stores" heading advertises that nobody is buying. Sold-out-ness is
 *    not something the buyer should be able to read off the page.
 *
 * Impressions are reported after paint, in one batched call, rather than being
 * counted server-side while the list is served. Only the browser knows the
 * carousel was actually rendered, and a public GET that writes on every view
 * cannot be cached.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export interface PromotedStore {
  id: string;            // promotion id, not vendor id — this is what gets tracked
  vendor_id: string;
  tier: 'vip' | 'featured';
  business_name: string;
  slug: string;
  logo_url: string | null;
  city: string;
  country: string;
  rating_avg: string | number;
  rating_count: number;
  listing_count: number;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/* Small inline icons: identical on every phone, and they follow text colour. */
const PinIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
  </svg>
);
const StarIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
    <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />
  </svg>
);

function StoreCard({ p, onClick }: { p: PromotedStore; onClick: (id: string) => void }) {
  const rating = Number(p.rating_avg) || 0;
  return (
    <Link
      to={`/store/${p.slug}`}
      className={`pr-card pr-${p.tier}`}
      onClick={() => onClick(p.id)}
    >
      {/* The badge gets its own row rather than being absolutely positioned
          over the card. Overlaying it means every padding change risks it
          landing on the store name — which it did. */}
      <span className={`pr-badge pr-badge-${p.tier}`}>
        {p.tier === 'vip' ? 'VIP' : 'Sponsored'}
      </span>

      <div className="pr-main">
        <div className="pr-logo">
          {p.logo_url
            ? <img src={p.logo_url} alt="" loading="lazy" width={72} height={72} />
            : <span aria-hidden="true">{initials(p.business_name)}</span>}
        </div>

        <div className="pr-body">
          <strong className="pr-name">{p.business_name}</strong>
          <span className="pr-meta pr-loc"><PinIcon />{p.city}</span>
          <span className="pr-meta pr-stats">
            {rating > 0
              ? <span><span className="pr-star">★</span> {rating.toFixed(1)} <span className="pr-dim">({p.rating_count})</span></span>
              : <span className="pr-dim">New store</span>}
            <span className="pr-dim" aria-hidden="true">•</span>
            <span>{p.listing_count} {p.listing_count === 1 ? 'listing' : 'listings'}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function FeaturedStores() {
  const [vip, setVip] = useState<PromotedStore[]>([]);
  const [featured, setFeatured] = useState<PromotedStore[]>([]);
  const tracked = useRef(false);

  useEffect(() => {
    api.get<{ vip: PromotedStore[]; featured: PromotedStore[] }>('/promotions')
      .then((r) => { setVip(r.vip || []); setFeatured(r.featured || []); })
      // A failed placement call must never take the landing page down with it.
      .catch(() => {});
  }, []);

  const all = [...vip, ...featured];

  useEffect(() => {
    if (!all.length || tracked.current) return;
    tracked.current = true;   // once per mount, not once per render
    api.post('/promotions/track', { event: 'impression', ids: all.map((p) => p.id) })
      .catch(() => {});
  }, [all.length]);

  const click = (id: string) => {
    // Fire-and-forget: navigation must not wait on analytics.
    api.post('/promotions/track', { event: 'click', ids: [id] }).catch(() => {});
  };

  if (!all.length) return null;

  return (
    <section className="lp-section lp-promos">
      <div className="container">
        {vip.length > 0 && (
          <>
            <div className="pr-head">
              <h2 className="pr-title"><StarIcon />VIP</h2>
              <p>
                Stores that paid for this placement. Rated and verified like every
                other store on Sokoni Hub.
              </p>
            </div>
            <div className="pr-grid pr-grid-vip">
              {vip.map((p) => <StoreCard key={p.id} p={p} onClick={click} />)}
            </div>
          </>
        )}

        {featured.length > 0 && (
          <>
            <div className={`pr-head ${vip.length ? 'mt-4' : ''}`}>
              <h2 className="pr-title">Sponsored</h2>
            </div>
            <div className="pr-grid">
              {featured.map((p) => <StoreCard key={p.id} p={p} onClick={click} />)}
            </div>
          </>
        )}

        {/* Stated once, plainly, rather than relying on the badges alone. */}
        <p className="pr-disclosure">
          Stores in this section pay for placement. It does not affect their rating,
          their reviews, or where they appear in search results.
        </p>
      </div>
    </section>
  );
}
