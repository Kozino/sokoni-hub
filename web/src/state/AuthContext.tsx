import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api, setToken, getToken, ApiError } from '../lib/api';
import type { User, Vendor } from '../types';

/** What the server wants next after a login call. */
export type LoginStep =
  | { step: 'mfa'; mfaToken:string; fullName:string }
  | { step: 'done'; user: User }                                                  // signed in
  | { step: 'pin'; pinToken: string; fullName: string }                           // ask for the PIN
  | { step: 'setup'; setupToken: string; needsEmail: boolean; fullName: string }; // create a PIN

interface LoginResp {
  mfa_required?:boolean; mfa_token?:string;
  token?: string; user?: User; vendor?: Vendor | null;
  pin_required?: boolean; pin_token?: string;
  pin_setup_required?: boolean; setup_token?: string; needs_email?: boolean;
  full_name?: string;
}

interface AuthState {
  user: User | null;
  vendor: Vendor | null;
  loading: boolean;
  /** True while an admin is viewing the site as another user. */
  impersonating: boolean;
  /** Step 1: identifier + password. May ask for a PIN, or for a PIN to be created. */
  login: (identifier: string, password: string) => Promise<LoginStep>;
  /** Step 2: the PIN. */
  verifyMfa: (mfaToken:string,code:string)=>Promise<LoginStep>;
  verifyPin: (pinToken: string, pin: string) => Promise<LoginStep>;
  /** Create a PIN (existing accounts, or after an admin reset). */
  setupPin: (p: { setupToken: string; pin: string; email?: string }) => Promise<User>;
  register: (p: { full_name: string; phone: string; email: string; password: string; pin: string; role: 'buyer' | 'vendor' }) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
  /** Admin only: switch this tab to the given user's session. */
  impersonate: (userId: string) => Promise<User>;
  /** Restore the admin's own session and go back to the Users page. */
  stopImpersonating: () => void;
}

const Ctx = createContext<AuthState>(null as any);
export const useAuth = () => useContext(Ctx);

// The admin's own token is parked in sessionStorage (per tab) while viewing as someone else.
const ADMIN_KEY = 'sokoni_admin_token';
const readAdminToken = () => { try { return sessionStorage.getItem(ADMIN_KEY); } catch { return null; } };
const writeAdminToken = (t: string) => { try { sessionStorage.setItem(ADMIN_KEY, t); } catch { /* ignore */ } };
const clearAdminToken = () => { try { sessionStorage.removeItem(ADMIN_KEY); } catch { /* ignore */ } };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState<boolean>(() => !!readAdminToken());

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setVendor(null); setLoading(false); return; }
    try {
      const r = await api.get<{ user: User; vendor: Vendor | null }>('/auth/me');
      setUser(r.user); setVendor(r.vendor);
    } catch (err) {
      if (!(err instanceof ApiError) || ![401,403].includes(err.status)) return;
      // Token rejected (for example the 1-hour "view as" token expired, or the
      // PIN was changed on another device): sign out fully.
      setToken(null); setUser(null); setVendor(null);
      clearAdminToken(); setImpersonating(false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /** Turns a server response into either "signed in" or "the next step". */
  const finish = (r: LoginResp): LoginStep => {
    if (r.mfa_required) return {step:'mfa',mfaToken:r.mfa_token!,fullName:r.full_name||''};
    if (r.pin_required)
      return { step: 'pin', pinToken: r.pin_token!, fullName: r.full_name ?? '' };
    if (r.pin_setup_required)
      return { step: 'setup', setupToken: r.setup_token!, needsEmail: !!r.needs_email, fullName: r.full_name ?? '' };
    clearAdminToken(); setImpersonating(false);
    setToken(r.token!); setUser(r.user!); setVendor(r.vendor ?? null);
    return { step: 'done', user: r.user! };
  };

  const login: AuthState['login'] = async (identifier, password) =>
    finish(await api.post<LoginResp>('/auth/login', { identifier, password }));

  const verifyMfa: AuthState['verifyMfa'] = async(mfaToken,code)=>finish(await api.post<LoginResp>('/auth/login/mfa',{mfa_token:mfaToken,code}));

  const verifyPin: AuthState['verifyPin'] = async (pinToken, pin) =>
    finish(await api.post<LoginResp>('/auth/login/pin', { pin_token: pinToken, pin }));

  const setupPin: AuthState['setupPin'] = async ({ setupToken, pin, email }) => {
    const r = await api.post<LoginResp>('/auth/pin/setup', { setup_token: setupToken, pin, email });
    finish(r);
    return r.user!;
  };

  const register: AuthState['register'] = async (p) => {
    const r = await api.post<{ token: string; user: User }>('/auth/register', p);
    setToken(r.token); setUser(r.user); setVendor(null);
    return r.user;
  };

  const impersonate: AuthState['impersonate'] = async (userId) => {
    const adminToken = getToken();
    if (!adminToken) throw new Error('Not signed in');
    const r = await api.post<{ token: string; user: User; vendor: Vendor | null }>(`/admin/users/${userId}/impersonate`);
    writeAdminToken(adminToken);
    setImpersonating(true);
    setToken(r.token); setUser(r.user); setVendor(r.vendor ?? null);
    return r.user;
  };

  const stopImpersonating = () => {
    const adminToken = readAdminToken();
    clearAdminToken();
    setImpersonating(false);
    setToken(adminToken ?? null);
    // Full reload so every page reloads its data as the admin.
    window.location.assign(adminToken ? '/admin/users' : '/');
  };

  const logout = async () => {
    if (impersonating) { stopImpersonating(); return; }
    try {await api.post('/auth/logout');} catch { /* local signout still works offline */ }
    setToken(null); setUser(null); setVendor(null);
  };

  return (
    <Ctx.Provider value={{ user, vendor, loading, impersonating, login, verifyMfa, verifyPin, setupPin, register, logout, refresh, impersonate, stopImpersonating }}>
      {children}
      {impersonating && user && (
        <div
          role="status"
          style={{
            position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 2000,
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
            background: '#1f2937', color: '#fff', boxShadow: '0 6px 24px rgba(0,0,0,.28)',
            fontSize: '.85rem', maxWidth: 'calc(100vw - 24px)',
          }}
        >
          <span>Viewing as <strong>{user.full_name}</strong> ({user.role})</span>
          <button className="btn btn-sm btn-outline" style={{ background: '#fff' }} onClick={stopImpersonating}>
            Back to admin
          </button>
        </div>
      )}
    </Ctx.Provider>
  );
}
