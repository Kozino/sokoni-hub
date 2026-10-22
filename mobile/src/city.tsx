import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCityList } from './data';
import { cleanCity } from './format';

const KEY = 'sokoni_mobile_city';

/**
 * The buyer's chosen city. An empty string means "All cities". Shared by Explore, search and Browse.
 * City names are trimmed and de-duplicated, because sellers type them by hand ("Doha" and "Doha ").
 */
const CityContext = createContext<{ city: string; setCity: (city: string) => void; cities: string[] }>({ city: '', setCity: () => {}, cities: [] });
export const useCity = () => useContext(CityContext);

export function CityProvider({ children }: { children: ReactNode }) {
  const [city, setCityState] = useState('');
  const { data } = useCityList();
  const cities = useMemo(() => data ?? [], [data]);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((saved) => { if (saved) setCityState(cleanCity(saved)); }).catch(() => {});
  }, []);
  const setCity = useCallback((next: string) => {
    const clean = cleanCity(next);
    setCityState(clean);
    void AsyncStorage.setItem(KEY, clean).catch(() => {});
  }, []);
  const value = useMemo(() => ({ city, setCity, cities }), [city, setCity, cities]);
  return <CityContext.Provider value={value}>{children}</CityContext.Provider>;
}
