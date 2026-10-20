/** Order shapes and status rules for the vendor app. Mirrors the rules the API enforces. */

export type OrderItem = { title: string; qty: number };

export type VendorOrder = {
  id: string;
  code: string;
  status: 'pending' | 'confirmed' | 'dispatched' | 'delivered_pending_verification' | 'delivered' | 'cancelled';
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
  driver_id?: string | null;
  items: OrderItem[];
};

export const ORDER_FILTERS: { key: string; label: string }[] = [
  { key: 'pending', label: 'New' },
  { key: 'confirmed', label: 'Preparing' },
  { key: 'dispatched', label: 'On the way' },
  { key: '', label: 'All' },
];

/** Reasons the API asks for when an order is cancelled. "Other" needs at least five characters. */
export const CANCEL_REASONS = ['Out of stock', 'Cannot deliver to this area', 'Buyer asked to cancel', 'Price or listing error', 'Other'];

export const STATUS_LABEL: Record<string, string> = {
  pending: 'New',
  confirmed: 'Preparing',
  dispatched: 'On the way',
  delivered_pending_verification: 'Delivered',
  delivered: 'Completed',
  cancelled: 'Cancelled',
};

/** The one or two forward steps a vendor can take from the current status. */
export function nextSteps(o: VendorOrder): { status: string; label: string }[] {
  switch (o.status) {
    case 'pending':
      return [{ status: 'confirmed', label: 'Accept order' }];
    case 'confirmed':
      return o.fulfilment_mode === 'pickup'
        ? [{ status: 'delivered', label: 'Mark collected' }]
        : [{ status: 'dispatched', label: 'Ready for rider' }];
    case 'dispatched':
      return [{ status: 'delivered', label: 'Mark delivered' }];
    default:
      return [];
  }
}

export function canCancel(o: VendorOrder): boolean {
  return o.status === 'pending' || o.status === 'confirmed' || o.status === 'dispatched';
}

export function money(value: number | string | undefined): string {
  return `QAR ${Number(value || 0).toFixed(2)}`;
}
