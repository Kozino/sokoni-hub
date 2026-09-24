import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Buyer location, used to rank nearby vendors first.
 *
 * Deliberately low-commitment: nothing is requested until the buyer asks for it,
 * the choice is remembered locally, and a refusal is remembered too so we never
 * nag. A buyer without a location simply sees the normal directory ordering.
 */

export interface BuyerLocation {
  lat: number;
  lng: number;
  label?: string;
}

type Status = 'idle' | 'locating' | 'granted' | 'denied' | 'unsupported' | 'error';

interface Ctx {
  location: BuyerLocation | null;
  city: string;
  status: Status;
  error: string;
  /** Ask the browser for coordinates. Only ever called from a user gesture. */
  detect: () => void;
  /** Manual fallback — pick a city instead of sharing precise coordinates. */
  setCity: (city: string) => void;
  setLocation: (loc: BuyerLocation | null) => void;
  clear: () => void;
  /** True when we have something usable for ranking. */
  hasLocation: boolean;
}

const LOC_KEY = 'sokoni_location';
const CITY_KEY = 'sokoni_city';

const LocationCtx = createContext<Ctx | null>(null);

const readLoc = (): BuyerLocation | null => {
  try {
    const raw = localStorage.getItem(LOC_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return typeof v?.lat === 'number' && typeof v?.lng === 'number' ? v : null;
  } catch {
    return null;
  }
};

export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocationState] = useState<BuyerLocation | null>(readLoc);
  const [city, setCityState] = useState<string>(() => localStorage.getItem(CITY_KEY) || '');
  const [status, setStatus] = useState<Status>(() => (readLoc() ? 'granted' : 'idle'));
  const [error, setError] = useState('');

  useEffect(() => {
    if (location) localStorage.setItem(LOC_KEY, JSON.stringify(location));
    else localStorage.removeItem(LOC_KEY);
  }, [location]);

  useEffect(() => {
    if (city) localStorage.setItem(CITY_KEY, city);
    else localStorage.removeItem(CITY_KEY);
  }, [city]);

  const detect = () => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      setError('This browser cannot share your location. Pick your city instead.');
      return;
    }
    setStatus('locating');
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocationState({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) });
        setStatus('granted');
      },
      (e) => {
        // Permission denied is a normal choice, not a failure to shout about.
        if (e.code === e.PERMISSION_DENIED) {
          setStatus('denied');
          setError('Location access was blocked. Pick your city instead.');
        } else {
          setStatus('error');
          setError('Could not get your location. Pick your city instead.');
        }
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 }
    );
  };

  const clear = () => {
    setLocationState(null);
    setCityState('');
    setStatus('idle');
    setError('');
  };

  const value = useMemo<Ctx>(
    () => ({
      location,
      city,
      status,
      error,
      detect,
      setCity: (c: string) => setCityState(c),
      setLocation: (l: BuyerLocation | null) => {
        setLocationState(l);
        setStatus(l ? 'granted' : 'idle');
      },
      clear,
      hasLocation: !!location || !!city,
    }),
    [location, city, status, error]
  );

  return <LocationCtx.Provider value={value}>{children}</LocationCtx.Provider>;
}

export function useLocation() {
  const c = useContext(LocationCtx);
  if (!c) throw new Error('useLocation must be used inside <LocationProvider>');
  return c;
}

/** Human-friendly distance: "800 m", "4.2 km", "12 km". */
export const formatDistance = (km: number | string | null | undefined): string => {
  if (km === null || km === undefined || km === '') return '';
  const n = Number(km);
  if (!Number.isFinite(n)) return '';
  if (n < 1) return `${Math.round(n * 1000)} m`;
  return n < 10 ? `${n.toFixed(1)} km` : `${Math.round(n)} km`;
};
