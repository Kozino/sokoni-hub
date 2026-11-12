/**
 * In-app links: `sokonihub://…` addresses, and the plain paths that offer notifications and banners carry.
 *
 * `resolveLink` is pure (no navigation, no storage), so every link is checked before anything moves. It accepts
 * only places inside this app. Anything with another scheme (https:, javascript:, tel:…) resolves to nothing, so a
 * notification can never send a customer to an outside page.
 *
 *   sokonihub://offers                    the Offers screen
 *   sokonihub://store/oriaku-foods        a store
 *   sokonihub://listing/<id>              a product or service
 *   sokonihub://browse?category=oils      a category (also ?q=search words)
 *   sokonihub://services                  the Services tab
 *   sokonihub://cart?code=WELCOME10       the Cart, with a promo code kept for it
 *   sokonihub://orders  bookings  saved  notifications  support  account  home
 */
import type { Screen } from './nav';

export type LinkTarget = {
  screen: Screen;
  params?: Record<string, any>;
  /** A bottom-tab section: it replaces the stack instead of being pushed on top of Home. */
  tab?: boolean;
  /** A promo code to keep for the Cart. */
  applyCode?: string;
};

const safeDecode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };

function parseQuery(query?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (query ?? '').split('&')) {
    if (!pair) continue;
    const at = pair.indexOf('=');
    const key = safeDecode(at < 0 ? pair : pair.slice(0, at)).trim();
    if (key) out[key] = safeDecode(at < 0 ? '' : pair.slice(at + 1).replace(/\+/g, ' ')).trim();
  }
  return out;
}

export function resolveLink(raw?: string | null): LinkTarget | null {
  let text = String(raw ?? '').trim();
  if (!text) return null;
  // Expo Go and dev builds wrap the path: exp://192.168.1.5:8081/--/store/abc
  const wrapped = text.indexOf('/--/');
  if (wrapped >= 0) text = text.slice(wrapped + 4);
  else if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^sokonihub:\/\//i.test(text)) return null;

  const m = /^(?:sokonihub:\/\/)?\/*([^?#]*)(?:\?([^#]*))?/i.exec(text);
  if (!m) return null;
  const segments = m[1].split('/').filter(Boolean).map(safeDecode);
  const q = parseQuery(m[2]);
  const head = (segments[0] ?? 'home').toLowerCase();
  const slug = segments[1]?.trim();

  switch (head) {
    case 'home': return { screen: 'home', tab: true };
    case 'browse': case 'categories': case 'market':
      return { screen: 'browse', tab: true, params: { ...(q.category ? { category: q.category, kind: 'product' } : {}), ...(q.q ? { q: q.q } : {}) } };
    case 'services': return { screen: 'services', tab: true, ...(q.category ? { params: { category: q.category } } : {}) };
    case 'cart': return { screen: 'cart', tab: true, ...(q.code ? { applyCode: q.code } : {}) };
    case 'account': case 'profile': return { screen: 'account', tab: true };
    case 'offers': case 'coupons': return { screen: 'offers' };
    case 'orders': return { screen: 'orders' };
    case 'bookings': return { screen: 'bookings' };
    case 'saved': return { screen: 'saved' };
    case 'notifications': return { screen: 'notifications' };
    case 'support': case 'help': return { screen: 'support' };
    case 'assistant': case 'ask': return { screen: 'assistant' };
    case 'store': case 'shop': return slug ? { screen: 'store', params: { slug } } : null;
    case 'listing': case 'product': case 'item': return slug ? { screen: 'listing', params: { id: slug } } : null;
    default: return null;
  }
}

/** What a tapped notification carries: an explicit link, or just an order status (then open the orders list). */
export function linkFromNotification(data: unknown): string | null {
  const d = (data ?? {}) as Record<string, unknown>;
  if (typeof d.link === 'string' && d.link) return d.link;
  if (typeof d.status === 'string' && d.status) return 'sokonihub://orders';
  return null;
}
