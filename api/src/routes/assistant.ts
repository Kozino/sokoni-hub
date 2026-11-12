import { createHash, randomUUID } from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { one, query } from '../db';
import { optionalAuth } from '../auth';
import { config } from '../config';
import { HttpError, validateUuidParam } from '../utils';
import { assistantSettings, sweepAssistantTranscripts } from '../assistant/settings';
import { runAssistantTurn } from '../assistant/orchestrator';
import type { Locale } from '../assistant/intent';

export const assistantRouter = Router();
assistantRouter.param('id', validateUuidParam);
assistantRouter.use(optionalAuth);

const LOCALES = ['en', 'sw', 'lg', 'tw', 'ar'] as const;
const guestHeader = 'x-sokoni-guest';
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /^(audio|video)\//.test(file.mimetype) || /\.(m4a|mp3|wav|aac|ogg|webm|caf|3gp)$/i.test(file.originalname || '');
    if (ok) cb(null, true);
    else cb(new Error('Send a short voice clip, not another file type.'));
  },
});

function hashGuest(raw: string | undefined): string | null {
  const value = String(raw || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return null;
  return createHash('sha256').update(`sokoni-assistant-guest:${value.toLowerCase()}`).digest('hex');
}

function ownerOf(req: { user?: { id: string } | null; headers: Record<string, unknown> }) {
  const userId = req.user?.id ?? null;
  const guestKey = userId ? null : hashGuest(String(req.headers[guestHeader] || req.headers['X-Sokoni-Guest'] || ''));
  return { userId, guestKey };
}

async function loadThread(threadId: string | undefined, userId: string | null, guestKey: string | null, locale: string) {
  if (threadId) {
    const row = await one<any>(
      `select * from assistant_threads where id = $1 and (
         ($2::uuid is not null and user_id = $2) or ($3::text is not null and guest_key = $3)
       )`,
      [threadId, userId, guestKey],
    );
    if (!row) throw new HttpError(404, 'Conversation not found');
    return row;
  }
  const existing = await one<any>(
    userId
      ? `select * from assistant_threads where user_id = $1 order by last_message_at desc limit 1`
      : `select * from assistant_threads where guest_key = $1 order by last_message_at desc limit 1`,
    [userId || guestKey],
  );
  if (existing) return existing;
  const created = await one<any>(
    `insert into assistant_threads (user_id, guest_key, locale) values ($1,$2,$3) returning *`,
    [userId, guestKey, locale],
  );
  return created!;
}

assistantRouter.get('/status', async (_req, res, next) => {
  try {
    const settings = await assistantSettings();
    res.json({
      enabled: settings.enabled,
      voice_enabled: settings.voice_enabled,
      retention_days: settings.retention_days,
      stt_configured: !!(config.assistantLlmKey),
      llm_configured: !!(config.assistantLlmKey),
    });
  } catch (e) { next(e); }
});

const chatSchema = z.object({
  thread_id: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(2000),
  locale: z.enum(LOCALES).default('en'),
  city: z.string().trim().max(60).optional(),
  fulfilment_mode: z.enum(['pickup', 'delivery']).optional(),
  consent: z.literal(true),
  cart: z.array(z.object({
    listing_id: z.string().uuid(),
    qty: z.number().int().min(1).max(10000),
    option: z.string().trim().min(1).max(100).optional(),
  })).max(40).default([]),
});

assistantRouter.post('/chat', async (req, res, next) => {
  try {
    const settings = await assistantSettings();
    if (!settings.enabled) throw new HttpError(503, 'Sokoni Assistant is paused right now. Browse the market as usual.');
    const body = chatSchema.parse(req.body);
    const { userId, guestKey } = ownerOf(req);
    if (!userId && !guestKey) throw new HttpError(400, 'Missing guest session');
    const thread = await loadThread(body.thread_id, userId, guestKey, body.locale);
    const historyRows = await query<{ role: 'user' | 'assistant'; content: string }>(
      `select role, content from assistant_messages where thread_id = $1 order by created_at desc limit 12`,
      [thread.id],
    );
    const lastAssistant = await one<{ cards: any }>(
      `select cards from assistant_messages where thread_id = $1 and role = 'assistant' order by created_at desc limit 1`,
      [thread.id],
    );
    await query(
      `insert into assistant_messages (thread_id, role, content, locale) values ($1,'user',$2,$3)`,
      [thread.id, body.message, body.locale],
    );
    const started = Date.now();
    const turn = await runAssistantTurn({
      message: body.message,
      locale: body.locale as Locale,
      ctx: {
        userId,
        city: body.city,
        cart: body.cart,
        fulfilment_mode: body.fulfilment_mode || 'delivery',
      },
      history: historyRows.reverse(),
      lastCards: Array.isArray(lastAssistant?.cards) ? lastAssistant!.cards : [],
    });
    const saved = await one<any>(
      `insert into assistant_messages (thread_id, role, content, locale, cards, actions)
       values ($1,'assistant',$2,$3,$4::jsonb,$5::jsonb) returning id, created_at`,
      [thread.id, turn.text, turn.locale, JSON.stringify(turn.cards), JSON.stringify(turn.actions)],
    );
    await query(
      `insert into assistant_turns (thread_id, message_id, user_id, guest_key, model, tools_called, listing_ids, proposed_checkout, duration_ms)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)`,
      [thread.id, saved.id, userId, guestKey, turn.model, JSON.stringify(turn.toolsCalled), turn.listingIds, turn.proposedCheckout, Date.now() - started],
    );
    await query(`update assistant_threads set locale=$2, last_message_at=now(), updated_at=now() where id=$1`, [thread.id, turn.locale]);
    res.json({
      thread_id: thread.id,
      message_id: saved.id,
      text: turn.text,
      locale: turn.locale,
      cards: turn.cards,
      quote: turn.quote,
      actions: turn.actions,
      proposed_checkout: turn.proposedCheckout,
      disclaimer: true,
    });
  } catch (e) { next(e); }
});

assistantRouter.get('/thread', async (req, res, next) => {
  try {
    const { userId, guestKey } = ownerOf(req);
    if (!userId && !guestKey) return res.json({ thread_id: null, messages: [] });
    const thread = userId
      ? await one<any>(`select * from assistant_threads where user_id=$1 order by last_message_at desc limit 1`, [userId])
      : await one<any>(`select * from assistant_threads where guest_key=$1 order by last_message_at desc limit 1`, [guestKey]);
    if (!thread) return res.json({ thread_id: null, messages: [] });
    const messages = await query<any>(
      `select id, role, content, locale, cards, actions, created_at
         from assistant_messages where thread_id=$1 order by created_at asc limit 40`,
      [thread.id],
    );
    res.json({ thread_id: thread.id, messages });
  } catch (e) { next(e); }
});

assistantRouter.delete('/transcripts', async (req, res, next) => {
  try {
    const { userId, guestKey } = ownerOf(req);
    if (!userId && !guestKey) throw new HttpError(400, 'Missing guest session');
    if (userId) await query(`delete from assistant_threads where user_id=$1`, [userId]);
    else await query(`delete from assistant_threads where guest_key=$1`, [guestKey]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

assistantRouter.post('/stt', audioUpload.single('audio'), async (req, res, next) => {
  try {
    const settings = await assistantSettings();
    if (!settings.enabled || !settings.voice_enabled) throw new HttpError(503, 'Voice is paused right now. Type instead.');
    if (!req.file?.buffer?.length) throw new HttpError(400, 'No audio received');
    if (!config.assistantLlmKey) throw new HttpError(501, 'Voice-to-text is not configured on this server. Type your request instead.');
    const locale = String(req.body?.locale || 'en');
    const lang = locale === 'ar' ? 'ar' : locale === 'sw' ? 'sw' : 'en';
    const filename = req.file.originalname || 'voice.m4a';
    const file = new File([req.file.buffer], filename, { type: req.file.mimetype || 'audio/m4a' });
    const form = new FormData();
    form.append('file', file);
    form.append('model', 'whisper-1');
    form.append('language', lang);
    const stt = await fetch(`${config.assistantLlmBase}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.assistantLlmKey}` },
      body: form,
    });
    if (!stt.ok) throw new HttpError(502, 'Could not transcribe that clip. Type instead.');
    const data = await stt.json() as { text?: string };
    const text = String(data.text || '').trim().slice(0, 2000);
    if (!text) throw new HttpError(400, 'I did not catch any words. Try again in a quieter place, or type.');
    res.json({ text });
  } catch (e) { next(e); }
});

export function startAssistantRetentionSweep() {
  const run = () => { sweepAssistantTranscripts().catch((e) => console.error('[assistant] retention sweep failed', e?.message)); };
  run();
  setInterval(run, 6 * 60 * 60 * 1000).unref();
}
