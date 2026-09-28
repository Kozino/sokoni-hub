import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api';
import type { Listing, Category } from '../types';
import ListingCard from '../components/ListingCard';
import { Empty, Spinner } from '../components/ui';
import './Browse.css';
import { useT } from '../i18n';

export default function Browse() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [cats, setCats] = useState<Category[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState(params.get('q') || '');

  const get = (k: string) => params.get(k) || '';
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    p.delete('offset');
    setParams(p);
  };

  useEffect(() => {
    api.get<{ categories: Category[] }>('/meta/categories').then((r) => setCats(r.categories)).catch(() => {});
    api.get<{ cities: string[] }>('/listings/cities').then((r) => setCities(r.cities)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const offset = Number(get('offset') || 0);
    api
      .get<{ listings: Listing[]; total: number }>(
        `/listings${qs({
          q: get('q'), kind: get('kind'), category: get('category'), city: get('city'),
          min: get('min'), max: get('max'), sort: get('sort') || 'newest', limit: 24, offset,
        })}`
      )
      .then((r) => { setListings(r.listings); setTotal(r.total); })
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, [params]);

  const kind = get('kind');
  const visibleCats = cats.filter((c) => !kind || c.kind === kind);
  const offset = Number(get('offset') || 0);

  return (
    <div className="container browse-page">
      <h1>{kind === 'service' ? t('common.services') : kind === 'product' ? t('browse.foodstuffTitle') : t('browse.everything')}</h1>
      <p style={{ color: 'var(--muted)' }}>{t('browse.listingCount', { count: total })} {t('browse.fromStores')}</p>

      <form
        className="filters mt-2"
        onSubmit={(e) => { e.preventDefault(); set('q', term); }}
      >
        <input placeholder={t('browse.searchPlaceholder')} value={term} onChange={(e) => setTerm(e.target.value)} style={{ minWidth: 220 }} />
        <select value={kind} onChange={(e) => { set('category', ''); set('kind', e.target.value); }}>
          <option value="">{t('browse.allTypes')}</option>
          <option value="product">{t('common.products')}</option>
          <option value="service">{t('common.services')}</option>
        </select>
        <select value={get('category')} onChange={(e) => set('category', e.target.value)}>
          <option value="">{t('browse.allCategories')}</option>
          {visibleCats.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
        <select value={get('city')} onChange={(e) => set('city', e.target.value)}>
          <option value="">{t('home.hero.allCities')}</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="number" placeholder={t('browse.minPrice')} value={get('min')} onChange={(e) => set('min', e.target.value)} style={{ maxWidth: 120 }} />
        <input type="number" placeholder={t('browse.maxPrice')} value={get('max')} onChange={(e) => set('max', e.target.value)} style={{ maxWidth: 120 }} />
        <select value={get('sort') || 'newest'} onChange={(e) => set('sort', e.target.value)}>
          <option value="newest">{t('browse.sort.newest')}</option>
          <option value="price_asc">Price: low → high</option>
          <option value="price_desc">Price: high → low</option>
          <option value="popular">{t('browse.sort.viewed')}</option>
        </select>
        <button className="btn btn-primary" type="submit">{t('browse.apply')}</button>
        {[...params.keys()].length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => { setTerm(''); setParams(new URLSearchParams()); }}>{t('browse.clearShort')}</button>
        )}
      </form>

      {loading ? (
        <Spinner />
      ) : listings.length === 0 ? (
        <Empty icon="🔍" title={t('browse.noMatch.title')} text={t('browse.noMatch.text')} />
      ) : (
        <>
          <div className="grid browse-grid">{listings.map((l) => <ListingCard key={l.id} l={l} />)}</div>
          {total > 24 && (
            <div className="row mt-4" style={{ justifyContent: 'center' }}>
              <button className="btn btn-outline" disabled={offset === 0} onClick={() => set('offset', String(Math.max(0, offset - 24)))}>← Previous</button>
              <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>{offset + 1}–{Math.min(offset + 24, total)} of {total}</span>
              <button className="btn btn-outline" disabled={offset + 24 >= total} onClick={() => set('offset', String(offset + 24))}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
