
import type { Config, Context } from 'https://edge.netlify.com';

/**
 * Per-page SEO + social previews for Sokoni Hub.
 *
 * This edge function gives each listing and store its own:
 *
 * - <title>
 * - meta description
 * - canonical URL
 * - Open Graph metadata
 * - Twitter metadata
 * - JSON-LD structured data
 *
 * This is important because Sokoni Hub is a JavaScript SPA.
 * Social crawlers and some search crawlers need the metadata in the
 * HTML response itself rather than waiting for React to execute.
 */

export const BOTS =
  /facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Googlebot|bingbot|Applebot|redditbot|Pinterest|SkypeUriPreview|vkShare|W3C_Validator/i;

/**
 * IMPORTANT:
 * Sokoni Hub's live/public domain.
 */
const SITE = 'https://sokonihub.qa';

/**
 * Escapes a value for use inside a double-quoted HTML attribute.
 */
const attr = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Collapses a description to something search engines and preview cards
 * can actually display.
 */
const clamp = (s: string | null | undefined, n = 200) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
};

export interface Meta {
  title: string;
  description: string;
  image: string;
  url: string;
  type: 'product' | 'website';
  jsonLd?: unknown;
}

/**
 * Replaces metadata already present in index.html.
 *
 * We replace rather than append so crawlers don't have to choose between
 * multiple og:title / description / canonical tags.
 */
export function inject(html: string, m: Meta): string {
  const swap = (pattern: RegExp, replacement: string) => {
    html = html.replace(pattern, replacement);
  };

  /*
   * Basic SEO
   */
  swap(
    /<title>[\s\S]*?<\/title>/,
    `<title>${attr(m.title)}</title>`
  );

  swap(
    /<meta name="description"[^>]*>/,
    `<meta name="description" content="${attr(m.description)}" />`
  );

  swap(
    /<link rel="canonical"[^>]*>/,
    `<link rel="canonical" href="${attr(m.url)}" />`
  );

  /*
   * Open Graph
   */
  for (const [prop, val] of [
    ['og:type', m.type === 'product' ? 'product' : 'website'],
    ['og:url', m.url],
    ['og:title', m.title],
    ['og:description', m.description],
    ['og:image', m.image],
  ] as const) {
    swap(
      new RegExp(`<meta property="${prop}"[^>]*>`),
      `<meta property="${prop}" content="${attr(val)}" />`
    );
  }

  /*
   * Listing images are usually not 1200x630.
   * Only keep the dimension hints for the default OG image.
   */
  if (m.image !== `${SITE}/og-image.png`) {
    swap(/<meta property="og:image:width"[^>]*>/, '');
    swap(/<meta property="og:image:height"[^>]*>/, '');
  }

  /*
   * Twitter
   */
  for (const [name, val] of [
    ['twitter:title', m.title],
    ['twitter:description', m.description],
    ['twitter:image', m.image],
  ] as const) {
    swap(
      new RegExp(`<meta name="${name}"[^>]*>`),
      `<meta name="${name}" content="${attr(val)}" />`
    );
  }

  /*
   * JSON-LD structured data
   */
  if (m.jsonLd) {
    /*
     * JSON.stringify does not escape '<'.
     *
     * Escaping it prevents a vendor-controlled value such as
     * </script> from terminating the script block.
     */
    const jsonLd = JSON.stringify(m.jsonLd).replace(/</g, '\\u003c');

    html = html.replace(
      '</head>',
      `<script type="application/ld+json">${jsonLd}</script></head>`
    );
  }

  return html;
}

export default async (request: Request, context: Context) => {
  const ua = request.headers.get('user-agent') ?? '';

  /*
   * Humans receive the normal React SPA.
   * Crawlers receive the SEO-enhanced HTML.
   */
  if (!BOTS.test(ua)) return;

  /*
   * Your backend API URL should be configured in Netlify environment
   * variables as API_URL.
   */
  const api = Netlify.env.get('API_URL');

  if (!api) return;

  const url = new URL(request.url);

  /*
   * Supported SEO routes:
   *
   * /listing/:id
   * /store/:slug
   */
  const listing = url.pathname.match(/^\/listing\/([^/]+)$/);
  const store = url.pathname.match(/^\/store\/([^/]+)$/);

  if (!listing && !store) return;

  let meta: Meta | null = null;

  try {
    /*
     * Do not allow the crawler to wait indefinitely for the API.
     */
    const signal = AbortSignal.timeout(2500);

    /*
     * ============================================================
     * LISTING / PRODUCT SEO
     * ============================================================
     */
    if (listing) {
      const listingId = decodeURIComponent(listing[1]);

      const r = await fetch(
        `${api}/api/listings/${encodeURIComponent(listingId)}`,
        { signal }
      );

      if (!r.ok) return;

      const data = await r.json();
      const l = data.listing;

      if (!l) return;

      const price = `${l.currency ?? 'QAR'} ${Number(l.price).toFixed(2)}`;

      const img =
        Array.isArray(l.images) && l.images[0]
          ? l.images[0]
          : `${SITE}/og-image.png`;

      const listingUrl = `${SITE}/listing/${encodeURIComponent(l.id)}`;

      const title =
        `${l.title} — ${price} · ${l.business_name ?? 'Sokoni Hub'}`;

      const description =
        clamp(l.description) ||
        `${l.title} from ${
          l.business_name ?? 'a verified store'
        } in ${l.vendor_city ?? 'Qatar'}.`;

      meta = {
        title,
        description,
        image: img,
        url: listingUrl,
        type: 'product',

        jsonLd: {
          '@context': 'https://schema.org',

          '@type':
            l.kind === 'service'
              ? 'Service'
              : 'Product',

          name: l.title,

          description:
            clamp(l.description, 400) || undefined,

          image: img,

          url: listingUrl,

          ...(l.kind === 'service'
            ? {}
            : {
                offers: {
                  '@type': 'Offer',

                  price: Number(l.price),

                  priceCurrency:
                    l.currency ?? 'QAR',

                  availability:
                    (l.quantity ?? 0) > 0
                      ? 'https://schema.org/InStock'
                      : 'https://schema.org/OutOfStock',

                  url: listingUrl,
                },
              }),

          /*
           * Only include ratings when the database actually has reviews.
           */
          ...(Number(l.rating_count) > 0
            ? {
                aggregateRating: {
                  '@type': 'AggregateRating',

                  ratingValue:
                    Number(l.rating_avg),

                  reviewCount:
                    Number(l.rating_count),
                },
              }
            : {}),

          brand: {
            '@type': 'Brand',

            name:
              l.business_name ??
              'Sokoni Hub',
          },
        },
      };
    }

    /*
     * ============================================================
     * STORE SEO
     * ============================================================
     */
    else if (store) {
      const storeSlug = decodeURIComponent(store[1]);

      const r = await fetch(
        `${api}/api/vendors/${encodeURIComponent(storeSlug)}`,
        { signal }
      );

      if (!r.ok) return;

      const data = await r.json();
      const v = data.vendor;

      if (!v) return;

      const storeUrl =
        `${SITE}/store/${encodeURIComponent(v.slug ?? storeSlug)}`;

      const title =
        `${v.business_name} — Verified Store in ${
          v.city ?? 'Qatar'
        } | Sokoni Hub`;

      const description =
        clamp(v.description) ||
        `Discover ${v.business_name} on Sokoni Hub. Browse products and services from this verified store in ${
          v.city ?? 'Qatar'
        }.`;

      const image =
        v.logo_url ||
        `${SITE}/og-image.png`;

      meta = {
        title,

        description,

        image,

        url: storeUrl,

        type: 'website',

        jsonLd: {
          '@context': 'https://schema.org',

          '@type': 'Store',

          '@id': `${storeUrl}#store`,

          name: v.business_name,

          description:
            clamp(v.description, 400) ||
            undefined,

          image,

          url: storeUrl,

          address: {
            '@type': 'PostalAddress',

            addressLocality:
              v.city || undefined,

            addressCountry:
              v.country || 'Qatar',
          },

          ...(Number(v.rating_count) > 0
            ? {
                aggregateRating: {
                  '@type': 'AggregateRating',

                  ratingValue:
                    Number(v.rating_avg),

                  reviewCount:
                    Number(v.rating_count),
                },
              }
            : {}),
        },
      };
    }
  } catch {
    /*
     * If the API fails, let the normal SPA response through.
     * Never break the actual website just because SEO metadata failed.
     */
    return;
  }

  if (!meta) return;

  /*
   * Get the normal Vite/React HTML from Netlify.
   */
  const res = await context.next();

  const type =
    res.headers.get('content-type') ?? '';

  if (!type.includes('text/html')) {
    return res;
  }

  /*
   * Inject the store/listing-specific SEO into the HTML.
   */
  const html = inject(
    await res.text(),
    meta
  );

  return new Response(html, {
    status: res.status,

    headers: {
      ...Object.fromEntries(res.headers),

      'content-type':
        'text/html; charset=utf-8',
    },
  });
};

export const config: Config = {
  path: [
    '/listing/*',
    '/store/*',
  ],

  cache: 'manual',
};
