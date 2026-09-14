import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api, setToken, getToken } from '../lib/api';
import type { User, Vendor } from '../types';

interface AuthState {
  user: User | null;
  vendor: Vendor | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<User>;
  register: (p: { full_name: string; phone: string; email?: string; password: string; role: 'buyer' | 'vendor' }) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setVendor(null); setLoading(false); return; }
    try {
      const r = await api.get<{ user: User; vendor: Vendor | null }>('/auth/me');
      setUser(r.user); setVendor(r.vendor);
    } catch {
      setToken(null); setUser(null); setVendor(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login: AuthState['login'] = async (identifier, password) => {
    const r = await api.post<{ token: string; user: User; vendor: Vendor | null }>('/auth/login', { identifier, password });
    setToken(r.token); setUser(r.user); setVendor(r.vendor ?? null);
    return r.user;
  };

  const register: AuthState['register'] = async (p) => {
    const r = await api.post<{ token: string; user: User }>('/auth/register', p);
    setToken(r.token); setUser(r.user); setVendor(null);
    return r.user;
  };

  const logout = () => { setToken(null); setUser(null); setVendor(null); };

  return <Ctx.Provider value={{ user, vendor, loading, login, register, logout, refresh }}>{children}</Ctx.Provider>;
}
