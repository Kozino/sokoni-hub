import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, authStorage, setUnauthorizedHandler } from './api';
import type { CartItem, ThemeName, User, Vendor } from './types';

const THEME_KEY = 'sokoni_mobile_theme';
const CART_KEY = 'sokoni_mobile_cart';

export const palette = {
  light: {
    bg: '#F6F4EE', surface: '#FFFFFF', surface2: '#F7F4EC', text: '#171C36', text2: '#4C5169', muted: '#868B9E',
    border: '#E3DED0', primary: '#2B3A72', primaryPressed: '#1A2650', primarySoft: '#ECEEF7', primaryLine: '#C7CDE4',
    gold: '#B5852A', goldSoft: '#FBF2E0', teal: '#1B6473', tealSoft: '#E8F1F2', success: '#1F6B4A', successSoft: '#E9F3EC',
    warning: '#A9700F', warningSoft: '#FBF1DF', danger: '#9E2B2B', dangerSoft: '#FBECEA', tab: '#FFFFFF', overlay: 'rgba(20,24,51,.46)',
  },
  dark: {
    bg: '#14151B', surface: '#1D1F28', surface2: '#22242E', text: '#ECEDF2', text2: '#AEB2C2', muted: '#7B8093',
    border: '#31333F', primary: '#93A0E4', primaryPressed: '#B8C1EF', primarySoft: '#232744', primaryLine: '#3A4067',
    gold: '#E0BC6A', goldSoft: '#332A18', teal: '#74B6C8', tealSoft: '#142329', success: '#66BE93', successSoft: '#14261E',
    warning: '#E5C57A', warningSoft: '#332617', danger: '#E2A09A', dangerSoft: '#341B1C', tab: '#1D1F28', overlay: 'rgba(0,0,0,.62)',
  },
};
export type Colors = typeof palette.light;

const ThemeContext = createContext<{ theme: ThemeName; colors: Colors; toggleTheme: () => void }>(null as never);
export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>('light');
  useEffect(() => { AsyncStorage.getItem(THEME_KEY).then((saved) => { if (saved === 'dark' || saved === 'light') setTheme(saved); }).catch(() => {}); }, []);
  const toggleTheme = useCallback(() => setTheme((current) => {
    const next = current === 'light' ? 'dark' : 'light';
    void AsyncStorage.setItem(THEME_KEY, next);
    return next;
  }), []);
  return <ThemeContext.Provider value={{ theme, colors: palette[theme], toggleTheme }}>{children}</ThemeContext.Provider>;
}

export type AuthStage =
  | { kind: 'none' }
  | { kind: 'pin'; pinToken: string; fullName: string }
  | { kind: 'setup'; setupToken: string; fullName: string; needsEmail: boolean }
  | { kind: 'mfa'; mfaToken: string; fullName: string };

type LoginResponse = {
  token?: string; user?: User; vendor?: Vendor | null;
  pin_required?: boolean; pin_token?: string;
  pin_setup_required?: boolean; setup_token?: string; needs_email?: boolean;
  mfa_required?: boolean; mfa_token?: string; full_name?: string;
};

const AuthContext = createContext<{
  user: User | null; vendor: Vendor | null; loading: boolean; stage: AuthStage;
  refresh: () => Promise<void>; login: (identifier: string, password: string) => Promise<AuthStage>;
  verifyPin: (pin: string) => Promise<AuthStage>; verifyMfa: (code: string) => Promise<AuthStage>;
  setupPin: (pin: string, email?: string) => Promise<AuthStage>;
  register: (payload: { full_name: string; phone: string; email: string; password: string; pin: string }) => Promise<AuthStage>;
  logout: () => Promise<void>; clearStage: () => void; updateUser: (user: User) => void;
}>(null as never);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<AuthStage>({ kind: 'none' });

  const clear = useCallback(async () => {
    await authStorage.save(null);
    setUser(null); setVendor(null); setStage({ kind: 'none' });
  }, []);

  const refresh = useCallback(async () => {
    if (!authStorage.token) { setLoading(false); return; }
    try {
      const result = await api.get<{ user: User; vendor: Vendor | null }>('/auth/me');
      setUser(result.user); setVendor(result.vendor);
    } catch {
      // api.ts already clears on 401; network failures deliberately preserve a
      // session so a transient outage never signs out a buyer.
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    authStorage.read().then(refresh).catch(() => setLoading(false));
    setUnauthorizedHandler(() => { setUser(null); setVendor(null); setStage({ kind: 'none' }); });
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  const finish = useCallback(async (response: LoginResponse): Promise<AuthStage> => {
    if (response.mfa_required) { const next: AuthStage = { kind: 'mfa', mfaToken: response.mfa_token!, fullName: response.full_name || '' }; setStage(next); return next; }
    if (response.pin_required) { const next: AuthStage = { kind: 'pin', pinToken: response.pin_token!, fullName: response.full_name || '' }; setStage(next); return next; }
    if (response.pin_setup_required) { const next: AuthStage = { kind: 'setup', setupToken: response.setup_token!, fullName: response.full_name || '', needsEmail: !!response.needs_email }; setStage(next); return next; }
    if (!response.token || !response.user) throw new Error('Unexpected sign-in response');
    await authStorage.save(response.token);
    setUser(response.user); setVendor(response.vendor ?? null); const next: AuthStage = { kind: 'none' }; setStage(next); return next;
  }, []);

  const login = useCallback(async (identifier: string, password: string) => finish(await api.post<LoginResponse>('/auth/login', { identifier, password })), [finish]);
  const verifyPin = useCallback(async (pin: string) => {
    if (stage.kind !== 'pin') throw new Error('Start signing in again.');
    return finish(await api.post<LoginResponse>('/auth/login/pin', { pin_token: stage.pinToken, pin }));
  }, [finish, stage]);
  const verifyMfa = useCallback(async (code: string) => {
    if (stage.kind !== 'mfa') throw new Error('Start signing in again.');
    return finish(await api.post<LoginResponse>('/auth/login/mfa', { mfa_token: stage.mfaToken, code }));
  }, [finish, stage]);
  const setupPin = useCallback(async (pin: string, email?: string) => {
    if (stage.kind !== 'setup') throw new Error('Start signing in again.');
    return finish(await api.post<LoginResponse>('/auth/pin/setup', { setup_token: stage.setupToken, pin, email }));
  }, [finish, stage]);
  const register = useCallback(async (payload: { full_name: string; phone: string; email: string; password: string; pin: string }) => {
    return finish(await api.post<LoginResponse>('/auth/register', { ...payload, role: 'buyer' }));
  }, [finish]);
  const logout = useCallback(async () => { try { await api.post('/auth/logout'); } catch {} await clear(); }, [clear]);

  const value = useMemo(() => ({ user, vendor, loading, stage, refresh, login, verifyPin, verifyMfa, setupPin, register, logout, clearStage: () => setStage({ kind: 'none' }), updateUser: setUser }),
    [user, vendor, loading, stage, refresh, login, verifyPin, verifyMfa, setupPin, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const CartContext = createContext<{
  items: CartItem[]; count: number; add: (item: CartItem) => void; setQty: (id: string, qty: number) => void;
  remove: (id: string) => void; clear: () => void;
}>(null as never);
export const useCart = () => useContext(CartContext);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  useEffect(() => { AsyncStorage.getItem(CART_KEY).then((raw) => { if (raw) setItems(JSON.parse(raw).filter((item: CartItem) => item.kind !== 'service')); }).catch(() => {}); }, []);
  const update = useCallback((next: CartItem[]) => { setItems(next); void AsyncStorage.setItem(CART_KEY, JSON.stringify(next)); }, []);
  const add = useCallback((item: CartItem) => {
    if (item.kind === 'service') return;
    setItems((current) => {
      const found = current.find((row) => row.listing_id === item.listing_id);
      const next = found ? current.map((row) => row.listing_id === item.listing_id ? { ...row, qty: Math.min(row.qty + item.qty, row.max ?? Infinity) } : row) : [...current, item];
      void AsyncStorage.setItem(CART_KEY, JSON.stringify(next)); return next;
    });
  }, []);
  const setQty = useCallback((id: string, qty: number) => update(items.map((item) => item.listing_id === id ? { ...item, qty: Math.max(1, Math.min(qty, item.max ?? Infinity)) } : item)), [items, update]);
  const remove = useCallback((id: string) => update(items.filter((item) => item.listing_id !== id)), [items, update]);
  const clear = useCallback(() => update([]), [update]);
  const value = useMemo(() => ({ items, count: items.reduce((total, item) => total + item.qty, 0), add, setQty, remove, clear }), [items, add, setQty, remove, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
