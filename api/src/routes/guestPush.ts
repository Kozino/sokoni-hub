import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { offersReady } from '../offers';

/**
 * Push registration for people who have not signed in.
 *
 * /api/push/token needs an account, so a guest's phone could never be stored and could never hear about an
 * offer. This keeps those devices in their own table, used ONLY for offer campaigns. Order alerts to vendors,
 * riders and signed-in buyers keep using push_tokens exactly as before.
 *
 * Public by design, so it is rate limited in server.ts and accepts nothing but a well-formed Expo token.
 */
export const guestPushRouter = Router();

const TOKEN_RE = /^(Expo|Exponent)PushToken\[[^\]]{4,200}\]$/;
const Body = z.object({
  token: z.string().min(10).max(300).regex(TOKEN_RE, 'Not an Expo push token'),
  platform: z.enum(['ios', 'android', 'web', 'unknown']).default('unknown'),
});

guestPushRouter.post('/device', async (req, res, next) => {
  try {
    const b = Body.parse(req.body);
    // Before migration 031 there is nowhere to keep it. Say so quietly; the app does not depend on the answer.
    if (!(await offersReady())) return res.json({ success: true, stored: false });
    await query(
      `insert into guest_push_devices (token, platform, last_seen_at) values ($1, $2, now())
       on conflict (token) do update set platform = excluded.platform, last_seen_at = now()`,
      [b.token, b.platform],
    );
    res.json({ success: true, stored: true });
  } catch (e) { next(e); }
});

// The app removes the guest entry when the person signs in (their token then lives in push_tokens).
guestPushRouter.delete('/device/:token', async (req, res, next) => {
  try {
    const token = z.string().regex(TOKEN_RE).parse(decodeURIComponent(req.params.token));
    if (await offersReady()) await query(`delete from guest_push_devices where token = $1`, [token]);
    res.json({ success: true });
  } catch (e) { next(e); }
});
