/**
 * African-foodstuff and everyday-service synonyms so search and the assistant
 * understand how buyers in Qatar actually speak (English, Kiswahili, Luganda, Twi).
 * Matching is case-insensitive. Multi-word phrases are applied before single tokens.
 */

const GROUPS: string[][] = [
  ['rice', 'mchele', 'omo tuo', 'omotuo', 'basmati', 'jollof', 'jollof rice', 'waakye', 'fried rice'],
  ['garri', 'gari', 'eba', 'cassava flakes'],
  ['fufu', 'foufou', 'pounded yam', 'iyan', 'banku', 'kenkey', 'akple'],
  ['yam', 'yams', 'puna yam', 'white yam', 'elubo', 'yam flour'],
  ['plantain', 'plantains', 'matoke', 'gonja', 'dodo', 'kelewele'],
  ['cassava', 'muhogo', 'yuca', 'cassava flour', 'fufu flour', 'plantain flour'],
  ['beans', 'kunde', 'black eye', 'black-eyed', 'honey beans', 'ewa', 'waakye beans', 'beans flour'],
  ['palm oil', 'zomi', 'red oil', 'red palm oil', 'ngo', 'palm nut', 'banga', 'abe'],
  ['egusi', 'melon seed', 'melon seeds'],
  ['ogbono', 'ogbono seed'],
  ['stockfish', 'dried fish', 'panla', 'okporoko', 'okporoko stockfish'],
  ['crayfish', 'dried crayfish', 'ground crayfish'],
  ['maggi', 'knorr', 'cube', 'cubes', 'seasoning', 'seasoning cube'],
  ['suya', 'kilishi', 'tsire'],
  ['goat', 'goat meat', 'nyama ya mbuzi', 'chevon', 'mbuzi'],
  ['beef', 'nyama', 'nkadwe', 'cow meat'],
  ['chicken', 'kuku', 'nkoko', 'frozen chicken'],
  ['turkey', 'frozen turkey'],
  ['tilapia', 'ngege', 'croaker', 'frozen fish'],
  ['okra', 'okro', 'lady finger', 'nkruma', 'otigo'],
  ['spinach', 'sukuma', 'sukuma wiki', 'contomire', 'ayoyo', 'jute', 'ugu', 'pumpkin leaf', 'bitterleaf', 'onugbu'],
  ['groundnut', 'groundnuts', 'nkate', 'peanut', 'peanuts', 'groundnut paste', 'peanut butter'],
  ['millet', 'wimbi', 'nara'],
  ['sorghum', 'dura'],
  ['maize', 'mahindi', 'corn', 'mealie meal', 'ugali', 'posho', 'nsima', 'sadza', 'maize flour', 'unga', 'ugali flour'],
  ['coconut', 'nazi', 'coconut oil'],
  ['pepper', 'shombo', 'ata', 'scotch bonnet', 'habanero', 'kpakpo shito', 'shito'],
  ['tomato', 'tomato paste', 'tin tomato', 'tomatoes'],
  ['onion', 'onions', 'kitunguu'],
  ['ginger', 'tangawizi'],
  ['garlic'],
  ['chin chin', 'puff puff', 'mandazi', 'koose', 'accra', 'akara', 'bean cake', 'moin moin', 'moi moi'],
  ['semolina', 'semovita', 'wheat', 'golden morn', 'indomie', 'noodles'],
  ['evaporated milk', 'peak milk', 'nido', 'milk powder'],
  ['vegetable oil', 'king oil', 'cooking oil'],
  ['ponmo', 'kpomo', 'cow skin'],
  ['chapati', 'chapatti'],
  ['garden egg', 'eggplant', 'ntrowa'],
  ['hair', 'braids', 'weave', 'wig', 'barber', 'salon', 'makeup', 'nails'],
  ['cleaning', 'cleaner', 'house cleaning'],
  ['tailor', 'sewing', 'alteration', 'alterations'],
  ['photographer', 'photography', 'photo'],
];

const STOP = new Set([
  'i', 'me', 'my', 'a', 'an', 'the', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at', 'with', 'from',
  'please', 'want', 'need', 'get', 'buy', 'find', 'order', 'some', 'any', 'looking',
  'can', 'you', 'we', 'us', 'our', 'this', 'that', 'something', 'stuff',
  'ninaomba', 'nataka', 'tafuta', 'naomba', 'ninahitaji', 'karibu',
  'njagala', 'nonya', 'noonya', 'kuugula',
  'me', 'pɛ', 'hwehwɛ', 'ma', 'me',
  'أريد', 'ابحث', 'أحتاج', 'من', 'في', 'على',
  'qar', 'riyal', 'riyals', 'qatar', 'doha',
]);

const LOOKUP = new Map<string, string[]>();
for (const group of GROUPS) {
  const unique = Array.from(new Set(group.map((s) => s.toLowerCase())));
  for (const term of unique) LOOKUP.set(term, unique);
}

export function normalizeQuery(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '') // Arabic diacritics
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extra ILIKE patterns (including the original tokens) for a buyer query. */
export function expandSearchQuery(raw: string): { q: string; patterns: string[]; tokens: string[] } {
  const q = normalizeQuery(raw);
  if (!q) return { q: '', patterns: [], tokens: [] };

  const extras = new Set<string>();
  // Longer phrases first so "palm oil" wins over "oil".
  const phrases = Array.from(LOOKUP.keys()).filter((k) => k.includes(' ')).sort((a, b) => b.length - a.length);
  let rest = ` ${q} `;
  for (const phrase of phrases) {
    if (rest.includes(` ${phrase} `)) {
      LOOKUP.get(phrase)!.forEach((t) => extras.add(t));
      rest = rest.replace(new RegExp(` ${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `, 'g'), ' ');
    }
  }
  const tokens = rest.trim().split(/\s+/).filter((t) => t && t.length > 1 && !STOP.has(t));
  for (const token of tokens) {
    const group = LOOKUP.get(token);
    if (group) group.forEach((t) => extras.add(t));
    else extras.add(token);
  }
  const patterns = Array.from(extras)
    .filter((t) => t.length >= 2)
    .slice(0, 24)
    .map((t) => `%${t}%`);
  return { q, patterns, tokens: Array.from(extras).slice(0, 24) };
}

export const SYNONYM_GROUPS = GROUPS;
