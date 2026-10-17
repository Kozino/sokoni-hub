import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, authStorage } from '../api';

type User = {
  id: string;
  full_name: string;
  phone: string;
  driver_status: 'pending' | 'approved' | 'suspended';
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
    authStorage.read().then(async (token) => {
      if (token) {
        try {
          const { user } = await api.get<{ user: User }>('/auth/me');
          setUser(user);
        } catch {
          await authStorage.save(null);
        }
      }
      setLoading(false);
    });
  }, []);

  const login = async (user: User, token: string) => {
    await authStorage.save(token);
    setUser(user);
  };

  const logout = async () => {
    await authStorage.save(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
