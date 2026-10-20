import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, authStorage } from '../api';
import { PUSH_TOKEN_KEY } from '../usePushToken';

type User = {
  id: string;
  full_name: string;
  phone: string;
  role: string;
};

const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  login: (user: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
}>({ user: null, loading: true, login: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If secure storage is unavailable, fall back to the sign-in screen instead of spinning forever.
    authStorage
      .read()
      .then(async (token) => {
        if (!token) return;
        try {
          const { user } = await api.get<{ user: User }>('/auth/me');
          setUser(user);
        } catch {
          await authStorage.save(null).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = async (user: User, token: string) => {
    await authStorage.save(token);
    setUser(user);
  };

  const logout = async () => {
    // Stop order and booking alerts on this device before the session is cleared.
    try {
      const pushToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
      if (pushToken) await api.delete(`/push/token/${encodeURIComponent(pushToken)}`);
    } catch {}
    await authStorage.save(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
