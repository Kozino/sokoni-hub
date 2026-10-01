import type { Config } from 'https://edge.netlify.com';

/**
 * /sitemap.xml
 *
 * Dynamically generates the sitemap from live Sokoni Hub data.
 */

const SITE = 'https://sokonihub.qa';

const STATIC: Array<[string, string, string]> = [
  ['/', 'daily', '1.0'],
  ['/browse', 'daily', '0.9'],
  ['/browse?kind=service', 'daily', '0.8'],
  ['/vendors', 'daily', '0.8'],
  ['/sell', 'monthly', '0.7'],
  ['/support', 'monthly', '0.4'],
  ['/faq', 'monthly', '0.3'],
  ['/terms', 'yearly', '0.2'],
  ['/privacy', 'yearly', '0.2'],
  ['/cookies', 'yearly', '0.2'],
  ['/prohibited', 'yearly', '0.3'],
];

const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const urlEntry = (
  loc: string,
  opts: {
    lastmod?: string;
    freq?: string;
    pri?: string;
  } = {}
) =>
  `  <url>\n    <loc>${esc(loc)}</loc>\n` +
  (opts.lastmod
    ? `    <lastmod>${opts.lastmod.slice(0, 10)}</lastmod>\n`
    : '') +
  (opts.freq
    ? `    <changefreq>${opts.freq}</changefreq>\n`
    : '') +
  (opts.pri
    ? `    <priority>${opts.pri}</priority>\n`
    : '') +
  '  </url>';

export default async () => {
  const parts = STATIC.map(([path, freq, priority]) =>
    urlEntry(SITE + path, {
      freq,
      pri: priority,
    })
  );

  const api = Netlify.env.get('API_URL');

  if (api) {
    try {
      const signal = AbortSignal.timeout(4000);

      // Listings
      const listingsResponse = await fetch(
        `${api}/api/listings?limit=500&sort=newest`,
        { signal }
      );

      if (listingsResponse.ok) {
        const data = await listingsResponse.json();

        for (const listing of data.listings ?? []) {
          if (!listing.id) continue;

          parts.push(
            urlEntry(`${SITE}/listing/${listing.id}`, {
              lastmod:
                listing.updated_at ||
                listing.created_at,
              freq: 'weekly',
              pri: '0.7',
            })
          );
        }
      }

      // Vendors / Stores
      const vendorsResponse = await fetch(
        `${api}/api/vendors?limit=200`,
        { signal }
      );

      if (vendorsResponse.ok) {
        const data = await vendorsResponse.json();

        for (const vendor of data.vendors ?? []) {
          if (!vendor.slug) continue;

          parts.push(
            urlEntry(`${SITE}/store/${vendor.slug}`, {
              lastmod: vendor.updated_at || vendor.created_at,
              freq: 'weekly',
              pri: '0.6',
            })
          );
        }
      }
    } catch {
      // If the API is unavailable, return the static URLs.
    }
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${parts.join('\n')}\n` +
    `</urlset>\n`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};

export const config: Config = {
  path: '/sitemap.xml',
};
