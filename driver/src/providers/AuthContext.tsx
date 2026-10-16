import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    AsyncStorage.getItem('driver_session').then((data) => {
      if (data) setUser(JSON.parse(data).user);
      setLoading(false);
    });
  }, []);

  const login = async (user: User, token: string) => {
    await AsyncStorage.setItem('driver_session', JSON.stringify({ user, token }));
    setUser(user);
  };

  const logout = async () => {
    await AsyncStorage.removeItem('driver_session');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
