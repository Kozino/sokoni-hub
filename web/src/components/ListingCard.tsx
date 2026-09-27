import { Link } from 'react-router-dom';
import type { Listing } from '../types';
import { priceLabel } from '../lib/format';
import { Badge } from './ui';

export default function ListingCard({ l }: { l: Listing }) {
  const img = Array.isArray(l.images) ? l.images[0] : undefined;
  const hasRating = typeof l.rating_avg === 'number' && (l.rating_count ?? 0) > 0;
  return (
    <Link to={`/listing/${l.id}`} className="lcard">
      <div className="lcard-img">
        {img ? <img src={img} alt={l.title} loading="lazy" /> : <div className="ph">{l.kind === 'service' ? '💇' : '🛍️'}</div>}
        <span className="lcard-kind">
          <Badge tone={l.kind === 'service' ? 'blue' : 'terra'}>{l.kind}</Badge>
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
        <div className="lcard-price">{priceLabel(l)}</div>
        <div className="lcard-foot">
          <span>{l.business_name}</span>
          <span>{l.vendor_city}</span>
        </div>
      </div>
    </Link>
  );
}
