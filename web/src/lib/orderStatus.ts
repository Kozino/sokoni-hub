/* One place for how an order status reads to people. Buyers, vendors and admins all use these labels. */
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

/** Label for an order status. Unknown values fall back to the raw text with underscores removed. */
export const orderStatusLabel = (status: string, disputed = false): string => {
  if (status === 'delivered_pending_verification' && disputed) return 'Reported by buyer';
  return ORDER_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
};

/** Maps any order status onto the four-step progress bar used on the track page. */
export const orderProgressStep = (status: string): number => {
  const steps = ['pending', 'confirmed', 'dispatched', 'delivered'];
  if (status === 'delivered_pending_verification') return 3;
  if (['dispatched_to_driver', 'driver_arrived', 'out_for_delivery'].includes(status)) return 2;
  return steps.indexOf(status);
};
