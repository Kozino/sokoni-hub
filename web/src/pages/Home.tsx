import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Listing } from '../types';
import ListingCard from '../components/ListingCard';

export default function Home() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [stats, setStats] = useState({ vendors: 0, listings: 0, services: 0, cities: 0 });
  const [latest, setLatest] = useState<Listing[]>([]);
  const [services, setServices] = useState<Listing[]>([]);

  useEffect(() => {
    api.get<{ stats: typeof stats }>('/meta/stats').then((r) => setStats(r.stats)).catch(() => {});
    api.get<{ listings: Listing[] }>('/listings?limit=8&sort=newest').then((r) => setLatest(r.listings)).catch(() => {});
    api.get<{ listings: Listing[] }>('/listings?limit=4&kind=service&sort=popular').then((r) => setServices(r.listings)).catch(() => {});
  }, []);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (kind) p.set('kind', kind);
    nav(`/browse?${p}`);
  };

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div>
            <span className="hero-tag">● {stats.vendors || 'Dozens of'} stores already verified</span>
            <h1>A proper storefront, not another status update.</h1>
            <p className="lede">
              List your food stuff, your braiding chair, your camera, your edit suite — once. Buyers
              search, find you, and order with cash on delivery or a one-tap WhatsApp message. Every
              seller is checked by a real person before a single item goes live.
            </p>
            <form className="searchbar" onSubmit={search}>
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
            <div className="hero-stats">
              <div><strong>{stats.vendors}</strong><span>Verified stores</span></div>
              <div><strong>{stats.listings}</strong><span>Live listings</span></div>
              <div><strong>{stats.services}</strong><span>Services</span></div>
              <div><strong>{stats.cities}</strong><span>Cities</span></div>
            </div>
          </div>
          <div className="hero-img-wrap">
            <div className="hero-pin" />
            <div className="hero-img"><img src="/img/hero.jpg" alt="Vendor at her food stall" /></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2>What are you shopping for?</h2>
            <p>Food stuff by the kg, litre or bag — and the service people who keep your life moving.</p>
          </div>
          <div className="grid grid-3">
            <Link to="/browse?kind=product" className="cat-tile"><img src="/img/cat-food.jpg" alt="Food stuff" /><span>Food stuff &amp; provisions</span></Link>
            <Link to="/browse?category=hair-styling" className="cat-tile"><img src="/img/cat-beauty.jpg" alt="Beauty services" /><span>Hair, nails &amp; makeup</span></Link>
            <Link to="/browse?category=photography" className="cat-tile"><img src="/img/cat-media.jpg" alt="Photo and video" /><span>Photo, video &amp; design</span></Link>
          </div>
        </div>
      </section>

      <section className="section" style={{ background: '#fff', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="container">
          <div className="row-between" style={{ alignItems: 'flex-start', gap: 48, flexWrap: 'wrap' }}>
            <div className="section-head" style={{ marginBottom: 0, flex: '1 1 260px' }}>
              <h2>Three steps, no website needed</h2>
              <p>Everything below happens from a phone — nothing to build or host yourself.</p>
              <Link to="/sell" className="btn btn-primary btn-lg mt-3">Start selling — it's free</Link>
            </div>
            <div className="ledger" style={{ flex: '1 1 360px' }}>
              {[
                { n: '01', t: 'Register your business', d: 'Create an account, add your business name, city, WhatsApp number and an ID document.' },
                { n: '02', t: 'Get checked by admin', d: 'A real person reviews every store. This protects buyers and keeps prohibited goods off the platform.' },
                { n: '03', t: 'Post & get orders', d: 'Upload products with price, quantity, weight or litres — or list a service. Orders arrive by cash on delivery or WhatsApp.' },
              ].map((s) => (
                <div key={s.n} className="ledger-step">
                  <span className="ledger-num">{s.n}</span>
                  <div><h3>{s.t}</h3><p>{s.d}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {latest.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="row-between mb-3">
              <h2 style={{ margin: 0 }}>Freshly listed</h2>
              <Link to="/browse">View all</Link>
            </div>
            <div className="grid grid-4">{latest.map((l) => <ListingCard key={l.id} l={l} />)}</div>
          </div>
        </section>
      )}

      {services.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="row-between mb-3">
              <h2 style={{ margin: 0 }}>Popular services</h2>
              <Link to="/browse?kind=service">View all</Link>
            </div>
            <div className="grid grid-4">{services.map((l) => <ListingCard key={l.id} l={l} />)}</div>
          </div>
        </section>
      )}

      <section className="section" style={{ background: 'var(--ink-deep)', color: '#fff' }}>
        <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 30, alignItems: 'center' }}>
          <div>
            <span className="stamp" style={{ borderColor: 'var(--gold)', color: 'var(--gold)', background: 'rgba(217,142,43,.14)', marginBottom: 12 }}>Policy</span>
            <h2 style={{ color: '#fff' }}>Selling cosmetics or medicine?</h2>
            <p style={{ color: 'rgba(255,255,255,.75)', margin: 0 }}>
              Those categories aren't permitted on Sokoni Hub. Listings are screened automatically
              and by our admin team — read the policy before you register.
            </p>
          </div>
          <Link to="/policy" className="btn btn-outline" style={{ background: 'transparent', borderColor: 'rgba(255,255,255,.35)', color: '#fff' }}>Read the policy</Link>
        </div>
      </section>
    </>
  );
}
