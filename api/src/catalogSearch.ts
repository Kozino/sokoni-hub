import { publicListingColumns } from './security';
import { query } from './db';
import { expandSearchQuery } from './assistant/synonyms';

export type CatalogSearchInput = {
  q?: string;
  kind?: string;
  category?: string;
  city?: string;
  min?: number | null;
  max?: number | null;
  sort?: string;
  limit?: number;
  offset?: number;
  inStock?: boolean;
};

const ORDER_SQL: Record<string, string> = {
  price_asc: 'l.price asc, l.created_at desc',
  price_desc: 'l.price desc, l.created_at desc',
  popular: 'l.views desc, l.created_at desc',
  newest: 'l.created_at desc',
};

/**
 * Public catalogue search. Same filters the mobile app already sends, plus
 * synonym expansion and trigram ranking when the buyer typed something.
 * Prices, stock and banned categories stay under the same SQL guards as before.
 */
export async function searchCatalog(input: CatalogSearchInput) {
  const kind = String(input.kind || '').trim();
  const category = String(input.category || '').trim();
  const city = String(input.city || '').trim();
  const min = input.min == null || Number.isNaN(Number(input.min)) ? null : Number(input.min);
  const max = input.max == null || Number.isNaN(Number(input.max)) ? null : Number(input.max);
  const limit = Math.min(Math.max(Number(input.limit) || 24, 1), 60);
  const offset = Math.max(Number(input.offset) || 0, 0);
  const sort = String(input.sort || 'newest');
  const inStock = !!input.inStock;
  const expanded = expandSearchQuery(input.q || '');
  const q = expanded.q;
  const patterns = expanded.patterns.length ? expanded.patterns : ['%'];
  const relevance = !!q && sort !== 'price_asc' && sort !== 'price_desc';
  const order = relevance
    ? `greatest(similarity(lower(l.title), lower($1)), similarity(lower(coalesce(v.business_name,'')), lower($1))) desc, l.views desc, l.created_at desc`
    : (ORDER_SQL[sort] || ORDER_SQL.newest);

  const where = `
      l.status = 'active' and v.status = 'verified' and c.is_banned = false
      and ($2 = '' or l.kind::text = $2)
      and ($3 = '' or c.slug = $3)
      and ($4 = '' or v.city ilike $4)
      and ($5::numeric is null or l.price >= $5)
      and ($6::numeric is null or l.price <= $6)
      and ($10::boolean is not true or l.kind = 'service' or l.quantity is null or l.quantity > 0)
      and (
        $1 = ''
        or l.title ilike '%'||$1||'%'
        or coalesce(l.description,'') ilike '%'||$1||'%'
        or v.business_name ilike '%'||$1||'%'
        or l.title ilike any($9::text[])
        or coalesce(l.description,'') ilike any($9::text[])
        or v.business_name ilike any($9::text[])
        or similarity(lower(l.title), lower($1)) > 0.22
        or ($1 <> '' and to_tsvector('simple', l.title || ' ' || coalesce(l.description,'')) @@ plainto_tsquery('simple', $1))
      )`;

  const params = [q, kind, category, city, min, max, limit, offset, patterns, inStock];

  const rows = await query<any>(
    `select ${publicListingColumns()}, c.name as category_name, c.slug as category_slug,
            v.business_name, v.slug as vendor_slug, v.city as vendor_city,
            v.country as vendor_country, v.whatsapp,
            v.rating_avg as vendor_rating_avg, v.rating_count as vendor_rating_count
       from listings l
       join vendors v on v.id = l.vendor_id
       join categories c on c.id = l.category_id
      where ${where}
      order by ${order}
      limit $7 offset $8`,
    params,
  );

  const [{ count }] = await query<{ count: number }>(
    `select count(*)::int as count
       from listings l
       join vendors v on v.id = l.vendor_id
       join categories c on c.id = l.category_id
      where ${where}`,
    [q, kind, category, city, min, max, limit, offset, patterns, inStock],
  );

  return { listings: rows, total: count, limit, offset };
}

/** Compact card the assistant may show. Never includes supplier notes. */
export function toAgentCard(row: any) {
  const images = Array.isArray(row.images) ? row.images.filter((u: unknown) => typeof u === 'string').slice(0, 1) : [];
  return {
    id: row.id,
    vendor_id: row.vendor_id,
    kind: row.kind,
    title: row.title,
    price: Number(row.price),
    currency: row.currency || 'QAR',
    quantity: row.quantity == null ? null : Number(row.quantity),
    unit: row.unit || null,
    options: Array.isArray(row.options) ? row.options : [],
    images,
    business_name: row.business_name,
    vendor_slug: row.vendor_slug,
    vendor_city: row.vendor_city || null,
    category_name: row.category_name || null,
    category_slug: row.category_slug || null,
    rating_avg: row.rating_avg == null ? null : Number(row.rating_avg),
    rating_count: row.rating_count == null ? 0 : Number(row.rating_count),
    duration_mins: row.duration_mins == null ? null : Number(row.duration_mins),
    price_type: row.price_type || null,
  };
}
