import { query } from './db';

/**
 * Expo push delivery. Fire-and-forget: a failed push must never fail the
 * request that triggered it. Tokens Expo reports as DeviceNotRegistered are
 * removed so we stop sending to uninstalled apps.
 */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const TOKEN_RE = /^(Expo|Exponent)PushToken\[.+\]$/;

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Android notification channel on the device. Must match the driver app's channel id. */
  channelId?: string;
  /** Bundled sound filename, or 'default'. Driver jobs use delivery_alert.wav. */
  sound?: string;
}

export async function sendPushToUsers(userIds: Array<string | null | undefined>, msg: PushMessage): Promise<void> {
  try {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    if (!ids.length) return;
    const rows = await query<{ token: string }>(
      `select token from push_tokens where user_id = any($1::uuid[])`,
      [ids],
    );
    const tokens = rows.map((r) => r.token).filter((t) => TOKEN_RE.test(t));
    for (let i = 0; i < tokens.length; i += 100) {
      const chunk = tokens.slice(i, i + 100).map((to) => ({
        to,
        title: msg.title,
        body: msg.body,
        data: msg.data ?? {},
        sound: msg.sound ?? 'default',
        channelId: msg.channelId,
        priority: 'high',
      }));
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      const json: any = await res.json().catch(() => null);
      const tickets: any[] = Array.isArray(json?.data) ? json.data : [];
      const dead = tickets
        .map((t, idx) => (t?.status === 'error' && t?.details?.error === 'DeviceNotRegistered' ? chunk[idx].to : null))
        .filter((t): t is string => Boolean(t));
      if (dead.length) await query(`delete from push_tokens where token = any($1::text[])`, [dead]);
    }
  } catch (error) {
    console.error('[push]', (error as Error).message);
  }
}

/** Every approved rider who is currently online. */
export async function notifyOnlineDrivers(msg: PushMessage): Promise<void> {
  const rows = await query<{ user_id: string }>(
    `select user_id from drivers where status = 'approved' and is_online = true`,
  );
  await sendPushToUsers(rows.map((r) => r.user_id), { ...msg, channelId: 'delivery-jobs-v2', sound: 'delivery_alert.wav' });
}

/** The vendor's owner account, for a given order. Uses the vendor alert channel (sound on the vendor app). */
export async function notifyVendorOfOrder(orderId: string, msg: PushMessage): Promise<void> {
  const rows = await query<{ user_id: string }>(
    `select v.user_id from orders o join vendors v on v.id = o.vendor_id where o.id = $1 and v.alerts_enabled`,
    [orderId],
  );
  await sendPushToUsers(rows.map((r) => r.user_id), { ...msg, channelId: 'vendor-alerts' });
}

/** The vendor's owner account, for a given service booking. */
export async function notifyVendorOfBooking(bookingId: string, msg: PushMessage): Promise<void> {
  const rows = await query<{ user_id: string }>(
    `select v.user_id from service_bookings b join vendors v on v.id = b.vendor_id where b.id = $1 and v.alerts_enabled`,
    [bookingId],
  );
  await sendPushToUsers(rows.map((r) => r.user_id), { ...msg, channelId: 'vendor-alerts' });
}

/** The buyer, if the order was placed by a signed-in account (guest orders have no account). */
export async function notifyBuyerOfOrder(orderId: string, msg: PushMessage): Promise<void> {
  const rows = await query<{ buyer_id: string | null }>(`select buyer_id from orders where id = $1`, [orderId]);
  await sendPushToUsers(rows.map((r) => r.buyer_id), msg);
}

const STATUS_COPY: Record<string, PushMessage> = {
  confirmed: { title: 'Order confirmed', body: 'The seller has confirmed your order.' },
  dispatched: { title: 'Order ready for pickup', body: 'Your order is ready and waiting for a rider.' },
  dispatched_to_driver: { title: 'Rider assigned', body: 'A rider has accepted your order.' },
  out_for_delivery: { title: 'On the way', body: 'Your rider is heading to you.' },
  delivered_pending_verification: { title: 'Did your order arrive?', body: 'Confirm receipt, or report a problem, in the app.' },
  delivered: { title: 'Order complete', body: 'Thanks for shopping with Sokoni Hub.' },
  cancelled: { title: 'Order cancelled', body: 'Your order was cancelled.' },
};

/** Buyer-facing copy for a status change. Unknown statuses send nothing. */
export function buyerStatusMessage(status: string, orderCode?: string): PushMessage | null {
  const copy = STATUS_COPY[status];
  if (!copy) return null;
  return { ...copy, body: orderCode ? `${copy.body} (${orderCode})` : copy.body, data: { status } };
}
