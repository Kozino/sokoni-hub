/* One place for how an order status reads to people. Matches the web app's labels. */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  dispatched: 'Dispatched',
  dispatched_to_driver: 'Driver assigned',
  driver_arrived: 'Driver arrived',
  out_for_delivery: 'Out for delivery',
  delivered_pending_verification: 'Awaiting buyer confirmation',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const orderStatusLabel = (status: string, disputed = false): string => {
  if (status === 'delivered_pending_verification' && disputed) return 'Reported by buyer';
  return ORDER_STATUS_LABELS[status] ?? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};
