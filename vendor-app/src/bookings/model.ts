/** Service booking shapes and status rules for the vendor app. Mirrors the API's transition table. */

export type Booking = {
  id: string;
  status: 'new' | 'contacted' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  listing_title: string;
  duration_mins: number;
  contact_name: string;
  contact_phone: string;
  preferred_at?: string | null;
  preferred_note?: string | null;
  slot_starts_at?: string | null;
  slot_ends_at?: string | null;
  scheduled_at?: string | null;
  location_type: 'vendor' | 'home';
  address?: string | null;
  cancel_reason?: string | null;
  vendor_note?: string | null;
  created_at: string;
};

export const BOOKING_FILTERS: { key: string; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: '', label: 'All' },
];

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Declined / cancelled',
  no_show: 'No-show',
};

export const DECLINE_REASONS = ['Not available at that time', 'Outside our service area', 'Cannot offer this service', 'Other'];

/** Forward moves the app offers. The API decides which are allowed and rejects the rest. */
export function bookingSteps(b: Booking): { status: string; label: string; primary?: boolean }[] {
  switch (b.status) {
    case 'new':
      return [
        { status: 'confirmed', label: 'Accept booking', primary: true },
        { status: 'contacted', label: 'Mark contacted' },
      ];
    case 'contacted':
      return [{ status: 'confirmed', label: 'Confirm booking', primary: true }];
    case 'confirmed':
      return [
        { status: 'completed', label: 'Mark completed', primary: true },
        { status: 'no_show', label: 'Customer did not come' },
      ];
    default:
      return [];
  }
}

export function canDecline(b: Booking): boolean {
  return b.status === 'new' || b.status === 'contacted' || b.status === 'confirmed';
}

export function when(b: Booking): string {
  const at = b.slot_starts_at || b.scheduled_at || b.preferred_at;
  if (!at) return 'No time agreed yet';
  const d = new Date(at);
  return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Qatar' });
}
