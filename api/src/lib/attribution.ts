import { z } from 'zod';

export const ORDER_SOURCES = ['marketplace', 'vendor-share', 'qr', 'ai-assistant'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

// Add to checkoutSchema as:  attribution: attributionSchema
export const attributionSchema = z
  .object({
    ref: z.enum(['vendor-share', 'qr']),
    vendorSlug: z.string().min(1).max(80),
  })
  .optional();

export type Attribution = z.infer<typeof attributionSchema>;

// A shared link only credits the vendor whose link was actually used.
// In a multi-vendor cart, every other vendor's order stays "marketplace".
export function resolveOrderSource(attribution: Attribution, vendorSlug: string, channel?: string | null): OrderSource {
  if (attribution && attribution.vendorSlug === vendorSlug) return attribution.ref;
  if (channel === 'ai-assistant') return 'ai-assistant';
  return 'marketplace';
}
