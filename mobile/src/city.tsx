import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';

const KEY = 'sokoni_mobile_city';

/** The buyer's chosen city. An empty string means "All cities". Shared by Explore, search and Browse. */
const CityContext = createContext<{ city: string; setCity: (city: string) => void; cities: string[] }>({ city: '', setCity: () => {}, cities: [] });
export const useCity = () => useContext(CityContext);

export function CityProvider({ children }: { children: ReactNode }) {
  const [city, setCityState] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((saved) => { if (saved) setCityState(saved); }).catch(() => {});
    api.get<{ cities: string[] }>('/listings/cities').then((result) => setCities(result.cities || [])).catch(() => {});
  }, []);
  const setCity = useCallback((next: string) => { setCityState(next); void AsyncStorage.setItem(KEY, next).catch(() => {}); }, []);
  const value = useMemo(() => ({ city, setCity, cities }), [city, setCity, cities]);
  return <CityContext.Provider value={value}>{children}</CityContext.Provider>;
}
