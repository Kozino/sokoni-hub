import { normalizeQuery } from './synonyms';

export type Locale = 'en' | 'sw' | 'lg' | 'tw' | 'ar';
export type IntentName =
  | 'greet'
  | 'search'
  | 'add'
  | 'cart'
  | 'quote'
  | 'checkout'
  | 'track'
  | 'orders'
  | 'book'
  | 'offers'
  | 'help'
  | 'delete';

export type ParsedIntent = {
  intent: IntentName;
  locale: Locale;
  qty: number;
  maxPrice: number | null;
  kind: 'product' | 'service' | '';
  query: string;
  addIndex: number | null;
  trackCode: string | null;
  trackPhone: string | null;
};

const LOCALES: Locale[] = ['en', 'sw', 'lg', 'tw', 'ar'];

export function detectLocale(text: string, fallback: string): Locale {
  const raw = String(text || '');
  if (/[\u0600-\u06FF]/.test(raw)) return 'ar';
  const n = normalizeQuery(raw);
  if (/\b(ninaomba|nataka|tafuta|asante|karibu|sawa|bei|kikapu|ninaweza)\b/.test(n)) return 'sw';
  if (/\b(njagala|noonya|webale|ssente|akasawo|ggwe)\b/.test(n)) return 'lg';
  if (/\b(akwaaba|hwehwɛ|hwehwe|medaase|sika|kɛtɛ|wo ho)\b/.test(n)) return 'tw';
  return LOCALES.includes(fallback as Locale) ? (fallback as Locale) : 'en';
}

function has(n: string, words: string[]) {
  return words.some((w) => (w.includes(' ') ? n.includes(w) : new RegExp(`(^|\\s)${w}(\\s|$)`).test(n)));
}

export function parseIntent(message: string, fallbackLocale: string): ParsedIntent {
  const locale = detectLocale(message, fallbackLocale);
  const n = normalizeQuery(message);
  const qtyMatch = n.match(/\b(\d+)\b/);
  const qty = qtyMatch ? Math.min(Math.max(parseInt(qtyMatch[1], 10), 1), 100) : 1;
  const priceMatch = n.match(/\b(?:under|below|max|less than|chini ya|below)\s*(\d+(?:\.\d+)?)\b/) || n.match(/\b(\d+(?:\.\d+)?)\s*(?:qar|riyal|riyals)\b/);
  const maxPrice = priceMatch ? Number(priceMatch[1]) : null;

  const codeMatch = String(message).match(/\b(ORD-[A-F0-9]{8,})\b/i);
  const phoneMatch = String(message).replace(/\s/g, '').match(/(\+?974\d{8}|\d{8,15})/);

  const kind: ParsedIntent['kind'] = has(n, ['service', 'services', 'booking', 'braid', 'braids', 'salon', 'barber', 'cleaning', 'photographer', 'tailor'])
    ? 'service'
    : has(n, ['product', 'food', 'foodstuff', 'foodstuffs', 'grocery', 'groceries'])
      ? 'product'
      : '';

  const addIndexMatch = n.match(/\b(?:first|1st|number 1|the first|#1)\b/) ? 0
    : n.match(/\b(?:second|2nd|#2)\b/) ? 1
      : n.match(/\b(?:third|3rd|#3)\b/) ? 2
        : null;

  let intent: IntentName = 'search';
  if (!n || has(n, ['hi', 'hello', 'hey', 'habari', 'jambo', 'salama', 'akwaaba', 'webale', 'مرحبا', 'اهلا', 'ola'])) intent = 'greet';
  if (has(n, ['help', 'faq', 'how does', 'how do i', 'nisaidie', 'msaada', 'مساعدة'])) intent = 'help';
  if (has(n, ['offer', 'offers', 'promo', 'coupon', 'discount', 'code'])) intent = 'offers';
  if (has(n, ['track', 'where is my order', 'delivery status', 'fuatilia', 'تتبع'])) intent = 'track';
  if (has(n, ['my orders', 'order history', 'maagizo yangu'])) intent = 'orders';
  if (has(n, ['book', 'booking', 'appointment', 'slot'])) intent = 'book';
  if (has(n, ['cart', 'basket', 'kikapu', 'akasawo', 'سلة'])) intent = 'cart';
  if (has(n, ['total', 'quote', 'how much', 'price for my cart', 'bei gani', 'كم السعر'])) intent = 'quote';
  if (has(n, ['checkout', 'place order', 'pay', 'malizia', 'place it', 'review order', 'confirm order'])) intent = 'checkout';
  if (has(n, ['add', 'ongeza', 'gatta', 'fa hye', 'أضف', 'put in cart', 'add to cart'])) intent = 'add';
  if (has(n, ['delete chat', 'clear chat', 'forget this'])) intent = 'delete';

  // "I want palm oil" is search, not greet.
  if (intent === 'greet' && n.split(' ').length > 3) intent = 'search';

  const stripped = n
    .replace(/\b(\d+)\b/g, ' ')
    .replace(/\b(add|ongeza|gatta|please|want|need|find|buy|order|me|some|the|to|cart|kikapu|under|below|qar|riyal)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    intent,
    locale,
    qty,
    maxPrice: maxPrice && maxPrice > 0 ? maxPrice : null,
    kind,
    query: stripped,
    addIndex: addIndexMatch,
    trackCode: codeMatch ? codeMatch[1].toUpperCase() : null,
    trackPhone: phoneMatch && phoneMatch[1].length >= 8 ? phoneMatch[1] : null,
  };
}
