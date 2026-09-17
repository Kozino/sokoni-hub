import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Listing } from '../types';
import { money, priceLabel, waLink, date } from '../lib/format';
import { Badge, Spinner, Empty, Alert, QtyInput } from '../components/ui';
import { useCart } from '../state/CartContext';
import { useToast } from '../state/ToastContext';
import ListingCard from '../components/ListingCard';
import './ListingDetail.css';

export default function ListingDetail() {
  const { id } = useParams();
  const [l, setL] = useState<Listing | null>(null);
  const [related, setRelated] = useState<Listing[]>([]);
  const [vendorItems, setVendorItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const { add } = useCart();
  const { push } = useToast();

  useEffect(() => {
    setLoading(true);
    setActive(0);
    api.get<{ listing: Listing; related: Listing[]; vendorItems: Listing[] }>(`/listings/${id}`)
      .then((r) => { setL(r.listing); setRelated(r.related); setVendorItems(r.vendorItems || []); })
      .catch(() => setL(null))
      .finally(() => setLoading(false));
  }, [id]);

  const images = Array.isArray(l?.images) ? l!.images : [];

  const showImg = (i: number) => setActive((images.length + i) % images.length);
  const nextImg = () => showImg(active + 1);
  const prevImg = () => showImg(active - 1);

  const openLightbox = (i: number) => {
    if (!images.length) return;
    setActive(i);
    setZoomed(false);
    setLightboxOpen(true);
  };
  const closeLightbox = () => { setLightboxOpen(false); setZoomed(false); };

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowRight') nextImg();
      else if (e.key === 'ArrowLeft') prevImg();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxOpen, active]);

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || zoomed) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 50) prevImg();
    else if (dx < -50) nextImg();
    touchStartX.current = null;
  };

  if (loading) return <div className="container"><Spinner /></div>;
  if (!l) return <div className="container"><Empty icon="🚫" title="Listing not found" text="It may have been removed or the store unverified." action={<Link to="/browse" className="btn btn-primary">Back to browse</Link>} /></div>;

  const outOfStock = l.kind === 'product' && (l.quantity ?? 0) <= 0;

  const addToCart = () => {
    add({
      listing_id: l.id, title: l.title, price: Number(l.price), currency: l.currency,
      qty, unit: l.unit, image: images[0], vendor_id: l.vendor_id,
      vendor_name: l.business_name || 'Store', kind: l.kind, max: l.kind === 'product' ? l.quantity : null,
    });
    push(`${l.title} added to cart`, 'success');
  };

  const waText = `Hello ${l.business_name}, I saw "${l.title}" (${priceLabel(l)}) on Sokoni Hub. Is it available?`;

  return (
    <div className="container listing-detail-page">
      <p style={{ fontSize: '.85rem' }}>
        <Link to="/browse">Browse</Link> / <Link to={`/browse?category=${l.category_slug}`}>{l.category_name}</Link>
      </p>

      <div className="ld-layout">
        <div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div
              className="ld-main-img"
              onClick={() => openLightbox(active)}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              style={{ cursor: images.length ? 'zoom-in' : 'default' }}
            >
              {images[active]
                ? <img src={images[active]} alt={l.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: '4rem', opacity: .35 }}>{l.kind === 'service' ? '💇' : '🛍️'}</span>}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    className="ld-main-nav prev"
                    onClick={(e) => { e.stopPropagation(); prevImg(); }}
                    aria-label="Previous photo"
                  >‹</button>
                  <button
                    type="button"
                    className="ld-main-nav next"
                    onClick={(e) => { e.stopPropagation(); nextImg(); }}
                    aria-label="Next photo"
                  >›</button>
                  <span className="ld-main-count">{active + 1} / {images.length}</span>
                </>
              )}
              {images.length > 0 && <span className="ld-zoom-hint">🔍 Tap to zoom</span>}
            </div>
          </div>
          {images.length > 1 && (
            <div className="ld-thumbs mt-2">
              {images.map((src, i) => (
                <button
                  type="button"
                  key={i}
                  className={`ld-thumb${i === active ? ' active' : ''}`}
                  onClick={() => setActive(i)}
                >
                  <img src={src} alt={`${l.title} ${i + 1}`} />
                </button>
              ))}
            </div>
          )}

          <div className="card card-pad mt-3">
            <h3>Description</h3>
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{l.description || 'No description provided.'}</p>
          </div>

          <div className="card card-pad mt-3">
            <h3>Details</h3>
            <dl className="kv">
              <dt>Type</dt><dd style={{ textTransform: 'capitalize' }}>{l.kind}</dd>
              <dt>Category</dt><dd>{l.category_name}</dd>
              {l.kind === 'product' && <><dt>Available quantity</dt><dd>{l.quantity ?? 0} {l.unit || 'units'}</dd></>}
              {l.unit && <><dt>Sold per</dt><dd>{l.unit}</dd></>}
              {l.weight_kg && <><dt>Weight</dt><dd>{Number(l.weight_kg)} kg</dd></>}
              {l.volume_l && <><dt>Volume</dt><dd>{Number(l.volume_l)} litres</dd></>}
              {l.duration_mins && <><dt>Session length</dt><dd>{l.duration_mins} minutes</dd></>}
              {l.service_area && <><dt>Service area</dt><dd>{l.service_area}</dd></>}
              <dt>Location</dt><dd>{l.vendor_city}, {l.vendor_country}</dd>
              <dt>Listed</dt><dd>{date(l.created_at)}</dd>
              <dt>Views</dt><dd>{l.views}</dd>
            </dl>
          </div>
        </div>

        <div className="ld-buybox">
          <div className="card card-pad">
            <Badge tone={l.kind === 'service' ? 'blue' : 'terra'}>{l.kind}</Badge>
            <h1 style={{ fontSize: '1.5rem', marginTop: 10 }}>{l.title}</h1>
            <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--terra-dark)' }}>{priceLabel(l)}</div>
            {l.kind === 'product' && (
              <p style={{ fontSize: '.85rem', color: outOfStock ? 'var(--danger)' : 'var(--green)', fontWeight: 700 }}>
                {outOfStock ? 'Out of stock' : `${l.quantity} ${l.unit || 'units'} in stock`}
              </p>
            )}

            {!outOfStock && (
              <>
                <div className="row wrap mt-2" style={{ gap: 8 }}>
                  <label style={{ fontSize: '.85rem', fontWeight: 700 }}>Qty</label>
                <QtyInput value={qty} min={1} max={l.kind === 'product' ? l.quantity ?? 99 : 99} onChange={setQty} />
                  <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>= {money(Number(l.price) * qty, l.currency)}</span>
                </div>
                <button className="btn btn-primary btn-block mt-2" onClick={addToCart}>Add to cart</button>
              </>
            )}
            {l.whatsapp && (
              <a className="btn btn-wa btn-block mt-1" href={waLink(l.whatsapp, waText)} target="_blank" rel="noreferrer">
                Order on WhatsApp
              </a>
            )}
            <p className="hint center mt-1" style={{ color: 'var(--muted)', fontSize: '.78rem' }}>
              Cash on delivery available at checkout
            </p>
          </div>

          <div className="card card-pad mt-2">
            <div className="row">
              <div className="avatar">
                {l.vendor_logo ? <img src={l.vendor_logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} /> : (l.business_name || '?')[0]}
              </div>
              <div className="grow">
                <strong style={{ color: 'var(--ink)' }}>{l.business_name}</strong>
                <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                  {Number(l.rating_avg) > 0 ? `★ ${Number(l.rating_avg).toFixed(1)} (${l.rating_count})` : 'No ratings yet'} · {l.vendor_city}
                </div>
              </div>
            </div>
            <Badge tone="green">✓ Admin verified</Badge>
            <Link to={`/store/${l.vendor_slug}`} className="btn btn-outline btn-block mt-2">Visit store</Link>
            <Link to={`/support?vendor=${l.vendor_id}&listing=${l.id}`} className="btn btn-ghost btn-sm btn-block mt-1">Report this listing</Link>
          </div>

          <Alert kind="info">
            <strong>Stay safe:</strong> inspect goods before paying on delivery. Never send money for
            cosmetics or medicine — those are banned here.
          </Alert>
        </div>
      </div>

      {vendorItems.length > 0 && (
        <div className="mt-4">
          <h2>More from {l.business_name}</h2>
          <div className="grid ld-related-grid">{vendorItems.map((r) => <ListingCard key={r.id} l={r} />)}</div>
        </div>
      )}

      {related.length > 0 && (
        <div className="mt-4">
          <h2>Recommended for you</h2>
          <div className="grid ld-related-grid">{related.map((r) => <ListingCard key={r.id} l={r} />)}</div>
        </div>
      )}

      {lightboxOpen && images.length > 0 && (
        <div className="ld-lightbox-backdrop" onClick={closeLightbox}>
          <button type="button" className="ld-lightbox-close" onClick={closeLightbox} aria-label="Close">✕</button>
          {images.length > 1 && (
            <button
              type="button"
              className="ld-lightbox-nav prev"
              onClick={(e) => { e.stopPropagation(); prevImg(); setZoomed(false); }}
              aria-label="Previous photo"
            >‹</button>
          )}
          <div
            className="ld-lightbox-stage"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <img
              src={images[active]}
              alt={`${l.title} ${active + 1}`}
              className={`ld-lightbox-img${zoomed ? ' zoomed' : ''}`}
              onClick={() => setZoomed((z) => !z)}
            />
          </div>
          {images.length > 1 && (
            <button
              type="button"
              className="ld-lightbox-nav next"
              onClick={(e) => { e.stopPropagation(); nextImg(); setZoomed(false); }}
              aria-label="Next photo"
            >›</button>
          )}
          {images.length > 1 && <div className="ld-lightbox-counter">{active + 1} / {images.length}</div>}
        </div>
      )}
    </div>
  );
}
