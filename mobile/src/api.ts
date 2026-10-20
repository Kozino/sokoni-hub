import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

const TOKEN_KEY = 'sokoni_mobile_session';
let memoryToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
  }
}

export const authStorage = {
  async read() {
    memoryToken = await SecureStore.getItemAsync(TOKEN_KEY);
    return memoryToken;
  },
  async save(token: string | null) {
    memoryToken = token;
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
  get token() { return memoryToken; },
};

export const setUnauthorizedHandler = (handler: (() => void) | null) => { onUnauthorized = handler; };

// Connectivity is inferred from real requests: a failed fetch marks us offline, any response marks us online.
let offline = false;
const listeners = new Set<() => void>();
const setOffline = (value: boolean) => { if (offline !== value) { offline = value; listeners.forEach((l) => l()); } };
export const connectivity = {
  isOffline: () => offline,
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (memoryToken) headers.set('Authorization', `Bearer ${memoryToken}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api${path}`, { ...init, headers });
  } catch {
    setOffline(true);
    throw new ApiError(0, 'Cannot reach Sokoni Hub. Check your connection and try again.');
  }
  setOffline(false);

  const data = response.headers.get('content-type')?.includes('application/json')
    ? await response.json().catch(() => ({}))
    : {};
  if (!response.ok) {
    // A rate limit is temporary; it must never erase a valid local session.
    if (response.status === 401 && memoryToken) {
      await authStorage.save(null);
      onUnauthorized?.();
    }
    throw new ApiError(response.status, data?.error || `Request failed (${response.status})`, data?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export const query = (params: Record<string, string | number | undefined | null>) => {
  const values = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') values.set(key, String(value));
  });
  const text = values.toString();
  return text ? `?${text}` : '';
};
