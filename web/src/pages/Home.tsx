
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Listing, Category } from '../types';
import ListingCard from '../components/ListingCard';
import FeaturedStores from '../components/FeaturedStores';
import { useT } from '../i18n';
import { useLocation as useBuyerLocation } from '../state/LocationContext';
import './Home.css';

/* Category artwork: one consistent photo treatment, 128px WebP each.
   Unknown slugs fall back to _default.webp instead of a broken image. */
const CAT_SLUGS = new Set([
  'grains-cereals', 'tubers-flour', 'oils-condiments', 'spices-seasoning',
  'frozen-protein', 'fruits-vegetables', 'snacks-drinks', 'hair-styling',
  'nails', 'makeup', 'photography', 'video-editing', 'graphics-design',
  'tailoring', 'catering', 'events', 'cleaning',
]);

const catImg = (c: Category) =>
  `/img/cat/${CAT_SLUGS.has(c.slug) ? c.slug : '_default'}.webp`;

/* Labels are translation keys, resolved at render. */
const QUICK = [
  { key: 'quick.grains', to: '/browse?category=grains-cereals' },
  { key: 'quick.braids', to: '/browse?category=hair-styling' },
  { key: 'quick.catering', to: '/browse?category=catering' },
  { key: 'quick.photo', to: '/browse?category=photography' },
  { key: 'quick.spices', to: '/browse?category=spices-seasoning' },
];

/* Inline SVG icons (stroke, 24px grid). Emoji render differently on every
   phone; these look identical everywhere and follow the text colour. */
const ICONS: Record<string, ReactNode> = {
  shield: <><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></>,
  cash: <><rect width="20" height="12" x="2" y="6" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></>,
  chat: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />,
  nofee: <><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></>,
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  cart: <><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></>,
  box: <><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></>,
  check: <><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>,
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/* Presentational only: takes listings the page already fetched.
   scroll = swipeable row on phones; otherwise a 2-up grid. */
function Shelf({ title, to, items, cols, scroll, tint }: {
  title: string; to: string; items: Listing[]; cols: 4 | 6; scroll?: boolean; tint?: boolean;
}) {
  const t = useT();
  if (items.length === 0) return null;

  return (
    <section className={`lp-shelf${tint ? ' is-tint' : ''}`}>
      <div className="container">
        <div className="lp-shelf-head">
          <h2>{title}</h2>
          <Link to={to} className="lp-viewall">
            {t('common.viewAll')} <span className="lp-arrow" aria-hidden="true">→</span>
          </Link>
        </div>
        <div className={`lp-rail cols-${cols}${scroll ? ' is-scroll' : ''}`}>
          {items.map((l) => <ListingCard key={l.id} l={l} showAction />)}
        </div>
      </div>
    </section>
  );
}

interface Stats {
  vendors: number;
  listings: number;
  services: number;
  cities: number;
  orders_delivered: number;
}

export default function Home() {
  const t = useT();
  const nav = useNavigate();
  const { city, setCity } = useBuyerLocation();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>({
    vendors: 0,
    listings: 0,
    services: 0,
    cities: 0,
    orders_delivered: 0
  });
  const [cats, setCats] = useState<Category[]>([]);
  const [trending, setTrending] = useState<Listing[]>([]);
  const [latest, setLatest] = useState<Listing[]>([]);
  const [services, setServices] = useState<Listing[]>([]);

  /* Unchanged: the same six calls, in the same place. */
  useEffect(() => {
    api.get<{ stats: Stats }>('/meta/stats').then((r) => setStats(r.stats)).catch(() => {});
    api.get<{ categories: Category[] }>('/meta/categories').then((r) => setCats(r.categories)).catch(() => {});
    api.get<{ listings: Listing[] }>('/listings?limit=8&sort=popular').then((r) => setTrending(r.listings)).catch(() => {});
    api.get<{ listings: Listing[] }>('/listings?limit=12&sort=newest').then((r) => setLatest(r.listings)).catch(() => {});
    api.get<{ listings: Listing[] }>('/listings?limit=6&kind=service&sort=popular').then((r) => setServices(r.listings)).catch(() => {});
    api.get<{ cities: string[] }>('/listings/cities').then((r) => setCities(r.cities)).catch(() => {});
  }, []);

  // Only counters with something to say; zeros are never shown.
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
      {/* ================================================================ HERO */}
      <section className="lp-hero">
        {/* Photo background. An <img> (not CSS background) so it can be the LCP
            element and carry fetchPriority; the overlay in Home.css keeps text readable. */}
        <img className="lp-hero-bg" src="/img/hero.jpg" alt="" width={1584} height={672}
             fetchPriority="high" decoding="async" />
        <div className="container lp-hero-inner">
          <div className="lp-hero-copy">
            <div className="lp-hero-tag"><span className="dot" />Qatar's marketplace for foodstuff &amp; services</div>
            <h1>{t('home.hero.title')} {t('home.hero.titleAccent')}</h1>
            <p className="lede">{t('home.hero.lede')}</p>

            <form className="lp-searchbar" onSubmit={search} role="search">
              <label className="lp-sb-field lp-sb-q">
                <span className="sr-only">{t('common.search')}</span>
                <Icon name="search" />
                <input placeholder={t('home.hero.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
              <select aria-label={t('home.hero.allCities')} value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="">{t('home.hero.allCities')}</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select aria-label={t('common.all')} value={kind} onChange={(e) => setKind(e.target.value)}>
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

            {heroStats.length > 0 && (
              <div className="lp-hero-stats">
                {heroStats.map((s) => (
                  <div key={s.label}><strong>{s.value}</strong><span>{s.label}</span></div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ============================================================ TRUST BAR */}
      <section className="lp-trust" aria-label="Why shop here">
        <div className="container">
          <ul className="lp-trust-row">
            <li><span className="ic"><Icon name="shield" /></span><div><strong>{t('home.benefit.verified')}</strong><span>{t('home.benefit.verifiedSub')}</span></div></li>
            <li><span className="ic"><Icon name="cash" /></span><div><strong>{t('home.benefit.cod')}</strong><span>{t('home.benefit.codSub')}</span></div></li>
            <li><span className="ic"><Icon name="chat" /></span><div><strong>{t('home.benefit.whatsapp')}</strong><span>{t('home.benefit.whatsappSub')}</span></div></li>
            <li><span className="ic"><Icon name="nofee" /></span><div><strong>{t('home.benefit.noFees')}</strong><span>{t('home.benefit.noFeesSub')}</span></div></li>
          </ul>
        </div>
      </section>

      {/* ================================================= CATEGORIES */}
      {cats.length > 0 && (
        <section className="lp-block">
          <div className="container">
            <div className="lp-shelf-head">
              <h2>{t('home.categories.title')}</h2>
              <Link to="/browse" className="lp-viewall">
                {t('common.viewAll')} <span className="lp-arrow" aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="lp-cats">
              {cats.map((c) => (
                <Link key={c.id} to={`/browse?category=${c.slug}`} className="lp-cat">
                  {/* alt="": the name is printed right below, so a screen
                      reader would just say everything twice. */}
                  <img className="lp-cat-ico" src={catImg(c)} alt="" width={76} height={76} loading="lazy" decoding="async" />
                  <span className="lp-cat-label">{CAT_SLUGS.has(c.slug) ? t(`cat.${c.slug}`) : c.name}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Paid placement sits above the organic shelves, as before.
          Renders nothing when no placement is sold. */}
      <FeaturedStores />

      {/* ================================================= PRODUCT SHELVES */}
      <Shelf title={t('home.trending.title')} to="/browse?sort=popular" items={trending} cols={4} scroll />
      <Shelf title={t('home.new.title')} to="/browse" items={latest} cols={6} />
      <Shelf title={t('home.services.title')} to="/browse?kind=service" items={services} cols={6} scroll tint />

      {/* ================================================= HOW IT WORKS */}
      <section className="lp-block">
        <div className="container">
          <h2 className="lp-center">{t('how.title')}</h2>
          <ol className="lp-steps">
            {([['search', '1'], ['cart', '2'], ['box', '3']] as const).map(([icon, n]) => (
              <li key={n} className="lp-step">
                <span className="lp-step-ic"><Icon name={icon} /></span>
                <div>
                  <strong>{t(`how.${n}.title`)}</strong>
                  <p>{t(`how.${n}.body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ================================================= SELL CTA */}
      <section className="lp-block lp-block-last">
        <div className="container">
          <div className="lp-sell">
            <div className="lp-sell-inner">
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
