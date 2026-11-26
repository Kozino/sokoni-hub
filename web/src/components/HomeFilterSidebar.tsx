import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Category } from '../types';
import { useT } from '../i18n';

/**
 * Landing-page sidebar filter (Sokoni-branded).
 *
 * Purely presentational: it reuses the categories and cities Home.tsx already
 * fetched and makes NO API calls of its own. "Show results" sends the buyer to
 * /browse with the same query params the listings API supports
 * (q, kind, category, city, min, max, sort) — the hero search is untouched.
 *
 * Desktop: sticky left column. Tablet/phone: a "Filter & sort" bar that opens
 * the same panel as an off-canvas drawer.
 */

type Kind = '' | 'product' | 'service';
type Sort = 'newest' | 'popular' | 'price_asc' | 'price_desc';

interface Props {
  cats: Category[];
  cities: string[];
  /** Buyer's current city (shared with the hero search), used as the default. */
  defaultCity?: string;
  /** Resolves a category to its display label (translated where available). */
  catLabel: (c: Category) => string;
  /** Category artwork URL. */
  catImg: (c: Category) => string;
}

const PRICE_RANGES: { min: string; max: string; key: string }[] = [
  { min: '', max: '25', key: 'hf.price.under25' },
  { min: '25', max: '50', key: 'hf.price.25to50' },
  { min: '50', max: '100', key: 'hf.price.50to100' },
  { min: '100', max: '250', key: 'hf.price.100to250' },
  { min: '250', max: '', key: 'hf.price.over250' },
];

const SHOW_LIMIT = 6;

/* Tiny stroke icons (24px grid), same style as the rest of the landing page. */
const I = {
  search: <><circle cx="11" cy="11" r="7.5" /><path d="m20.5 20.5-4-4" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  tag: <><path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z" /><circle cx="7.5" cy="7.5" r="1.3" /></>,
  pin: <><path d="M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></>,
  coin: <><circle cx="12" cy="12" r="9" /><path d="M14.8 9a2.6 2.6 0 0 0-2.3-1.2h-1.1a2.1 2.1 0 0 0 0 4.2h1.2a2.1 2.1 0 0 1 0 4.2h-1.2A2.6 2.6 0 0 1 9.2 15M12 6v1.8M12 16.2V18" /></>,
  sort: <><path d="m3 16 4 4 4-4M7 20V4M21 8l-4-4-4 4M17 4v16" /></>,
  layers: <><path d="m12 2 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></>,
  sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  chev: <path d="m6 9 6 6 6-6" />,
};

function Svg({ d, size = 18 }: { d: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  );
}

/** Collapsible filter group (native <details>, so it works without JS state). */
function Group({ title, icon, children, open = true, badge }: {
  title: string; icon: ReactNode; children: ReactNode; open?: boolean; badge?: string;
}) {
  return (
    <details className="hf-group" open={open}>
      <summary>
        <span className="hf-group-ic"><Svg d={icon} size={16} /></span>
        <span className="hf-group-title">{title}</span>
        {badge && <span className="hf-group-badge">{badge}</span>}
        <span className="hf-group-chev"><Svg d={I.chev} size={16} /></span>
      </summary>
      <div className="hf-group-body">{children}</div>
    </details>
  );
}

export default function HomeFilterSidebar({ cats, cities, defaultCity = '', catLabel, catImg }: Props) {
  const t = useT();
  const nav = useNavigate();

  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState(defaultCity);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [catQuery, setCatQuery] = useState('');
  const [allCats, setAllCats] = useState(false);
  const [allCities, setAllCities] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Follow the hero's city picker until the buyer chooses one here.
  const touchedCity = useRef(false);
  useEffect(() => { if (!touchedCity.current) setCity(defaultCity); }, [defaultCity]);

  // Drawer: lock page scroll, close on Escape, move focus into the panel.
  useEffect(() => {
    if (!drawer) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [drawer]);

  // Close the drawer if the viewport grows into the desktop layout.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1025px)');
    const onChange = () => { if (mq.matches) setDrawer(false); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const kindCats = useMemo(() => cats.filter((c) => !kind || c.kind === kind), [cats, kind]);
  const groups = useMemo(() => {
    const needle = catQuery.trim().toLowerCase();
    const match = (c: Category) => !needle || catLabel(c).toLowerCase().includes(needle);
    const filtered = kindCats.filter(match);
    return {
      product: filtered.filter((c) => c.kind === 'product'),
      service: filtered.filter((c) => c.kind === 'service'),
      count: filtered.length,
    };
  }, [kindCats, catQuery, catLabel]);

  const minN = min === '' ? null : Number(min);
  const maxN = max === '' ? null : Number(max);
  const priceError = minN !== null && maxN !== null && minN > maxN;

  const selectedCat = cats.find((c) => c.slug === category);

  /* Applied-filter chips, each with its own remove action. */
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (q.trim()) chips.push({ key: 'q', label: `“${q.trim()}”`, clear: () => setQ('') });
  if (kind) chips.push({ key: 'kind', label: kind === 'product' ? t('common.products') : t('common.services'), clear: () => setKind('') });
  if (selectedCat) chips.push({ key: 'cat', label: catLabel(selectedCat), clear: () => setCategory('') });
  if (city) chips.push({ key: 'city', label: city, clear: () => { touchedCity.current = true; setCity(''); } });
  if (min || max) chips.push({
    key: 'price',
    label: min && max ? `QAR ${min}–${max}` : min ? `QAR ${min}+` : `≤ QAR ${max}`,
    clear: () => { setMin(''); setMax(''); },
  });
  if (sort !== 'newest') chips.push({ key: 'sort', label: sortLabel(sort), clear: () => setSort('newest') });

  function sortLabel(s: Sort) {
    return s === 'popular' ? t('browse.sort.viewed')
      : s === 'price_asc' ? t('browse.sort.priceLow')
      : s === 'price_desc' ? t('browse.sort.priceHigh')
      : t('browse.sort.newest');
  }

  const resetAll = () => {
    setQ(''); setKind(''); setCategory(''); setMin(''); setMax(''); setSort('newest');
    setCatQuery(''); touchedCity.current = true; setCity('');
  };

  const pickKind = (k: Kind) => {
    setKind(k);
    // Drop a category that no longer belongs to the chosen type.
    if (k && selectedCat && selectedCat.kind !== k) setCategory('');
  };

  const pickCategory = (slug: string) => {
    setCategory(slug);
    const c = cats.find((x) => x.slug === slug);
    if (c && kind && c.kind !== kind) setKind(c.kind);
  };

  const apply = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (priceError) return;
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (kind) p.set('kind', kind);
    if (category) p.set('category', category);
    if (city) p.set('city', city);
    if (min) p.set('min', String(Math.max(0, Number(min))));
    if (max) p.set('max', String(Math.max(0, Number(max))));
    if (sort !== 'newest') p.set('sort', sort);
    setDrawer(false);
    nav(`/browse${p.toString() ? `?${p}` : ''}`);
  };

  const renderCat = (c: Category) => (
    <label key={c.id} className={`hf-opt hf-cat${category === c.slug ? ' is-on' : ''}`}>
      <input type="radio" name="hf-category" value={c.slug} checked={category === c.slug} onChange={() => pickCategory(c.slug)} />
      <img src={catImg(c)} alt="" width={26} height={26} loading="lazy" decoding="async" />
      <span className="hf-opt-label">{catLabel(c)}</span>
    </label>
  );

  // Collapse long lists unless the buyer is searching or expanded them.
  const searchingCats = catQuery.trim() !== '';
  const expanded = allCats || searchingCats;
  // One type chosen: that group gets the full preview. Both types: split it.
  const visibleProduct = expanded ? groups.product : groups.product.slice(0, kind ? SHOW_LIMIT : 4);
  const visibleService = expanded ? groups.service : groups.service.slice(0, kind ? SHOW_LIMIT : 3);
  const hiddenCats = groups.count - visibleProduct.length - visibleService.length;

  const visibleCities = allCities ? cities : cities.slice(0, SHOW_LIMIT);

  const activeCount = chips.length;

  const panel = (
    <form className="hf-form" onSubmit={apply} aria-label={t('hf.title')}>
      {/* ---- Branded header: Sokoni mark, title, live count of applied filters ---- */}
      <div className="hf-head">
        <span className="hf-mark"><img src="/logo.png" alt="" width={34} height={30} /></span>
        <div className="hf-head-copy">
          <strong>{t('hf.title')}</strong>
          <span>{t('hf.subtitle')}</span>
        </div>
        <button type="button" className="hf-close" onClick={() => setDrawer(false)} aria-label={t('common.close')}>
          <Svg d={I.x} size={20} />
        </button>
      </div>

      <div className="hf-scroll">
        {/* ---- Applied filters ---- */}
        {chips.length > 0 && (
          <div className="hf-applied">
            <div className="hf-applied-head">
              <span>{t('hf.applied')}</span>
              <button type="button" className="hf-link" onClick={resetAll}>{t('hf.clearAll')}</button>
            </div>
            <ul className="hf-chips">
              {chips.map((c) => (
                <li key={c.key}>
                  <button type="button" className="hf-chip" onClick={c.clear} aria-label={`${t('hf.remove')}: ${c.label}`}>
                    <span>{c.label}</span><Svg d={I.x} size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ---- Keyword ---- */}
        <Group title={t('hf.keyword')} icon={I.search}>
          <label className="hf-search">
            <span className="sr-only">{t('hf.keyword')}</span>
            <Svg d={I.search} size={16} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('hf.keywordPlaceholder')} />
          </label>
        </Group>

        {/* ---- Listing type ---- */}
        <Group title={t('hf.type')} icon={I.layers}>
          <div className="hf-seg" role="radiogroup" aria-label={t('hf.type')}>
            {([['', t('common.all')], ['product', t('common.products')], ['service', t('common.services')]] as [Kind, string][]).map(([k, label]) => (
              <label key={k || 'all'} className={kind === k ? 'is-on' : ''}>
                <input type="radio" name="hf-kind" value={k} checked={kind === k} onChange={() => pickKind(k)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </Group>

        {/* ---- Category ---- */}
        <Group title={t('browse.filter.category')} icon={I.grid} badge={selectedCat ? '1' : undefined}>
          {kindCats.length > SHOW_LIMIT && (
            <label className="hf-search hf-search-sm">
              <span className="sr-only">{t('hf.findCategory')}</span>
              <Svg d={I.search} size={14} />
              <input type="search" value={catQuery} onChange={(e) => setCatQuery(e.target.value)} placeholder={t('hf.findCategory')} />
            </label>
          )}
          <div className="hf-list">
            <label className={`hf-opt hf-cat${category === '' ? ' is-on' : ''}`}>
              <input type="radio" name="hf-category" value="" checked={category === ''} onChange={() => setCategory('')} />
              <span className="hf-cat-all"><Svg d={I.grid} size={14} /></span>
              <span className="hf-opt-label">{t('browse.allCategories')}</span>
            </label>
            {visibleProduct.length > 0 && !kind && <div className="hf-sub">{t('common.products')}</div>}
            {visibleProduct.map(renderCat)}
            {visibleService.length > 0 && !kind && <div className="hf-sub">{t('common.services')}</div>}
            {visibleService.map(renderCat)}
            {groups.count === 0 && <p className="hf-empty">{t('hf.noCategory')}</p>}
          </div>
          {!searchingCats && (hiddenCats > 0 || allCats) && (
            <button type="button" className="hf-more" onClick={() => setAllCats((v) => !v)} aria-expanded={allCats}>
              {allCats ? t('hf.showLess') : t('hf.showMore', { count: hiddenCats })}
            </button>
          )}
        </Group>

        {/* ---- Location ---- */}
        {cities.length > 0 && (
          <Group title={t('hf.location')} icon={I.pin} badge={city ? '1' : undefined}>
            <div className="hf-list">
              {['', ...visibleCities].map((c) => (
                <label key={c || 'all'} className={`hf-opt hf-radio${city === c ? ' is-on' : ''}`}>
                  <input type="radio" name="hf-city" value={c} checked={city === c}
                         onChange={() => { touchedCity.current = true; setCity(c); }} />
                  <span className="hf-dot" aria-hidden="true" />
                  <span className="hf-opt-label">{c || t('home.hero.allCities')}</span>
                </label>
              ))}
            </div>
            {cities.length > SHOW_LIMIT && (
              <button type="button" className="hf-more" onClick={() => setAllCities((v) => !v)} aria-expanded={allCities}>
                {allCities ? t('hf.showLess') : t('hf.showMore', { count: cities.length - SHOW_LIMIT })}
              </button>
            )}
          </Group>
        )}

        {/* ---- Price ---- */}
        <Group title={t('hf.price')} icon={I.coin} badge={min || max ? '1' : undefined}>
          <div className="hf-price">
            <label>
              <span>{t('hf.min')}</span>
              <div className="hf-money"><em>QAR</em>
                <input type="number" inputMode="decimal" min={0} step="any" value={min}
                       onChange={(e) => setMin(e.target.value)} placeholder="0" aria-invalid={priceError || undefined} />
              </div>
            </label>
            <span className="hf-dash" aria-hidden="true">–</span>
            <label>
              <span>{t('hf.max')}</span>
              <div className="hf-money"><em>QAR</em>
                <input type="number" inputMode="decimal" min={0} step="any" value={max}
                       onChange={(e) => setMax(e.target.value)} placeholder={t('hf.any')} aria-invalid={priceError || undefined} />
              </div>
            </label>
          </div>
          {priceError && <p className="hf-error" role="alert">{t('hf.priceError')}</p>}
          <div className="hf-ranges">
            {PRICE_RANGES.map((r) => {
              const on = min === r.min && max === r.max;
              return (
                <button key={r.key} type="button" className={`hf-range${on ? ' is-on' : ''}`} aria-pressed={on}
                        onClick={() => { if (on) { setMin(''); setMax(''); } else { setMin(r.min); setMax(r.max); } }}>
                  {t(r.key)}
                </button>
              );
            })}
          </div>
        </Group>

        {/* ---- Sort ---- */}
        <Group title={t('hf.sortBy')} icon={I.sort} open={false}>
          <div className="hf-list">
            {(['newest', 'popular', 'price_asc', 'price_desc'] as Sort[]).map((s) => (
              <label key={s} className={`hf-opt hf-radio${sort === s ? ' is-on' : ''}`}>
                <input type="radio" name="hf-sort" value={s} checked={sort === s} onChange={() => setSort(s)} />
                <span className="hf-dot" aria-hidden="true" />
                <span className="hf-opt-label">{sortLabel(s)}</span>
              </label>
            ))}
          </div>
        </Group>
      </div>

      {/* ---- Actions ---- */}
      <div className="hf-actions">
        <button type="button" className="hf-reset" onClick={resetAll} disabled={activeCount === 0}>{t('hf.reset')}</button>
        <button type="submit" className="hf-apply" disabled={priceError}>
          <Svg d={I.search} size={16} />{t('hf.showResults')}
        </button>
      </div>
    </form>
  );

  return (
    <>
      {/* Tablet/phone trigger bar */}
      <div className="hf-bar">
        <button type="button" className="hf-bar-btn" onClick={() => setDrawer(true)} aria-expanded={drawer} aria-controls="hf-panel">
          <Svg d={I.sliders} size={18} />
          <span>{t('hf.filterSort')}</span>
          {activeCount > 0 && <span className="hf-bar-count">{activeCount}</span>}
        </button>
        {chips.length > 0 && (
          <div className="hf-bar-chips">
            {chips.map((c) => (
              <button key={c.key} type="button" className="hf-chip" onClick={c.clear} aria-label={`${t('hf.remove')}: ${c.label}`}>
                <span>{c.label}</span><Svg d={I.x} size={12} />
              </button>
            ))}
          </div>
        )}
      </div>

      {drawer && <div className="hf-overlay" onClick={() => setDrawer(false)} aria-hidden="true" />}

      <aside
        id="hf-panel"
        className={`hf${drawer ? ' is-open' : ''}`}
        ref={panelRef}
        tabIndex={-1}
        aria-label={t('hf.title')}
        {...(drawer ? { role: 'dialog', 'aria-modal': true } : {})}
      >
        {panel}
      </aside>
    </>
  );
}
