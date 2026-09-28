import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Listing, Category } from '../types';
import ListingCard from '../components/ListingCard';
import FeaturedStores from '../components/FeaturedStores';
import { useLocation as useBuyerLocation } from '../state/LocationContext';
import './Home.css';

/* Category wall icons — keyed on the real category slugs from db/schema.sql. */
const CAT_ICONS: Record<string, string> = {
  'grains-cereals': '🌾', 'tubers-flour': '🥔', 'oils-condiments': '🫒',
  'spices-seasoning': '🌶️', 'frozen-protein': '🍗', 'fruits-vegetables': '🥦',
  'snacks-drinks': '🥤', 'hair-styling': '💇', 'nails': '💅', 'makeup': '💄',
  'photography': '📷', 'video-editing': '🎬', 'graphics-design': '🎨',
  'tailoring': '✂️', 'catering': '🍱', 'events': '🎉', 'cleaning': '🧼',
};
const catIcon = (c: Category) => CAT_ICONS[c.slug] || (c.kind === 'service' ? '💼' : '🛍️');

/* Quick "popular searches" chips shown under the hero search box. */
const QUICK = [
  { label: 'Rice & grains', to: '/browse?category=grains-cereals' },
  { label: 'Braids', to: '/browse?category=hair-styling' },
  { label: 'Catering', to: '/browse?category=catering' },
  { label: 'Photography', to: '/browse?category=photography' },
  { label: 'Spices', to: '/browse?category=spices-seasoning' },
];

interface Stats { vendors: number; listings: number; services: number; cities: number; orders_delivered: number }

export default function Home() {
  const nav = useNavigate();
  const { city, setCity } = useBuyerLocation();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>({ vendors: 0, listings: 0, services: 0, cities: 0, orders_delivered: 0 });
  const [cats, setCats] = useState<Category[]>([]);
  const [trending, setTrending] = useState<Listing[]>([]);
  const [latest, setLatest] = useState<Listing[]>([]);
  const [services, setServices] = useState<Listing[]>([]);

  useEffect(() => {
    api.get<{ stats: Stats }>('/meta/stats').then((r) => setStats(r.stats)).catch(() => {});
    api.get<{ categories: Category[] }>('/meta/categories').then((r) => setCats(r.categories)).catch(() => {});
    api.get<{ listings: Listing[] }>('/listings?limit=8&sort=popular').then((r) => setTrending(r.listings)).catch(() => {});
    api.get<{ listings: Listing[] }>('/listings?limit=12&sort=newest').then((r) => setLatest(r.listings)).catch(() => {});
    api.get<{ listings: Listing[] }>('/listings?limit=6&kind=service&sort=popular').then((r) => setServices(r.listings)).catch(() => {});
    api.get<{ cities: string[] }>('/listings/cities').then((r) => setCities(r.cities)).catch(() => {});
  }, []);

  // Built from whatever is actually non-zero, so the row shrinks to the truth
  // rather than padding itself with zeros.
  const heroStats = [
    { label: 'Live listings', value: stats.listings },
    { label: 'Verified stores', value: stats.vendors },
    { label: 'Orders delivered', value: stats.orders_delivered },
    { label: 'Cities', value: stats.cities },
  ].filter((s) => Number(s.value) > 0);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (kind) p.set('kind', kind);
    if (city) p.set('city', city);
    nav(`/browse?${p}`);
  };

  return (
    <div className="lp">
      {/* ============================================================ HERO */}
      <section className="lp-hero">
        <div className="lp-dotgrid" />
        <div className="lp-blob lp-blob-1" />
        <div className="lp-blob lp-blob-2" />
        <div className="container lp-hero-inner">
          <div className="lp-hero-copy">
            {/* "Dozens of verified stores" with three on the books is a claim
                the page cannot support. Before there is a number worth quoting,
                say what is true about the product instead. */}
            <span className="lp-hero-tag">
              <span className="dot" />
              {stats.vendors >= 5
                ? `${stats.vendors} verified stores`
                : 'Every store checked by hand'}
            </span>
            <h1>Shop your market, <span className="accent">all in one place.</span></h1>
            <p className="lede">
              Food stuff by the kg and the services that keep life moving — from sellers near you.
              Search, compare and order with cash on delivery or a single tap on WhatsApp.
            </p>
            <form className="lp-searchbar" onSubmit={search}>
              <input className="grow" placeholder="Search rice, braids, photographer…" value={q} onChange={(e) => setQ(e.target.value)} />
              <select value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="">All cities</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">All</option>
                <option value="product">Products</option>
                <option value="service">Services</option>
              </select>
              <button className="btn btn-primary" type="submit">Search</button>
            </form>
            <div className="lp-hero-chips">
              <span className="lp-hero-chips-label">Popular:</span>
              {QUICK.map((c) => (
                <button key={c.to} type="button" className="lp-chip" onClick={() => nav(c.to)}>{c.label}</button>
              ))}
            </div>
            {/* Only the counters that have something to say.
                A marketplace announcing "0 Live listings / 0 Verified stores"
                above the fold loses the visitor in the first second, and
                /meta/stats is wrapped in a .catch, so a failed call would have
                pinned those zeros there permanently. A counter with nothing
                behind it is simply not shown. */}
            {heroStats.length > 0 && (
              <div className="lp-hero-stats">
                {heroStats.map((s) => (
                  <div key={s.label}><strong>{s.value}</strong><span>{s.label}</span></div>
                ))}
              </div>
            )}
          </div>
          <div className="lp-hero-img-wrap">
            <div className="lp-hero-img">
              {/* This is the LCP element. width/height reserve the box so the
                  copy beside it does not jump when the image lands, and
                  fetchPriority tells the browser to stop treating it like a
                  decorative asset. */}
              <img
                src="/img/hero.jpg"
                alt="Vendor at her food stall"
                width={1584}
                height={672}
                fetchPriority="high"
                decoding="async"
              />
            </div>
            <div className="lp-hero-float">
              <span className="ic">✅</span>
              <div><strong>Admin-verified</strong><span>every store, checked by hand</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ BENEFITS STRIP */}
      <section className="lp-benefits">
        <div className="container lp-benefits-row">
          <div className="lp-benefit"><span className="ic">🛡️</span><div><strong>Verified sellers</strong><span>Checked by a real person</span></div></div>
          <div className="lp-benefit"><span className="ic">💵</span><div><strong>Cash on delivery</strong><span>Pay when it arrives</span></div></div>
          <div className="lp-benefit"><span className="ic">💬</span><div><strong>WhatsApp checkout</strong><span>Order in one tap</span></div></div>
          <div className="lp-benefit"><span className="ic">🚫</span><div><strong>No listing fees</strong><span>Free to start selling</span></div></div>
        </div>
      </section>

      {/* ============================================================ HOW IT WORKS */}
      <section className="lp-section lp-how">
        <div className="container">
          <div className="lp-section-head" style={{ margin: '0 auto var(--s-7)', textAlign: 'center' }}>
            <span className="lp-eyebrow">Simple by design</span>
            <h2>How ordering works</h2>
          </div>
          <div className="lp-how-grid">
            <div className="lp-how-step">
              <span className="lp-how-num">1</span>
              <span className="ic">🔍</span>
              <strong>Search & compare</strong>
              <p>Filter by city, category or price — no account needed to browse.</p>
            </div>
            <div className="lp-how-step">
              <span className="lp-how-num">2</span>
              <span className="ic">🛒</span>
              <strong>Order your way</strong>
              <p>Checkout as a guest with cash on delivery, or message the seller directly on WhatsApp.</p>
            </div>
            <div className="lp-how-step">
              <span className="lp-how-num">3</span>
              <span className="ic">📦</span>
              <strong>Track & receive</strong>
              <p>Follow your order code from confirmed to delivered — pay only when it arrives.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================== PAID PLACEMENT */}
      {/* Above the category wall and the organic rails: the vendor is paying
          for visibility, and below three scrolls of other content is not it.
          Renders nothing at all when no placement is sold. */}
      <FeaturedStores />

      {/* ============================================================ SHOP BY CATEGORY */}
      <section className="lp-section lp-cat-section">
        <div className="container">
          <div className="lp-section-head">
            <span className="lp-eyebrow">Browse the market</span>
            <h2>Shop by category</h2>
          </div>
          <div className="lp-cat-wall">
            {cats.map((c) => (
              <Link key={c.id} to={`/browse?category=${c.slug}`} className="lp-cat-chip">
                <span className="lp-cat-ico">{catIcon(c)}</span>
                <span className="lp-cat-label">{c.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ TRENDING DEALS */}
      {trending.length > 0 && (
        <section className="lp-section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="row-between mb-3">
              <div>
                <span className="lp-eyebrow">🔥 Hot right now</span>
                <h2 style={{ margin: 0, fontFamily: 'var(--display)' }}>Trending deals</h2>
              </div>
              <Link to="/browse?sort=popular">View all</Link>
            </div>
            <div className="grid lp-listing-grid">{trending.map((l) => <ListingCard key={l.id} l={l} />)}</div>
          </div>
        </section>
      )}

      {/* ============================================================ NEW ARRIVALS */}
      {latest.length > 0 && (
        <section className="lp-section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="row-between mb-3">
              <div>
                <span className="lp-eyebrow">Just in</span>
                <h2 style={{ margin: 0, fontFamily: 'var(--display)' }}>New arrivals</h2>
              </div>
              <Link to="/browse">View all</Link>
            </div>
            <div className="grid lp-listing-grid">{latest.map((l) => <ListingCard key={l.id} l={l} />)}</div>
          </div>
        </section>
      )}

      {/* ============================================================ POPULAR SERVICES */}
      {services.length > 0 && (
        <section className="lp-section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="row-between mb-3">
              <div>
                <span className="lp-eyebrow">In demand</span>
                <h2 style={{ margin: 0, fontFamily: 'var(--display)' }}>Popular services</h2>
              </div>
              <Link to="/browse?kind=service">View all</Link>
            </div>
            <div className="grid lp-listing-grid">{services.map((l) => <ListingCard key={l.id} l={l} />)}</div>
          </div>
        </section>
      )}

      {/* ============================================================ SELL CTA */}
      <section className="lp-section">
        <div className="container">
          <div className="lp-sell">
            <div className="lp-dotgrid" />
            <div className="lp-blob lp-blob-1" />
            <div className="lp-sell-inner" style={{ position: 'relative', zIndex: 1 }}>
              <div>
                <span className="lp-stamp">For sellers</span>
                <h2>Ready to sell beyond WhatsApp status?</h2>
                <p>Register today, get verified, and start taking real orders — no website, no ads, no fees to list.</p>
              </div>
              <Link to="/sell" className="btn btn-primary btn-lg">Start selling — it's free</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
