import type { Config, Context } from 'https://edge.netlify.com';

/**
 * Per-page social previews for a JavaScript SPA.
 *
 * WhatsApp, Facebook, X, LinkedIn, Slack and Telegram scrapers do not execute
 * JavaScript. For a Vite build that means every URL on the site — every
 * listing, every store — shares the one set of tags in index.html, so a vendor
 * sharing a link to their product in a WhatsApp group gets a generic card, or
 * with no tags at all, a naked blue URL.
 *
 * Setting <head> from React does not fix it, because the scraper never runs
 * React. The tags have to exist in the HTML that comes off the wire, which
 * means doing it at the edge.
 *
 * Deliberately narrow:
 *
 *   - Only crawlers are rewritten. A real visitor gets the untouched SPA and
 *     pays nothing for this, and there is no risk of showing humans a
 *     server-rendered page that disagrees with the client.
 *   - Any failure — no API URL, network error, unknown id — falls through to
 *     the original response. A broken preview is a bad day; a broken product
 *     page is a worse one.
 */

export const BOTS = /facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Googlebot|bingbot|Applebot|redditbot|Pinterest|SkypeUriPreview|vkShare|W3C_Validator/i;

const SITE = 'https://sokonihub.com';

/** Escapes a value for use inside a double-quoted HTML attribute. */
const attr = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Collapses a description to something a preview card can actually show. */
const clamp = (s: string | null | undefined, n = 200) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
};

export interface Meta {
  title: string; description: string; image: string; url: string;
  type: 'product' | 'website'; jsonLd?: unknown;
}

/**
 * Replaces the tags index.html already ships rather than appending new ones.
 * Appending leaves two og:title elements and scrapers differ on which wins.
 */
export function inject(html: string, m: Meta): string {
  const swap = (pattern: RegExp, replacement: string) => {
    html = html.replace(pattern, replacement);
  };

  swap(/<title>[\s\S]*?<\/title>/, `<title>${attr(m.title)}</title>`);
  swap(/<meta name="description"[^>]*>/, `<meta name="description" content="${attr(m.description)}" />`);
  swap(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${attr(m.url)}" />`);

  for (const [prop, val] of [
    ['og:type', m.type === 'product' ? 'product' : 'website'],
    ['og:url', m.url],
    ['og:title', m.title],
    ['og:description', m.description],
    ['og:image', m.image],
  ] as const) {
    swap(new RegExp(`<meta property="${prop}"[^>]*>`), `<meta property="${prop}" content="${attr(val)}" />`);
  }
  // A listing photo is not 1200x630; stating the wrong size is worse than
  // stating none, so the dimension hints are dropped for those.
  if (m.image !== `${SITE}/og-image.png`) {
    swap(/<meta property="og:image:width"[^>]*>/, '');
    swap(/<meta property="og:image:height"[^>]*>/, '');
  }
  for (const [name, val] of [
    ['twitter:title', m.title],
    ['twitter:description', m.description],
    ['twitter:image', m.image],
  ] as const) {
    swap(new RegExp(`<meta name="${name}"[^>]*>`), `<meta name="${name}" content="${attr(val)}" />`);
  }

  if (m.jsonLd) {
    html = html.replace('</head>',
      `<script type="application/ld+json">${JSON.stringify(m.jsonLd)}</script></head>`);
  }
  return html;
}

export default async (request: Request, context: Context) => {
  const ua = request.headers.get('user-agent') ?? '';
  if (!BOTS.test(ua)) return;                       // humans: untouched SPA

  const api = Netlify.env.get('API_URL');
  if (!api) return;                                  // not configured: no-op

  const url = new URL(request.url);
  const listing = url.pathname.match(/^\/listing\/([^/]+)$/);
  const store = url.pathname.match(/^\/store\/([^/]+)$/);
  if (!listing && !store) return;

  let meta: Meta | null = null;

  try {
    // A scraper that waits is a scraper that gives up and shows nothing.
    const signal = AbortSignal.timeout(2500);

    if (listing) {
      const r = await fetch(`${api}/api/listings/${listing[1]}`, { signal });
      if (!r.ok) return;
      const l = (await r.json()).listing;
      if (!l) return;

      const price = `${l.currency ?? 'QAR'} ${Number(l.price).toFixed(2)}`;
      const img = Array.isArray(l.images) && l.images[0] ? l.images[0] : `${SITE}/og-image.png`;
      meta = {
        title: `${l.title} — ${price} · ${l.business_name ?? 'Sokoni Hub'}`,
        description: clamp(l.description) ||
          `${l.title} from ${l.business_name ?? 'a verified store'} in ${l.vendor_city ?? 'Qatar'}.`,
        image: img,
        url: `${SITE}/listing/${l.id}`,
        type: 'product',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': l.kind === 'service' ? 'Service' : 'Product',
          name: l.title,
          description: clamp(l.description, 400) || undefined,
          image: img,
          ...(l.kind === 'service' ? {} : {
            offers: {
              '@type': 'Offer',
              price: Number(l.price),
              priceCurrency: l.currency ?? 'QAR',
              availability: (l.quantity ?? 0) > 0
                ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
              url: `${SITE}/listing/${l.id}`,
            },
          }),
          // Only emitted when real: fabricating an aggregateRating is both a
          // Google penalty and a lie to the buyer.
          ...(Number(l.rating_count) > 0 ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: Number(l.rating_avg),
              reviewCount: Number(l.rating_count),
            },
          } : {}),
          brand: { '@type': 'Brand', name: l.business_name ?? 'Sokoni Hub' },
        },
      };
    } else if (store) {
      const r = await fetch(`${api}/api/vendors/${store[1]}`, { signal });
      if (!r.ok) return;
      const v = (await r.json()).vendor;
      if (!v) return;

      meta = {
        title: `${v.business_name} — verified store in ${v.city ?? 'Qatar'} · Sokoni Hub`,
        description: clamp(v.description) ||
          `${v.business_name} sells on Sokoni Hub. Verified store in ${v.city ?? 'Qatar'}.`,
        image: v.logo_url || `${SITE}/og-image.png`,
        url: `${SITE}/store/${v.slug}`,
        type: 'website',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Store',
          name: v.business_name,
          description: clamp(v.description, 400) || undefined,
          image: v.logo_url || undefined,
          address: { '@type': 'PostalAddress', addressLocality: v.city, addressCountry: v.country },
          ...(Number(v.rating_count) > 0 ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: Number(v.rating_avg),
              reviewCount: Number(v.rating_count),
            },
          } : {}),
        },
      };
    }
  } catch {
    return;                                          // any failure: pass through
  }

  if (!meta) return;

  const res = await context.next();
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('text/html')) return res;

  const html = inject(await res.text(), meta);
  return new Response(html, {
    status: res.status,
    headers: { ...Object.fromEntries(res.headers), 'content-type': 'text/html; charset=utf-8' },
  });
};

export const config: Config = {
  path: ['/listing/*', '/store/*'],
  cache: 'manual',
};
