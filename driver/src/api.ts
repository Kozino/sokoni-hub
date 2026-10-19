import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

const TOKEN_KEY = 'driver_mobile_session';
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (memoryToken) headers.set('Authorization', `Bearer ${memoryToken}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
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
  get: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, body?: any, init?: RequestInit) => request<T>(path, { ...init, method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  put: <T>(path: string, body?: any, init?: RequestInit) => request<T>(path, { ...init, method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body) }),
  patch: <T>(path: string, body?: any, init?: RequestInit) => request<T>(path, { ...init, method: 'PATCH', body: body instanceof FormData ? body : JSON.stringify(body) }),
  delete: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'DELETE' }),
};

export const query = (obj: Record<string, any>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
};
