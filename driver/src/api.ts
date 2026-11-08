import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

const TOKEN_KEY = 'driver_mobile_session';

/**
 * A request that never settles must never leave a screen stuck on a spinner,
 * so every call is given a deadline. JSON calls are quick; a proof photo
 * going up over a weak mobile connection is not.
 */
const DEFAULT_TIMEOUT_MS = 25_000;
const UPLOAD_TIMEOUT_MS = 120_000;

let memoryToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Resolves with `fallback` if `promise` has not settled within `ms`. Used for device storage reads. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), ms);
    promise.then(finish).catch(() => finish(fallback));
  });
}

export const authStorage = {
  /**
   * Reads the saved session. This never throws: a secure-store entry can become
   * unreadable (for example after a phone restore or a keystore key reset), and a
   * damaged entry must not hold the whole app on its loading screen. If it cannot
   * be read we drop it and continue signed out.
   */
  async read(): Promise<string | null> {
    try {
      memoryToken = await SecureStore.getItemAsync(TOKEN_KEY);
    } catch (error) {
      memoryToken = null;
      console.warn('[driver auth] Saved session could not be read:', error instanceof Error ? error.message : error);
      await authStorage.clear();
    }
    return memoryToken;
  },
  async save(token: string | null) {
    memoryToken = token;
    try {
      if (token) {
        await SecureStore.setItemAsync(TOKEN_KEY, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
      } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
    } catch (error) {
      // The rider stays signed in for this run; only the "remember me" part is lost.
      console.warn('[driver auth] Session could not be saved on this device:', error instanceof Error ? error.message : error);
    }
  },
  /** Best effort: if the stored entry cannot be removed, the app still continues signed out. */
  async clear() {
    memoryToken = null;
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch { /* nothing else we can do; the in-memory session is already gone */ }
  },
  get token() { return memoryToken; },
};

export const setUnauthorizedHandler = (handler: (() => void) | null) => { onUnauthorized = handler; };

export type RequestOptions = RequestInit & { timeoutMs?: number };

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { timeoutMs, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (!(rest.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (memoryToken) headers.set('Authorization', `Bearer ${memoryToken}`);

  const controller = new AbortController();
  const limit = timeoutMs ?? (rest.body instanceof FormData ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, limit);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api${path}`, { ...rest, headers, signal: controller.signal });
  } catch {
    throw new ApiError(0, timedOut
      ? 'Sokoni took too long to respond. Check your connection and try again.'
      : 'Cannot reach the server. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 && memoryToken && onUnauthorized) {
    onUnauthorized();
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    // The API reports problems as { error }, so read that first. Without it the rider only sees a generic message.
    throw new ApiError(response.status, data?.error || data?.message || 'Something went wrong', data?.details ?? data?.errors);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, init?: RequestOptions) => request<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, body?: any, init?: RequestOptions) => request<T>(path, { ...init, method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  put: <T>(path: string, body?: any, init?: RequestOptions) => request<T>(path, { ...init, method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body) }),
  patch: <T>(path: string, body?: any, init?: RequestOptions) => request<T>(path, { ...init, method: 'PATCH', body: body instanceof FormData ? body : JSON.stringify(body) }),
  delete: <T>(path: string, init?: RequestOptions) => request<T>(path, { ...init, method: 'DELETE' }),
};

export const query = (obj: Record<string, any>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
};
