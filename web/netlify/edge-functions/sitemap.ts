import type { Config } from 'https://edge.netlify.com';

/**
 * /sitemap.xml
 *
 * Generated at the edge from live data rather than committed as a file: a
 * marketplace's URLs are its listings and its stores, and those change daily.
 * A static sitemap would be stale the day after it was written, which is worse
 * than none — it teaches the crawler that the file is not worth re-reading.
 *
 * If the API is unreachable the static routes are still served, so the site
 * always has a valid sitemap even when the backend is down or, on the free
 * Supabase tier, paused.
 */

const SITE = 'https://sokonihub.com';

const STATIC: Array<[string, string, string]> = [
  // path, changefreq, priority
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
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const urlEntry = (loc: string, opts: { lastmod?: string; freq?: string; pri?: string } = {}) =>
  `  <url>\n    <loc>${esc(loc)}</loc>\n` +
  (opts.lastmod ? `    <lastmod>${opts.lastmod.slice(0, 10)}</lastmod>\n` : '') +
  (opts.freq ? `    <changefreq>${opts.freq}</changefreq>\n` : '') +
  (opts.pri ? `    <priority>${opts.pri}</priority>\n` : '') +
  '  </url>';

export default async () => {
  const parts = STATIC.map(([p, freq, pri]) => urlEntry(SITE + p, { freq, pri }));
  const api = Netlify.env.get('API_URL');

  if (api) {
    try {
      const signal = AbortSignal.timeout(4000);
      // Sequential, not Promise.all: this runs at most once per crawl and the
      // backend is a small instance — two parallel bursts buy nothing.
      const lr = await fetch(`${api}/api/listings?limit=500&sort=newest`, { signal });
      if (lr.ok) {
        for (const l of (await lr.json()).listings ?? []) {
          parts.push(urlEntry(`${SITE}/listing/${l.id}`,
            { lastmod: l.updated_at || l.created_at, freq: 'weekly', pri: '0.7' }));
        }
      }
      const vr = await fetch(`${api}/api/vendors?limit=200`, { signal });
      if (vr.ok) {
        for (const v of (await vr.json()).vendors ?? []) {
          parts.push(urlEntry(`${SITE}/store/${v.slug}`,
            { lastmod: v.created_at, freq: 'weekly', pri: '0.6' }));
        }
      }
    } catch {
      // Static routes only. A partial sitemap is still a valid one.
    }
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${parts.join('\n')}\n</urlset>\n`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // Crawlers re-read this often; an hour of cache spares the API.
      'cache-control': 'public, max-age=3600',
    },
  });
};

export const config: Config = { path: '/sitemap.xml' };
