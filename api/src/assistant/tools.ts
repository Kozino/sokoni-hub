import { z } from 'zod';
import { one, query } from '../db';
import { publicListingColumns } from '../security';
import { HttpError } from '../utils';
import { searchCatalog, toAgentCard } from '../catalogSearch';
import { quoteBuyerCart } from '../quoteCart';

export const TOOL_NAMES = ['search_listings', 'get_listing', 'quote_cart', 'get_offers', 'track_order', 'list_my_orders'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const OPENAI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_listings',
      description: 'Search live Sokoni Hub listings. Always use this instead of inventing products. kind=product for African foodstuffs, kind=service for bookings.',
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          kind: { type: 'string', enum: ['product', 'service', ''] },
          max_price: { type: 'number' },
          city: { type: 'string' },
          in_stock: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_listing',
      description: 'Fetch one public listing by id, including size options and stock.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'quote_cart',
      description: 'Server-priced quote for the current cart. The only source of totals, delivery fees and offers.',
      parameters: {
        type: 'object',
        properties: {
          fulfilment_mode: { type: 'string', enum: ['pickup', 'delivery'] },
          promo_code: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_offers',
      description: 'List currently available platform offers. Never invent a promo code.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'track_order',
      description: 'Look up an order. Requires the order code AND the checkout phone the buyer just typed. Do not guess a phone number.',
      parameters: {
        type: 'object',
        properties: { code: { type: 'string' }, phone: { type: 'string' } },
        required: ['code', 'phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_my_orders',
      description: 'Signed-in buyer order list. Empty if the user is a guest.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

export type CartLine = { listing_id: string; qty: number; option?: string };
export type ToolCtx = {
  userId?: string | null;
  city?: string;
  cart: CartLine[];
  fulfilment_mode: 'pickup' | 'delivery';
};

const uuid = z.string().uuid();

function truncateUntrusted(text: string, max = 400) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}

export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolCtx): Promise<unknown> {
  if (!(TOOL_NAMES as readonly string[]).includes(name)) throw new HttpError(400, 'Unknown tool');
  switch (name as ToolName) {
    case 'search_listings': {
      const q = String(args.q || '').slice(0, 120);
      const kind = args.kind === 'service' || args.kind === 'product' ? args.kind : '';
      const max = typeof args.max_price === 'number' && args.max_price > 0 ? args.max_price : null;
      const city = String(args.city || ctx.city || '').slice(0, 60);
      const result = await searchCatalog({
        q, kind, city, max, sort: q ? 'popular' : 'newest', limit: 8, inStock: args.in_stock !== false,
      });
      return {
        total: result.total,
        listings: result.listings.map((row) => ({
          ...toAgentCard(row),
          description: truncateUntrusted(row.description || ''),
        })),
      };
    }
    case 'get_listing': {
      const id = uuid.parse(String(args.id || ''));
      const row = await one<any>(
        `select ${publicListingColumns()}, c.name as category_name, c.slug as category_slug,
                v.business_name, v.slug as vendor_slug, v.city as vendor_city, v.whatsapp
           from listings l
           join vendors v on v.id = l.vendor_id
           join categories c on c.id = l.category_id
          where l.id = $1 and l.status = 'active' and v.status = 'verified' and c.is_banned = false`,
        [id],
      );
      if (!row) return { error: 'Listing not found' };
      return { ...toAgentCard(row), description: truncateUntrusted(row.description || '') };
    }
    case 'quote_cart': {
      if (!ctx.cart.length) return { empty: true };
      const mode = args.fulfilment_mode === 'pickup' || args.fulfilment_mode === 'delivery' ? args.fulfilment_mode : ctx.fulfilment_mode;
      try {
        return await quoteBuyerCart(ctx.cart, {
          fulfilment_mode: mode,
          offers: true,
          promo_code: args.promo_code ? String(args.promo_code).slice(0, 40) : undefined,
          userId: ctx.userId ?? null,
        });
      } catch (e) {
        return { error: e instanceof HttpError ? e.message : 'Could not price this cart' };
      }
    }
    case 'get_offers': {
      const rows = await query<any>(
        `select id, title, code, kind, description from offers
          where is_active and show_in_app and starts_at <= now() and ends_at > now()
          order by priority desc, ends_at asc limit 12`,
      ).catch(() => []);
      return { offers: rows.map((o) => ({ id: o.id, title: o.title, code: o.code || null, kind: o.kind, description: o.description || null })) };
    }
    case 'track_order': {
      const code = String(args.code || '').trim().slice(0, 40);
      const phone = String(args.phone || '').replace(/\D/g, '').slice(0, 20);
      if (code.length < 3 || phone.length < 7) return { error: 'Need the order code and the phone used at checkout' };
      const order = await one<any>(
        `select o.code, o.status, o.total, o.currency, o.fulfilment_mode, v.business_name, o.created_at
           from orders o join vendors v on v.id = o.vendor_id
          where o.code = $1 and regexp_replace(o.contact_phone,'\\D','','g') = $2`,
        [code, phone],
      );
      if (!order) return { error: 'No order found with that code and phone number' };
      return {
        code: order.code,
        status: order.status,
        total: Number(order.total),
        currency: order.currency,
        fulfilment_mode: order.fulfilment_mode,
        business_name: order.business_name,
      };
    }
    case 'list_my_orders': {
      if (!ctx.userId) return { error: 'Sign in to see your orders', guest: true };
      const rows = await query<any>(
        `select o.code, o.status, o.total, o.currency, o.created_at, v.business_name
           from orders o join vendors v on v.id = o.vendor_id
          where o.buyer_id = $1
          order by o.created_at desc limit 8`,
        [ctx.userId],
      );
      return { orders: rows };
    }
    default:
      throw new HttpError(400, 'Unknown tool');
  }
}

export function listingIdsFromToolResult(result: unknown): string[] {
  const ids: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string' && uuid.safeParse(value).success) ids.push(value);
  };
  if (result && typeof result === 'object') {
    const r = result as any;
    if (Array.isArray(r.listings)) r.listings.forEach((l: any) => push(l?.id));
    push(r.id);
  }
  return Array.from(new Set(ids));
}
