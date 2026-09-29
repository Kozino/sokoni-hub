// Serves link-preview HTML (Open Graph tags) to crawlers like WhatsApp for /s/:slug.
// Real visitors get the normal SPA via context.next().
//
// Needs a runtime env var on Netlify: API_URL=https://<your-api>.onrender.com
// Read via Netlify.env.get(), the same global social-preview.ts uses — Deno.env.get()
// does not see variables scoped to Edge Functions on Netlify's runtime, so a build
// using it will always fall through to context.next() as if API_URL were unset.

const CRAWLER_RE =
  /(whatsapp|facebookexternalhit|facebot|twitterbot|telegrambot|slackbot|linkedinbot|discordbot|skypeuripreview|googlebot|bingbot|applebot|pinterest)/i;

const SITE_NAME = "Sokoni Hub";
const FETCH_TIMEOUT_MS = 5000;

type Ctx = { next: () => Promise<Response> };

declare const Netlify: { env: { get(key: string): string | undefined } };

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}

export default async (request: Request, context: Ctx): Promise<Response> => {
  const ua = request.headers.get("user-agent") ?? "";
  if (!CRAWLER_RE.test(ua)) return context.next();

  const url = new URL(request.url);
  const slug = url.pathname.split("/").filter(Boolean)[1]; // /s/<slug>
  if (!slug || !/^[a-z0-9-]{1,80}$/i.test(slug)) return context.next();

  const apiBase = (Netlify.env.get("API_URL") ?? "").replace(/\/$/, "");
  if (!apiBase) return context.next();

  try {
    const res = await fetch(`${apiBase}/api/vendors/${encodeURIComponent(slug)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return context.next();

    const body = await res.json();
    // Confirmed against vendors.ts: GET /api/vendors/:slug returns
    // { vendor: { business_name, description, city, logo_url, ... }, listings, reviews }.
    const v = body.vendor ?? body;
    const name: string = v.business_name ?? "Store";
    const about: string = v.description ?? "";
    const city: string = v.city ?? "";
    const logo: string = v.logo_url ?? "";

    const title = truncate(`${name} on ${SITE_NAME}`, 60);
    const description = truncate(
      about || `Browse ${name} and place your order on ${SITE_NAME}.`,
      115
    ) + (city ? ` (${city})` : "");

    const image = /^https?:\/\//i.test(logo) ? logo : `${url.origin}/og-default.png`;
    const canonical = `${url.origin}/s/${slug}`;

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
</head>
<body><a href="${esc(canonical)}">${esc(title)}</a></body>
</html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  } catch {
    // API asleep/slow or unreachable: fall back to the generic SPA page.
    return context.next();
  }
};

export const config = { path: "/s/*" };
