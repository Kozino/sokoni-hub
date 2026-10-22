export const money = (n: number | string | null | undefined) => `QAR ${Number(n || 0).toFixed(2)}`;

export const dateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

const LABELS: Record<string, string> = {
  dispatched: 'Waiting for a driver',
  dispatched_to_driver: 'Heading to pickup',
  driver_arrived: 'At pickup',
  out_for_delivery: 'On the way',
  delivered_pending_verification: 'Awaiting buyer confirmation',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const statusLabel = (s: string) => LABELS[s] ?? s.replace(/_/g, ' ');

export const errorText = (e: unknown) =>
  e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.';

export const mapsLink = (address: string) => `https://maps.google.com/?q=${encodeURIComponent(address)}`;

// Turn-by-turn directions to an exact point (the store's map pin), which is more
// precise than an address search.
export const mapsPointLink = (lat: number | string, lng: number | string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${Number(lat)},${Number(lng)}&travelmode=driving`;
