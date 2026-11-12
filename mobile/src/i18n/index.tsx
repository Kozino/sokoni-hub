import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, I18nManager } from 'react-native';
import { assistantGuest } from '../api';
import en from './locales/en';
import sw from './locales/sw';
import lg from './locales/lg';
import tw from './locales/tw';
import ar from './locales/ar';
import { PHRASES } from './locales/phrases';

export type Dir = 'ltr' | 'rtl';
export type LocaleCode = 'en' | 'sw' | 'lg' | 'tw' | 'ar';
export type Dict = Record<string, string>;

export interface LocaleMeta {
  code: LocaleCode;
  label: string;
  english: string;
  dir: Dir;
  greeting: string;
}

export const LOCALES: LocaleMeta[] = [
  { code: 'en', label: 'English', english: 'English', dir: 'ltr', greeting: 'Hello' },
  { code: 'sw', label: 'Kiswahili', english: 'Swahili', dir: 'ltr', greeting: 'Karibu' },
  { code: 'lg', label: 'Luganda', english: 'Luganda', dir: 'ltr', greeting: 'Tukwanirizza' },
  { code: 'tw', label: 'Twi', english: 'Twi', dir: 'ltr', greeting: 'Akwaaba' },
  { code: 'ar', label: 'العربية', english: 'Arabic', dir: 'rtl', greeting: 'مرحباً' },
];

const DICTS: Record<LocaleCode, Dict> = { en, sw, lg, tw, ar };
const BY_CODE = Object.fromEntries(LOCALES.map((l) => [l.code, l])) as Record<LocaleCode, LocaleMeta>;
const STORAGE_KEY = 'sokoni_mobile_locale';

/** English source copy → namespaced key, so <Text>Cancel</Text> still translates. */
const EN_TO_KEY: Record<string, string> = {};
for (const [k, v] of Object.entries(en)) {
  if (v && EN_TO_KEY[v] == null) EN_TO_KEY[v] = k;
}

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] == null ? '' : String(vars[key])));
}

export function lookup(locale: LocaleCode, key: string, vars?: Record<string, string | number>): string {
  const dict = DICTS[locale] || en;
  const phrases = PHRASES[locale] || {};
  let template: string | undefined;
  if (dict[key] != null) template = dict[key];
  else if (phrases[key] != null) template = phrases[key];
  else if (EN_TO_KEY[key] && dict[EN_TO_KEY[key]] != null) template = dict[EN_TO_KEY[key]];
  else template = key;
  return interpolate(template, vars);
}

interface Ctx {
  locale: LocaleCode;
  dir: Dir;
  meta: LocaleMeta;
  ready: boolean;
  setLocale: (code: LocaleCode) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nCtx = createContext<Ctx>({
  locale: 'en', dir: 'ltr', meta: LOCALES[0], ready: false,
  setLocale: () => {}, t: (k) => k,
});

export const useI18n = () => useContext(I18nCtx);
export const useT = () => useContext(I18nCtx).t;

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>('en');
  const [ready, setReady] = useState(false);
  const localeRef = useRef<LocaleCode>(locale);
  localeRef.current = locale;

  useEffect(() => {
    void assistantGuest.load();
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved && BY_CODE[saved as LocaleCode]) {
        localeRef.current = saved as LocaleCode;
        setLocaleState(saved as LocaleCode);
      }
      setReady(true);
    }).catch(() => setReady(true));
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => lookup(locale, key, vars), [locale]);

  const setLocale = useCallback((code: LocaleCode) => {
    if (!BY_CODE[code]) return;
    const prevRtl = I18nManager.isRTL;
    localeRef.current = code;
    setLocaleState(code);
    void AsyncStorage.setItem(STORAGE_KEY, code);
    const rtl = BY_CODE[code].dir === 'rtl';
    if (prevRtl !== rtl) {
      I18nManager.allowRTL(rtl);
      I18nManager.forceRTL(rtl);
      Alert.alert('Language', 'Close and reopen the app to apply the new text direction.');
    }
  }, []);

  // System alerts (Cancel / Keep items / …) follow the selected language.
  useEffect(() => {
    const original = Alert.alert.bind(Alert);
    (Alert as { alert: typeof Alert.alert }).alert = (title, message, buttons, options) =>
      original(
        typeof title === 'string' ? lookup(localeRef.current, title) : title,
        typeof message === 'string' ? lookup(localeRef.current, message) : message,
        Array.isArray(buttons)
          ? buttons.map((b) => (b && typeof b.text === 'string' ? { ...b, text: lookup(localeRef.current, b.text) } : b))
          : buttons,
        options,
      );
    return () => { (Alert as { alert: typeof Alert.alert }).alert = original; };
  }, []);

  const meta = BY_CODE[locale];
  const value = useMemo(() => ({ locale, dir: meta.dir, meta, ready, setLocale, t }), [locale, meta, ready, setLocale, t]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}
