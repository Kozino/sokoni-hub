import { useEffect, useRef, useState } from 'react';
import { LOCALES, useI18n } from '../i18n';

/**
 * Language switcher.
 *
 * Each option is written in its own language — someone looking for Arabic
 * scans for "العربية", not for a row that says "Arabic" in English they may
 * not read. The English name sits alongside in smaller type so the list is
 * still usable by an admin or a support agent.
 *
 * A native <details> would have been shorter, but it cannot be closed by
 * Escape or by clicking away without the same listeners, and it announces
 * itself as a disclosure rather than a menu.
 */
export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, meta, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="lang" ref={box}>
      <button
        type="button"
        className={`lang-btn${compact ? ' compact' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('common.chooseLanguage')}
      >
        {/* A globe, not a flag. Languages are not countries — an Arabic flag
            would have to pick one of twenty-two, and Swahili none at all. */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
        </svg>
        <span className="lang-code">{meta.label}</span>
      </button>

      {open && (
        <ul className="lang-menu" role="listbox" aria-label={t('common.language')}>
          {LOCALES.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                role="option"
                aria-selected={l.code === locale}
                className={l.code === locale ? 'active' : ''}
                // lang/dir per option so a screen reader pronounces each name
                // in its own language instead of reading Arabic as English.
                lang={l.code}
                dir={l.dir}
                onClick={() => { setLocale(l.code); setOpen(false); }}
              >
                <span className="lang-native">{l.label}</span>
                <span className="lang-english">{l.english}</span>
                {l.code === locale && <span className="lang-tick" aria-hidden="true">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
