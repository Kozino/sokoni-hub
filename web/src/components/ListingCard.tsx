import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { Listing } from '../types';
import { priceLabel } from '../lib/format';
import { Badge } from './ui';
import { useT } from '../i18n';
import { useCart } from '../state/CartContext';
import { useToast } from '../state/ToastContext';
import { BookServiceModal } from './BookServiceModal';

interface Props {
  l: Listing;
  /**
   * Show a one-tap action button under the card: "Add to cart" for products,
   * "Book now" for services (opens the booking request; services never touch the cart).
   */
  showAction?: boolean;
}

export default function ListingCard({ l, showAction = false }: Props) {
  const t = useT();
  const { items, add } = useCart();
  const { push } = useToast();
  const [justAdded, setJustAdded] = useState(false);
  const [booking, setBooking] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const img = Array.isArray(l.images) ? l.images[0] : undefined;
  const hasRating = typeof l.rating_avg === 'number' && (l.rating_count ?? 0) > 0;

  const body = (
    <>
      <div className="lcard-img">
        {img ? <img src={img} alt={l.title} loading="lazy" /> : <div className="ph">{l.kind === 'service' ? '💇' : '🛍️'}</div>}
        <span className="lcard-kind">
          <Badge tone={l.kind === 'service' ? 'blue' : 'terra'}>{t(`kind.${l.kind}`)}</Badge>
        </span>
      </div>
      <div className="lcard-body">
        <div className="lcard-title">{l.title}</div>
        <div className="lcard-meta">{l.category_name}</div>
        {hasRating && (
          <div className="lcard-rating">
            <span className="stars">★</span>
            <span className="score">{l.rating_avg!.toFixed(1)}</span>
            <span className="count">({l.rating_count})</span>
          </div>
        )}
        <div className="lcard-price">{priceLabel(l, t)}</div>
        <div className="lcard-foot">
          <span>{l.business_name}</span>
          <span>{l.vendor_city}</span>
        </div>
      </div>
    </>
  );

  // Default card: the whole thing is one link, exactly as before.
  if (!showAction) {
    return <Link to={`/listing/${l.id}`} className="lcard">{body}</Link>;
  }

  // Service: "Book now" opens the booking request. The modal is portalled to
  // <body> because the card clips overflow and lifts on hover (a transform),
  // either of which would break a position:fixed modal rendered inside it.
  if (l.kind === 'service') {
    return (
      <div className="lcard lcard-has-cart">
        <Link to={`/listing/${l.id}`} className="lcard-link">{body}</Link>
        <div className="lcard-actions">
          <button type="button" className="lcard-cart" onClick={() => setBooking(true)} aria-label={`${t('listing.bookNow')}: ${l.title}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
            </svg>
            <span>{t('listing.bookNow')}</span>
          </button>
        </div>
        {booking && createPortal(
          <BookServiceModal
            open
            onClose={() => setBooking(false)}
            listing={{
              id: l.id, title: l.title, price: Number(l.price), currency: l.currency,
              price_type: l.price_type, duration_mins: l.duration_mins,
              business_name: l.business_name, whatsapp: l.whatsapp,
            }}
          />,
          document.body
        )}
      </div>
    );
  }

  // Product with cart button. The button is a sibling of the link (not nested
  // inside it) so the markup stays valid and a tap never triggers navigation.
  const stock = l.quantity ?? 0;
  const outOfStock = stock <= 0;
  const inCart = items.find((i) => i.listing_id === l.id)?.qty ?? 0;

  const addToCart = () => {
    if (outOfStock) return;
    if (inCart >= stock) {
      push(`Only ${stock} in stock — you already have all of them in your cart`, 'info');
      return;
    }
    add({
      listing_id: l.id, title: l.title, price: Number(l.price), currency: l.currency,
      qty: 1, unit: l.unit, image: img, vendor_id: l.vendor_id,
      vendor_name: l.business_name || 'Store', kind: l.kind, max: l.quantity,
    });
    push(`${l.title} added to cart`, 'success');
    setJustAdded(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setJustAdded(false), 1500);
  };

  return (
    <div className="lcard lcard-has-cart">
      <Link to={`/listing/${l.id}`} className="lcard-link">{body}</Link>
      <div className="lcard-actions">
        <button
          type="button"
          className={`lcard-cart${justAdded ? ' added' : ''}`}
          onClick={addToCart}
          disabled={outOfStock}
          aria-label={`${t('listing.addToCart')}: ${l.title}`}
        >
          {justAdded ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="8" cy="21" r="1.4" /><circle cx="19" cy="21" r="1.4" />
              <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
            </svg>
          )}
          <span>{outOfStock ? t('listing.outOfStock') : t('listing.addToCart')}</span>
        </button>
      </div>
    </div>
  );
}
