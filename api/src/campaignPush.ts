/**
 * Offer campaign pushes to customers.
 *
 * Kept apart from push.ts on purpose. push.ts carries order alerts to vendors and riders on their own
 * Android channels and sounds; nothing in this file can reach those apps, because the audience here is
 * only (a) signed-in accounts whose role is `buyer` and (b) guest devices that registered through
 * /api/guest-push. Vendor and rider tokens are never selected.
 */
import { query } from './db';

const EXPO_PUSH_URL = process.env.EXPO_PUSH_URL || 'https://exp.host/--/api/v2/push/send';
const TOKEN_RE = /^(Expo|Exponent)PushToken\[.+\]$/;

export type CampaignAudience = 'all' | 'buyers' | 'guests';

/** Android channel the consumer app creates for offers. */
export const OFFERS_CHANNEL_ID = 'offers';

/** Distinct, valid Expo tokens for an audience. A phone that is both a guest device and a signed-in buyer is counted once. */
export async function campaignTokens(audience: CampaignAudience): Promise<string[]> {
  const buyers = audience === 'guests'
    ? []
    : await query<{ token: string }>(
        `select distinct pt.token
           from push_tokens pt
           join users u on u.id = pt.user_id
          where u.role = 'buyer' and u.is_active`,
      );
  const guests = audience === 'buyers'
    ? []
    : await query<{ token: string }>(
        `select g.token from guest_push_devices g
          where not exists (select 1 from push_tokens p where p.token = g.token)`,
      );
  return [...new Set([...buyers, ...guests].map((r) => r.token).filter((t) => TOKEN_RE.test(t)))];
}

export async function campaignAudienceCounts() {
  const [buyers, guests] = await Promise.all([campaignTokens('buyers'), campaignTokens('guests')]);
  return { buyers: buyers.length, guests: guests.length, total: new Set([...buyers, ...guests]).size };
}

export interface CampaignMessage {
  title: string;
  body: string;
  /** In-app destination, e.g. sokonihub://offers. Opened when the notification is tapped. */
  link?: string | null;
  offerId?: string | null;
}

/**
 * Sends in batches of 100 (Expo's limit). Failures are logged, never thrown: a campaign must not take a request down.
 * Tokens Expo reports as DeviceNotRegistered are removed from both tables so we stop sending to uninstalled apps.
 */
export async function sendCampaignPush(tokens: string[], msg: CampaignMessage): Promise<{ attempted: number; delivered: number }> {
  let delivered = 0;
  try {
    for (let i = 0; i < tokens.length; i += 100) {
      const chunk = tokens.slice(i, i + 100).map((to) => ({
        to,
        title: msg.title,
        body: msg.body,
        data: { type: 'offer', ...(msg.link ? { link: msg.link } : {}), ...(msg.offerId ? { offerId: msg.offerId } : {}) },
        sound: 'default',
        channelId: OFFERS_CHANNEL_ID,
        priority: 'default',
      }));
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      const json: any = await res.json().catch(() => null);
      const tickets: any[] = Array.isArray(json?.data) ? json.data : [];
      delivered += tickets.filter((t) => t?.status === 'ok').length;
      const dead = tickets
        .map((t, idx) => (t?.status === 'error' && t?.details?.error === 'DeviceNotRegistered' ? chunk[idx].to : null))
        .filter((t): t is string => Boolean(t));
      if (dead.length) {
        await query(`delete from push_tokens where token = any($1::text[])`, [dead]);
        await query(`delete from guest_push_devices where token = any($1::text[])`, [dead]);
      }
    }
  } catch (error) {
    console.error('[campaign-push]', (error as Error).message);
  }
  return { attempted: tokens.length, delivered };
}
