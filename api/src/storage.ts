/**
 * Minimal Supabase Storage client built on Node's native fetch.
 *
 * We deliberately do NOT use `@supabase/supabase-js` here. That package eagerly
 * constructs a RealtimeClient inside `createClient()`, which throws on Node < 22
 * ("Node.js 20 detected without native WebSocket support") even though this app
 * only ever touches Storage. The Storage REST API is a couple of plain HTTP
 * calls, so we talk to it directly and keep the dependency tree small.
 *
 * Docs: https://supabase.com/docs/reference/api/storage
 */
import { config } from './config';

export const storageEnabled = Boolean(config.supabaseUrl && config.supabaseKey);

const base = config.supabaseUrl.replace(/\/+$/, '');

function authHeaders(): Record<string, string> {
  return {
    apikey: config.supabaseKey,
    Authorization: `Bearer ${config.supabaseKey}`,
  };
}

export interface UploadResult {
  key: string;
  publicUrl: string;
}

/** Upload a buffer to `bucket/key`. Throws Error with the API message on failure. */
export async function uploadObject(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<UploadResult> {
  const url = `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeURI(key)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': contentType,
      'Cache-Control': 'max-age=3600',
      'x-upsert': 'false',
    },
    // Uint8Array is an accepted BodyInit; Buffer is a Uint8Array subclass.
    body: new Uint8Array(body),
  });

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const data: any = await res.json();
      if (data?.message) message = data.message;
      else if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body: keep the status line */
    }
    throw new Error(message);
  }

  return { key, publicUrl: publicUrlFor(bucket, key) };
}

/** Public URL for an object in a public bucket. */
export function publicUrlFor(bucket: string, key: string): string {
  return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeURI(key)}`;
}
