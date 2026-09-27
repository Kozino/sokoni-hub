/**
 * Outbound email.
 *
 * Deliberately dependency-free: it talks to Resend or Brevo over their HTTP
 * APIs using global fetch (Node 18+). No nodemailer, no SMTP socket handling,
 * nothing new in package.json.
 *
 * Default is 'none'. With no provider configured the app runs exactly as
 * before — sends are recorded as 'skipped' rather than throwing — so email is
 * strictly opt-in via environment variables.
 *
 *   EMAIL_PROVIDER=resend|brevo|none      (default none)
 *   EMAIL_API_KEY=...
 *   EMAIL_FROM=billing@yourdomain.com     (must be a verified sender)
 *   EMAIL_FROM_NAME=Sokoni Hub
 *   EMAIL_REPLY_TO=support@yourdomain.com (optional)
 */

import { query } from './db';

const provider = (process.env.EMAIL_PROVIDER || 'none').toLowerCase();
const apiKey = process.env.EMAIL_API_KEY || '';
const from = process.env.EMAIL_FROM || '';
const fromName = process.env.EMAIL_FROM_NAME || 'Sokoni Hub';
const replyTo = process.env.EMAIL_REPLY_TO || '';

export const emailEnabled = provider !== 'none' && !!apiKey && !!from;

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  /** For the email_log row, so failures can be traced to a document. */
  kind: string;
  entityId?: string | null;
}

export interface SendResult {
  ok: boolean;
  status: 'sent' | 'failed' | 'skipped';
  providerId?: string;
  error?: string;
}

async function record(a: SendArgs, r: SendResult) {
  try {
    await query(
      `insert into email_log (to_address, subject, kind, entity_id, status, provider, provider_id, error)
       values ($1,$2,$3,$4,$5::email_status,$6,$7,$8)`,
      [a.to, a.subject, a.kind, a.entityId ?? null, r.status, provider, r.providerId ?? null, r.error ?? null]
    );
  } catch (e) {
    console.error('[mail] could not write email_log:', (e as Error).message);
  }
}

async function viaResend(a: SendArgs): Promise<SendResult> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${fromName} <${from}>`,
      to: [a.to],
      subject: a.subject,
      html: a.html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  const body: any = await res.json().catch(() => ({}));
  return res.ok
    ? { ok: true, status: 'sent', providerId: body?.id }
    : { ok: false, status: 'failed', error: body?.message || `Resend returned ${res.status}` };
}

async function viaBrevo(a: SendArgs): Promise<SendResult> {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: from, name: fromName },
      to: [{ email: a.to }],
      subject: a.subject,
      htmlContent: a.html,
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
    }),
  });
  const body: any = await res.json().catch(() => ({}));
  return res.ok
    ? { ok: true, status: 'sent', providerId: body?.messageId }
    : { ok: false, status: 'failed', error: body?.message || `Brevo returned ${res.status}` };
}

/**
 * Never throws. A failed send is logged and reported, but must not roll back
 * the business action that triggered it — an order is still delivered even if
 * the receipt email bounces.
 */
export async function sendMail(a: SendArgs): Promise<SendResult> {
  if (!a.to || !/.+@.+\..+/.test(a.to)) {
    const r: SendResult = { ok: false, status: 'skipped', error: 'no valid recipient address' };
    await record(a, r);
    return r;
  }
  if (!emailEnabled) {
    const r: SendResult = { ok: false, status: 'skipped', error: 'email provider not configured' };
    await record(a, r);
    return r;
  }
  let r: SendResult;
  try {
    r = provider === 'brevo' ? await viaBrevo(a) : await viaResend(a);
  } catch (e) {
    r = { ok: false, status: 'failed', error: (e as Error).message };
  }
  if (!r.ok) console.error(`[mail] ${a.kind} to ${a.to} failed: ${r.error}`);
  await record(a, r);
  return r;
}

/** Fire-and-forget: use where the send must never delay or break the response. */
export function sendMailAsync(a: SendArgs) {
  void sendMail(a).catch((e) => console.error('[mail] unexpected', e));
}
