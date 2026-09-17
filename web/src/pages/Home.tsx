import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Listing } from '../types';
import ListingCard from '../components/ListingCard';
import './Home.css';

export default function Home() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [stats, setStats] = useState({ vendors: 0, listings: 0, services: 0, cities: 0 });
  const [latest, setLatest] = useState<Listing[]>([]);
  const [services, setServices] = useState<Listing[]>([]);

  useEffect(() => {
    api.get<{ stats: typeof stats }>('/meta/stats').then((r) => setStats(r.stats)).catch(() => {});
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
      {/* ---------------------------------------------------------------- HERO */}
      <section className="lp-hero">
        <div className="lp-dotgrid" />
        <div className="lp-blob lp-blob-1" />
        <div className="lp-blob lp-blob-2" />
        <div className="container lp-hero-inner">
          <div>
            <span className="lp-hero-tag"><span className="dot" /> {stats.vendors || 'Dozens of'} stores already verified</span>
            <h1>A proper storefront, <span className="accent">not another status update.</span></h1>
            <p className="lede">
              List your food stuff, your braiding chair, your camera, your edit suite — once. Buyers
              search, find you, and order with cash on delivery or a one-tap WhatsApp message. Every
              seller is checked by a real person before a single item goes live.
            </p>
            <form className="lp-searchbar" onSubmit={search}>
              <input
                className="grow"
                placeholder="Search rice, braids, photographer…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">Everything</option>
                <option value="product">Food stuff</option>
                <option value="service">Services</option>
              </select>
              <button className="btn btn-primary" type="submit">Search</button>
            </form>
            <div className="lp-hero-stats">
              <div><strong>{stats.vendors}</strong><span>Verified stores</span></div>
              <div><strong>{stats.listings}</strong><span>Live listings</span></div>
              <div><strong>{stats.services}</strong><span>Services</span></div>
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

      {/* ---------------------------------------------------------------- TRUST STRIP */}
      <section className="lp-trust">
        <div className="container lp-trust-row">
          <div className="lp-trust-item"><span className="ic">🛡️</span><div><strong>Verified sellers only</strong><span>Manually checked, not just self-signed</span></div></div>
          <div className="lp-trust-item"><span className="ic">💵</span><div><strong>Cash on delivery</strong><span>Pay when it arrives, no risk upfront</span></div></div>
          <div className="lp-trust-item"><span className="ic">💬</span><div><strong>WhatsApp checkout</strong><span>Order with a single tap, no app to learn</span></div></div>
          <div className="lp-trust-item"><span className="ic">🚫</span><div><strong>No listing fees</strong><span>Free to register and start selling</span></div></div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- CATEGORIES */}
      <section className="lp-section">
        <div className="container">
          <div className="lp-section-head">
            <span className="lp-eyebrow">Shop by category</span>
            <h2>What are you shopping for?</h2>
            <p>Food stuff by the kg, litre or bag — and the service people who keep your life moving.</p>
          </div>
          <div className="grid grid-3">
            <Link to="/browse?kind=product" className="lp-cat-tile">
              <img src="/img/cat-food.jpg" alt="Food stuff" />
              <span>Food stuff &amp; provisions<small>Rice, oils, spices &amp; more</small></span>
            </Link>
            <Link to="/browse?category=hair-styling" className="lp-cat-tile">
              <img src="/img/cat-beauty.jpg" alt="Beauty services" />
              <span>Hair, nails &amp; makeup<small>Book a verified stylist</small></span>
            </Link>
            <Link to="/browse?category=photography" className="lp-cat-tile">
              <img src="/img/cat-media.jpg" alt="Photo and video" />
              <span>Photo, video &amp; design<small>Studios &amp; freelance creatives</small></span>
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- HOW IT WORKS */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="lp-steps-wrap">
            <div className="lp-blob lp-blob-1" />
            <div className="lp-blob lp-blob-2" />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="lp-section-head center">
                <span className="lp-eyebrow">Getting started</span>
                <h2>Three steps, no website needed</h2>
                <p>Everything below happens from a phone — nothing to build or host yourself.</p>
              </div>
              <div className="lp-steps">
                {[
                  { n: '01', t: 'Register your business', d: 'Create an account, add your business name, city, WhatsApp number and an ID document.' },
                  { n: '02', t: 'Get checked by admin', d: 'A real person reviews every store. This protects buyers and keeps prohibited goods off the platform.' },
                  { n: '03', t: 'Post & get orders', d: 'Upload products with price, quantity, weight or litres — or list a service. Orders arrive by cash on delivery or WhatsApp.' },
                ].map((s) => (
                  <div key={s.n} className="lp-step">
                    <span className="lp-step-num">{s.n}</span>
                    <h3>{s.t}</h3>
                    <p>{s.d}</p>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'center', marginTop: 'var(--s-8)' }}>
                <Link to="/sell" className="btn btn-primary btn-lg" style={{ background: 'var(--lp-orange)' }}>Start selling — it's free</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- FRESHLY LISTED */}
      {latest.length > 0 && (
        <section className="lp-section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="row-between mb-3">
              <div>
                <span className="lp-eyebrow">Just landed</span>
                <h2 style={{ margin: 0, fontFamily: 'var(--display)' }}>Freshly listed</h2>
              </div>
              <Link to="/browse">View all</Link>
            </div>
            <div className="grid lp-listing-grid">{latest.map((l) => <ListingCard key={l.id} l={l} />)}</div>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- WHY SOKONI HUB */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="lp-section-head">
            <span className="lp-eyebrow">Why Sokoni Hub</span>
            <h2>Built for how you already sell</h2>
            <p>No storefront to design, no ads to run — just the tools that turn a WhatsApp status into a real business.</p>
          </div>
          <div className="grid grid-4">
            <div className="lp-feature"><span className="ic">🔍</span><h3>Discoverable</h3><p>Buyers search by keyword, category and city — not just people who already have your number.</p></div>
            <div className="lp-feature"><span className="ic">📦</span><h3>Stock aware</h3><p>Track quantity, weight and litres per listing so you never sell what you don't have.</p></div>
            <div className="lp-feature"><span className="ic">📊</span><h3>Real dashboard</h3><p>Revenue, orders and views at a glance — the numbers your business status update never showed.</p></div>
            <div className="lp-feature"><span className="ic">🤝</span><h3>Buyer trust</h3><p>Verification and public reviews mean buyers order with confidence, not a leap of faith.</p></div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- POPULAR SERVICES */}
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

      {/* ---------------------------------------------------------------- POLICY BANNER */}
      <section className="lp-policy lp-section">
        <div className="lp-dotgrid" />
        <div className="lp-blob lp-blob-1" />
        <div className="container lp-policy-inner">
          <div>
            <span className="lp-stamp">Policy</span>
            <h2 style={{ color: '#fff' }}>Selling cosmetics or medicine?</h2>
            <p style={{ color: 'rgba(255,255,255,.78)', margin: 0, maxWidth: '52ch' }}>
              Those categories aren't permitted on Sokoni Hub. Listings are screened automatically
              and by our admin team — read the policy before you register.
            </p>
          </div>
          <Link to="/policy" className="btn btn-outline" style={{ background: 'rgba(255,255,255,.06)', borderColor: 'rgba(255,255,255,.35)', color: '#fff' }}>Read the policy</Link>
        </div>
      </section>

      {/* ---------------------------------------------------------------- FINAL CTA */}
      <section className="lp-section">
        <div className="container">
          <div className="lp-cta">
            <div className="lp-dotgrid" />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <h2>Ready to sell beyond WhatsApp status?</h2>
              <p>Register today, get verified, and start taking real orders — no website, no ads, no fees to list.</p>
              <Link to="/sell" className="btn btn-primary btn-lg">Start selling — it's free</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
