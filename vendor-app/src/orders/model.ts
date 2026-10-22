/** Order shapes, status rules and display helpers for the vendor app. Mirrors the rules the API enforces. */
import { Tone } from '../theme';
import { qar } from '../format';

/** Every status the API can return. The driver stages come after 'dispatched'. */
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'dispatched'
  | 'dispatched_to_driver'
  | 'driver_arrived'
  | 'out_for_delivery'
  | 'delivered_pending_verification'
  | 'delivered'
  | 'cancelled';

/** Orders a rider has taken on. They count as "On the way" for the vendor. */
const RIDER_STAGES: OrderStatus[] = ['dispatched_to_driver', 'driver_arrived', 'out_for_delivery'];

export type OrderItem = { title: string; qty: number; unit_price?: number | string; line_total?: number | string };

export type VendorOrder = {
  id: string;
  code: string;
  status: OrderStatus;
  total: number | string;
  delivery_fee?: number | string;
  delivery_address?: string | null;
  city?: string | null;
  pickup_address?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  note?: string | null;
  created_at: string;
  fulfilment_mode?: 'pickup' | 'delivery';
  payment_method?: string;
  payment_status?: 'unpaid' | 'paid';
  payment_provider?: string | null;
  driver_id?: string | null;
  items: OrderItem[];
};

export type OrderFilter = 'pending' | 'confirmed' | 'dispatched' | 'completed' | 'all';

export const ORDER_FILTERS: { key: OrderFilter; label: string }[] = [
  { key: 'pending', label: 'New' },
  { key: 'confirmed', label: 'Preparing' },
  { key: 'dispatched', label: 'On the way' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
];

/** Reasons the API asks for when an order is cancelled. "Other" needs at least five characters. */
export const CANCEL_REASONS = ['Out of stock', 'Cannot deliver to this area', 'Buyer asked to cancel', 'Price or listing error', 'Other'];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'New',
  confirmed: 'Preparing',
  dispatched: 'On the way',
  dispatched_to_driver: 'Rider assigned',
  driver_arrived: 'Rider arrived',
  out_for_delivery: 'Out for delivery',
  delivered_pending_verification: 'Delivered',
  delivered: 'Completed',
  cancelled: 'Cancelled',
};

export const ORDER_TONE: Record<OrderStatus, Tone> = {
  pending: 'amber',
  confirmed: 'blue',
  dispatched: 'violet',
  dispatched_to_driver: 'violet',
  driver_arrived: 'violet',
  out_for_delivery: 'violet',
  delivered_pending_verification: 'green',
  delivered: 'green',
  cancelled: 'red',
};

export function matchesFilter(o: VendorOrder, f: OrderFilter): boolean {
  switch (f) {
    case 'all': return true;
    case 'completed': return o.status === 'delivered' || o.status === 'delivered_pending_verification';
    case 'dispatched': return o.status === 'dispatched' || RIDER_STAGES.includes(o.status);
    default: return o.status === f;
  }
}

/** The one forward step a vendor can take from the current status. */
export function nextStep(o: VendorOrder): { status: string; label: string; icon: 'check' | 'truck' | 'check-circle' } | null {
  switch (o.status) {
    case 'pending':
      return { status: 'confirmed', label: 'Accept order', icon: 'check' };
    case 'confirmed':
      return o.fulfilment_mode === 'pickup'
        ? { status: 'delivered', label: 'Mark collected', icon: 'check-circle' }
        : { status: 'dispatched', label: 'Ready for rider', icon: 'truck' };
    case 'dispatched':
      return { status: 'delivered', label: 'Mark delivered', icon: 'check-circle' };
    default:
      return null;
  }
}

export function canCancel(o: VendorOrder): boolean {
  return o.status === 'pending' || o.status === 'confirmed' || o.status === 'dispatched';
}

export function money(value: number | string | undefined): string {
  return qar(value);
}

export function itemCount(o: VendorOrder): number {
  return o.items.reduce((n, i) => n + i.qty, 0);
}

/** "Just now", "12 min ago", "3 h ago", then a short date. Shown in Doha time. */
export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Qatar' });
}
