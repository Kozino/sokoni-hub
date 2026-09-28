import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Listing, Category } from '../types';
import ListingCard from '../components/ListingCard';
import FeaturedStores from '../components/FeaturedStores';
import { useT } from '../i18n';
import { useLocation as useBuyerLocation } from '../state/LocationContext';
import './Home.css';

/**
 * Category wall artwork.
 *
 * These were emoji, which render as a different picture on Android, iOS and
 * Windows — the same wall looked like three different products depending on
 * the phone, and several glyphs do not exist at all on older Android.
 * Replaced with photographs shot to one consistent treatment.
 *
 * 128px WebP, 1-6 KB each, 65 KB for all eighteen — smaller than one emoji
 * font subset, and lazy-loaded besides. Anything unrecognised falls back to
 * _default.webp rather than a broken image.
 */
const CAT_SLUGS = new Set([
  'grains-cereals', 'tubers-flour', 'oils-condiments', 'spices-seasoning',
  'frozen-protein', 'fruits-vegetables', 'snacks-drinks', 'hair-styling',
  'nails', 'makeup', 'photography', 'video-editing', 'graphics-design',
  'tailoring', 'catering', 'events', 'cleaning',
]);
const catImg = (c: Category) =>
  `/img/cat/${CAT_SLUGS.has(c.slug) ? c.slug : '_default'}.webp`;

/* Quick "popular searches" chips shown under the hero search box. */
/* Labels are translation keys, resolved at render — a hardcoded label here
   stays English no matter what the buyer picked. */
const QUICK = [
  { key: 'quick.grains',   to: '/browse?category=grains-cereals' },
  { key: 'quick.braids',   to: '/browse?category=hair-styling' },
  { key: 'quick.catering', to: '/browse?category=catering' },
  { key: 'quick.photo',    to: '/browse?category=photography' },
  { key: 'quick.spices',   to: '/browse?category=spices-seasoning' },
];

interface Stats { vendors: number; listings: number; services: number; cities: number; orders_delivered: number }

export default function Home() {
  const t = useT();
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
    { label: t('home.stat.listings'), value: stats.listings },
    { label: t('home.stat.vendors'), value: stats.vendors },
    { label: t('home.stat.orders'), value: stats.orders_delivered },
    { label: t('home.stat.cities'), value: stats.cities },
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
                ? t('home.hero.verifiedStores', { count: stats.vendors })
                : t('home.hero.checkedByHand')}
            </span>
            <h1>{t('home.hero.title')} <span className="accent">{t('home.hero.titleAccent')}</span></h1>
            <p className="lede">{t('home.hero.lede')}</p>
            <form className="lp-searchbar" onSubmit={search}>
              <input className="grow" placeholder={t('home.hero.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
              <select value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="">{t('home.hero.allCities')}</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">{t('common.all')}</option>
                <option value="product">{t('common.products')}</option>
                <option value="service">{t('common.services')}</option>
              </select>
              <button className="btn btn-primary" type="submit">{t('common.search')}</button>
            </form>
            <div className="lp-hero-chips">
              <span className="lp-hero-chips-label">{t('home.hero.popular')}</span>
              {QUICK.map((c) => (
                <button key={c.to} type="button" className="lp-chip" onClick={() => nav(c.to)}>{t(c.key)}</button>
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
                alt={t('home.hero.imageAlt')}
                width={1584}
                height={672}
                fetchPriority="high"
                decoding="async"
              />
            </div>
            <div className="lp-hero-float">
              <span className="ic">✅</span>
              <div><strong>{t('home.hero.adminVerified')}</strong><span>{t('home.hero.adminVerifiedSub')}</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ BENEFITS STRIP */}
      <section className="lp-benefits">
        <div className="container lp-benefits-row">
          <div className="lp-benefit"><span className="ic">🛡️</span><div><strong>{t('home.benefit.verified')}</strong><span>{t('home.benefit.verifiedSub')}</span></div></div>
          <div className="lp-benefit"><span className="ic">💵</span><div><strong>{t('home.benefit.cod')}</strong><span>{t('home.benefit.codSub')}</span></div></div>
          <div className="lp-benefit"><span className="ic">💬</span><div><strong>{t('home.benefit.whatsapp')}</strong><span>{t('home.benefit.whatsappSub')}</span></div></div>
          <div className="lp-benefit"><span className="ic">🚫</span><div><strong>{t('home.benefit.noFees')}</strong><span>{t('home.benefit.noFeesSub')}</span></div></div>
        </div>
      </section>

      {/* ============================================================ HOW IT WORKS */}
      <section className="lp-section lp-how">
        <div className="container">
          <div className="lp-section-head" style={{ margin: '0 auto var(--s-7)', textAlign: 'center' }}>
            <span className="lp-eyebrow">{t('how.eyebrow')}</span>
            <h2>{t('how.title')}</h2>
          </div>
          <div className="lp-how-grid">
            <div className="lp-how-step">
              <span className="lp-how-num">1</span>
              <span className="ic">🔍</span>
              <strong>{t('how.1.title')}</strong>
              <p>{t('how.1.body')}</p>
            </div>
            <div className="lp-how-step">
              <span className="lp-how-num">2</span>
              <span className="ic">🛒</span>
              <strong>{t('how.2.title')}</strong>
              <p>{t('how.2.body')}</p>
            </div>
            <div className="lp-how-step">
              <span className="lp-how-num">3</span>
              <span className="ic">📦</span>
              <strong>{t('how.3.title')}</strong>
              <p>{t('how.3.body')}</p>
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
            <span className="lp-eyebrow">{t('home.categories.eyebrow')}</span>
            <h2>{t('home.categories.title')}</h2>
          </div>
          <div className="lp-cat-wall">
            {cats.map((c) => (
              <Link key={c.id} to={`/browse?category=${c.slug}`} className="lp-cat-chip">
                {/* alt="" — the category name is right beside it, so a
                    screen reader announcing the picture too would just be
                    saying everything twice. */}
                <img className="lp-cat-ico" src={catImg(c)} alt=""
                     width={42} height={42} loading="lazy" decoding="async" />
                {/* A category added after this build has no key; show the name the
                    database gave us rather than a raw slug. */}
                <span className="lp-cat-label">{CAT_SLUGS.has(c.slug) ? t(`cat.${c.slug}`) : c.name}</span>
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
                <span className="lp-eyebrow">{t('home.trending.eyebrow')}</span>
                <h2 style={{ margin: 0, fontFamily: 'var(--display)' }}>{t('home.trending.title')}</h2>
              </div>
              <Link to="/browse?sort=popular">{t('common.viewAll')}</Link>
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
                <span className="lp-eyebrow">{t('home.new.eyebrow')}</span>
                <h2 style={{ margin: 0, fontFamily: 'var(--display)' }}>{t('home.new.title')}</h2>
              </div>
              <Link to="/browse">{t('common.viewAll')}</Link>
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
                <span className="lp-eyebrow">{t('home.services.eyebrow')}</span>
                <h2 style={{ margin: 0, fontFamily: 'var(--display)' }}>{t('home.services.title')}</h2>
              </div>
              <Link to="/browse?kind=service">{t('common.viewAll')}</Link>
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
                <span className="lp-stamp">{t('home.sell.stamp')}</span>
                <h2>{t('home.sell.title')}</h2>
                <p>{t('home.sell.body')}</p>
              </div>
              <Link to="/sell" className="btn btn-primary btn-lg">{t('home.sell.cta')}</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
