import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { requireAuth } from '../auth';

export const pushRouter = Router();

const TokenSchema = z.object({
  token: z.string().min(10).max(300),
  platform: z.enum(['ios', 'android', 'web', 'unknown']).default('unknown'),
});

// Register (or re-attach) this device's push token to the signed-in account.
pushRouter.post('/token', requireAuth(), async (req, res, next) => {
  try {
    const b = TokenSchema.parse(req.body);
    await query(
      `insert into push_tokens (token, user_id, platform, last_seen_at)
       values ($1, $2, $3, now())
       on conflict (token) do update
         set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now()`,
      [b.token, req.user!.id, b.platform],
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Remove this device's token on sign-out, so the account stops getting pushes here.
pushRouter.delete('/token/:token', requireAuth(), async (req, res, next) => {
  try {
    const token = z.string().min(10).max(300).parse(decodeURIComponent(req.params.token));
    await query(`delete from push_tokens where token = $1 and user_id = $2`, [token, req.user!.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});
