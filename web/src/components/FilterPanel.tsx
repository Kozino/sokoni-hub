import { ReactNode, useId, useState } from 'react';
import { useT } from '../i18n';

interface Props {
  /** Always-visible row: usually the search input and its submit button. */
  top?: ReactNode;
  /** The filters themselves. Hidden until the user opens the panel. */
  children: ReactNode;
  /** Number of filters currently applied, shown as a badge on the toggle. */
  activeCount?: number;
  /** Extra content pinned to the end of the open panel (e.g. a "Clear" button). */
  footer?: ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  className?: string;
}

/**
 * Filter bar that stays out of the way: a search row plus a "Filters" button
 * (icon + chevron). Clicking the button opens the full set of filters.
 */
export default function FilterPanel({ top, children, activeCount = 0, footer, onSubmit, className = '' }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <form className={`fp ${className}`} onSubmit={onSubmit}>
      <div className="fp-top">
        {top}
        <button
          type="button"
          className={`fp-toggle${open ? ' open' : ''}${activeCount > 0 ? ' has-active' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
        >
          <svg className="fp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 5h18M6 12h12M10 19h4" />
          </svg>
          <span className="fp-label">{t('browse.filters')}</span>
          {activeCount > 0 && <span className="fp-count" aria-label={`${activeCount} active`}>{activeCount}</span>}
          <svg className="fp-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="fp-panel" id={panelId}>
          <div className="fp-grid">{children}</div>
          {footer && <div className="fp-footer">{footer}</div>}
        </div>
      )}
    </form>
  );
}
