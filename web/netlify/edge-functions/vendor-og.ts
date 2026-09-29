import type { Context } from "@netlify/edge-functions";

const API = Netlify.env.get("API_URL") ?? "https://YOUR-API.onrender.com";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default async (request: Request, context: Context) => {
  const response = await context.next(); // the normal SPA index.html
  if (!(response.headers.get("content-type") || "").includes("text/html")) return response;

  const url = new URL(request.url);
  const slug = url.pathname.split("/")[2];
  if (!slug) return response;

  try {
    const res = await fetch(`${API}/api/vendors/${encodeURIComponent(slug)}`);
    if (!res.ok) return response;
    const data = await res.json();
    const v = data.vendor ?? data;

    // adjust these field names to match your API response
    const name = v.business_name ?? v.name;
    const logo = v.logo_url ?? v.logo;
    const desc = v.description ?? `Shop ${name} on Sokoni Hub`;
    if (!name || !logo) return response;

    let html = await response.text();

    // remove the site-wide tags
    html = html
      .replace(/<meta\s+property="og:(title|description|image|url)"[^>]*>/gi, "")
      .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, "");

    const tags = `
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(name)} | Sokoni Hub" />
    <meta property="og:description" content="${esc(desc.slice(0, 160))}" />
    <meta property="og:image" content="${esc(logo)}" />
    <meta property="og:url" content="${esc(url.origin + url.pathname)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${esc(name)} | Sokoni Hub" />
    <meta name="twitter:image" content="${esc(logo)}" />`;

    html = html.replace("</head>", `${tags}\n</head>`);

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=0, s-maxage=300",
      },
    });
  } catch {
    return response; // on any failure, fall back to the default site tags
  }
};

export const config = { path: "/s/*" };
