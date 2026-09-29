// Remembers which vendor's shared link/QR brought the buyer here, so checkout
// can tag that vendor's order with its source. Last touch wins; expires in 7 days.

const KEY = "sokoni:attribution";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_REFS = ["vendor-share", "qr"] as const;

export type AttributionRef = (typeof ALLOWED_REFS)[number];
export type Attribution = { ref: AttributionRef; vendorSlug: string };

export function captureAttribution(vendorSlug: string, ref: string | null): void {
  if (!vendorSlug || !ref || !(ALLOWED_REFS as readonly string[]).includes(ref)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ref, vendorSlug, ts: Date.now() }));
  } catch {
    /* storage unavailable (private mode etc.): attribution is best-effort */
  }
}

export function getAttribution(): Attribution | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const data = JSON.parse(raw);
    if (!data?.ts || Date.now() - data.ts > TTL_MS) {
      localStorage.removeItem(KEY);
      return undefined;
    }
    return { ref: data.ref, vendorSlug: data.vendorSlug };
  } catch {
    return undefined;
  }
}

export function clearAttribution(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
