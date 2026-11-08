import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, ApiError, authStorage, withTimeout } from '../api';
import { stopRiderTracking } from '../backgroundLocation';

type User = {
  id: string;
  full_name: string;
  phone: string;
  driver_status: 'pending' | 'approved' | 'suspended';
};

const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  /** A saved session exists but the server could not be reached to confirm it. */
  offline: boolean;
  retry: () => Promise<void>;
  login: (user: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
}>({ user: null, loading: true, offline: false, retry: async () => {}, login: async () => {}, logout: async () => {} });

/** Device storage reads should be instant; if one hangs, carry on rather than block the app. */
const SESSION_READ_TIMEOUT_MS = 5_000;
/** A cold server can be slow, but the splash screen cannot wait forever. */
const SESSION_CHECK_TIMEOUT_MS = 20_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /**
   * Restores a saved session. Every path through this function ends with
   * `loading === false`; the app must never sit on "Preparing your driver portal…".
   */
  const restore = useCallback(async () => {
    if (mounted.current) {
      setLoading(true);
      setOffline(false);
    }

    // A missing, damaged, or unreadable secure-store entry means "signed out", not "hang".
    const token = await withTimeout(authStorage.read(), SESSION_READ_TIMEOUT_MS, null);

    if (!token) {
      if (mounted.current) {
        setUser(null);
        setLoading(false);
      }
      return;
    }

    try {
      const session = await api.get<{ user: User }>('/auth/me', { timeoutMs: SESSION_CHECK_TIMEOUT_MS });
      if (mounted.current) setUser(session.user);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // The session really is expired or revoked, so forget it.
        await authStorage.clear();
        if (mounted.current) setUser(null);
      } else if (mounted.current) {
        // A network problem is not a sign-out. Keep the saved session and offer a retry.
        setOffline(true);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void restore();
  }, [restore]);

  // Last-resort guard, so no future change can bring back a permanent loading screen.
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      if (mounted.current) setLoading(false);
    }, 30_000);
    return () => clearTimeout(timer);
  }, [loading]);

  const login = async (user: User, token: string) => {
    await authStorage.save(token);
    setOffline(false);
    setUser(user);
  };

  const logout = async () => {
    // Stop job alerts for this rider on this device before the session is cleared.
    try {
      const pushToken = await AsyncStorage.getItem('sokoni.pushToken');
      if (pushToken) await api.delete(`/push/token/${encodeURIComponent(pushToken)}`, { timeoutMs: 5_000 });
    } catch {}
    // Neither of these may block signing out.
    try { await stopRiderTracking(); } catch {}
    await authStorage.save(null);
    setOffline(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, offline, retry: restore, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
