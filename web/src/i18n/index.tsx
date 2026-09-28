import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import en from './locales/en';

/**
 * Translation and text direction.
 *
 * WHY NOT react-i18next. It is the default answer and it is a good library,
 * but it costs ~40 KB gzipped plus its plugin chain, and this marketplace's
 * buyers are on mid-range Android over Qatari mobile data — the same reason
 * the fonts were moved off the critical path. What is actually needed here is
 * key lookup, interpolation, a plural rule and a direction flag. That is the
 * file below, and it ships in about 2 KB.
 *
 * Non-English dictionaries are dynamically imported, so Vite emits one chunk
 * per language and a visitor downloads only the one they use. English is
 * bundled because it is the fallback and is needed on first paint.
 */

export type Dir = 'ltr' | 'rtl';

export interface LocaleMeta {
  code: string;
  /** Shown in the switcher, in the language itself — never translated. */
  label: string;
  english: string;
  dir: Dir;
}

/**
 * The supported set.
 *
 * `label` is deliberately the endonym: someone looking for their own language
 * scans for "العربية", not for "Arabic". `english` is only there so the
 * switcher can be searched and read by an admin.
 */
export const LOCALES: LocaleMeta[] = [
  { code: 'en', label: 'English',   english: 'English',  dir: 'ltr' },
  { code: 'ar', label: 'العربية',    english: 'Arabic',   dir: 'rtl' },
  { code: 'fr', label: 'Français',  english: 'French',   dir: 'ltr' },
  { code: 'sw', label: 'Kiswahili', english: 'Swahili',  dir: 'ltr' },
  { code: 'tw', label: 'Twi',       english: 'Twi',      dir: 'ltr' },
  { code: 'lg', label: 'Luganda',   english: 'Luganda',  dir: 'ltr' },
];

const BY_CODE = Object.fromEntries(LOCALES.map((l) => [l.code, l]));
const STORAGE_KEY = 'sokoni_locale';

/** Dictionaries are flat: 'nav.browse', not nested objects. */
export type Dict = Record<string, string>;

const loaders: Record<string, () => Promise<{ default: Dict }>> = {
  ar: () => import('./locales/ar'),
  fr: () => import('./locales/fr'),
  sw: () => import('./locales/sw'),
  tw: () => import('./locales/tw'),
  lg: () => import('./locales/lg'),
};

/**
 * First visit: honour the browser, but only for languages actually supported.
 * navigator.languages is ordered by preference, so the first match wins rather
 * than the last.
 */
function detect(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && BY_CODE[saved]) return saved;
  } catch { /* private mode: fall through to detection */ }

  const prefs = (navigator.languages?.length ? navigator.languages : [navigator.language]) || [];
  for (const p of prefs) {
    const base = String(p).toLowerCase().split('-')[0];
    if (BY_CODE[base]) return base;
  }
  return 'en';
}

interface Ctx {
  /** The locale actually in effect for the current surface. */
  locale: string;
  /** What the buyer chose, regardless of any scope override. */
  chosen: string;
  dir: Dir;
  meta: LocaleMeta;
  setLocale: (code: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Ready === the dictionary for `locale` has loaded. */
  ready: boolean;
  /**
   * Pins the surface to English/LTR regardless of the buyer's choice.
   * Used by the vendor and admin shells — see EnglishScope below.
   */
  setScopeEnglish: (on: boolean) => void;
}

const I18nCtx = createContext<Ctx>({
  locale: 'en', chosen: 'en', dir: 'ltr', meta: LOCALES[0],
  setLocale: () => {}, t: (k) => k, ready: true, setScopeEnglish: () => {},
});

export const useI18n = () => useContext(I18nCtx);
/** The common case. `const t = useT()` then `t('nav.browse')`. */
export const useT = () => useContext(I18nCtx).t;

export function I18nProvider({ children }: { children: ReactNode }) {
  const [chosen, setLocaleState] = useState<string>(() => detect());
  /**
   * Translation is a BUYER feature. Vendors and admins run the dashboards in
   * English, so those surfaces pin the locale rather than half-translating a
   * console — and, more importantly, rather than flipping an untranslated
   * dashboard into RTL and mirroring a layout nobody has checked.
   */
  const [scopeEnglish, setScopeEnglish] = useState(false);
  const locale = scopeEnglish ? 'en' : chosen;
  const [dict, setDict] = useState<Dict>(en);
  const [ready, setReady] = useState(locale === 'en');

  useEffect(() => {
    let cancelled = false;
    if (locale === 'en') { setDict(en); setReady(true); return; }
    setReady(false);
    loaders[locale]?.()
      .then((m) => { if (!cancelled) { setDict(m.default); setReady(true); } })
      // A missing or broken dictionary must not leave a blank site: fall back
      // to English rather than rendering raw keys at the visitor.
      .catch(() => { if (!cancelled) { setDict(en); setReady(true); } });
    return () => { cancelled = true; };
  }, [locale]);

  const meta = BY_CODE[locale] ?? LOCALES[0];

  /**
   * `lang` and `dir` live on <html>, not on a wrapper div. Screen readers,
   * the browser's own hyphenation and spellcheck, and `:dir()` selectors all
   * read the document element; setting it on a child fixes the visuals and
   * none of the rest.
   */
  useEffect(() => {
    const el = document.documentElement;
    el.lang = locale;
    el.dir = meta.dir;
    return () => { el.dir = 'ltr'; };
  }, [locale, meta.dir]);

  const setLocale = useCallback((code: string) => {
    if (!BY_CODE[code]) return;
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* private mode */ }
    setLocaleState(code);
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    // English is the fallback for any key a translator has not reached yet, so
    // a partially translated locale shows real English rather than 'nav.browse'.
    let s = dict[key] ?? en[key];

    if (s === undefined) {
      if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
      // Last resort: the tail of the key reads better than the whole path.
      return key.split('.').pop() ?? key;
    }

    if (vars) {
      // Simple plural support: "1 item | {{n}} items" picks by count.
      if (s.includes('|') && vars.count !== undefined) {
        const [one, many] = s.split('|');
        s = Number(vars.count) === 1 ? one.trim() : many.trim();
      }
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), String(v));
      }
    }
    return s;
  }, [dict]);

  const value = useMemo<Ctx>(
    () => ({ locale, chosen, dir: meta.dir, meta, setLocale, t, ready, setScopeEnglish }),
    [locale, chosen, meta, setLocale, t, ready]
  );

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}


/**
 * Pins whatever it is mounted inside to English and LTR.
 *
 * Mounted by the vendor and admin shells. It lives in the provider's state
 * rather than poking document.documentElement directly, because React runs
 * child effects before parent ones — a child writing to <html> would be
 * overwritten by the provider's own effect on the next render.
 */
export function EnglishScope() {
  const { setScopeEnglish } = useI18n();
  useEffect(() => {
    setScopeEnglish(true);
    return () => setScopeEnglish(false);
  }, [setScopeEnglish]);
  return null;
}
