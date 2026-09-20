import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Listing, Category } from '../types';
import ListingCard from '../components/ListingCard';
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

interface Stats { vendors: number; listings: number; services: number; cities: number }

export default function Home() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [stats, setStats] = useState<Stats>({ vendors: 0, listings: 0, services: 0, cities: 0 });
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
  }, []);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (kind) p.set('kind', kind);
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
            <span className="lp-hero-tag"><span className="dot" /> {stats.vendors || 'Dozens of'} verified stores</span>
            <h1>Shop your market, <span className="accent">all in one place.</span></h1>
            <p className="lede">
              Food stuff by the kg and the services that keep life moving — from sellers near you.
              Search, compare and order with cash on delivery or a single tap on WhatsApp.
            </p>
            <form className="lp-searchbar" onSubmit={search}>
              <input
                className="grow"
                placeholder="Search rice, braids, photographer…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
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
            <div className="lp-hero-stats">
              <div><strong>{stats.listings}</strong><span>Live listings</span></div>
              <div><strong>{stats.vendors}</strong><span>Verified stores</span></div>
              <div><strong>{stats.cities}</strong><span>Cities</span></div>
            </div>
          </div>
          <div className="lp-hero-img-wrap">
            <div className="lp-hero-img"><img src="/img/hero.jpg" alt="Vendor at her food stall" /></div>
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
