import { ReactNode } from 'react';

/**
 * Minimal 24px line-icon set (1.75 stroke, round caps) used by the dashboard
 * navigation. Emoji were replaced with these so icon weight, size and optical
 * alignment stay consistent across platforms and both themes.
 */
const wrap = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IconChart     = wrap(<><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></>);
export const IconShield    = wrap(<><path d="M12 3l7 3v6c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V6z" /><path d="M9.2 12.2l1.9 1.9 3.7-3.9" /></>);
export const IconBox       = wrap(<><path d="M21 8.5L12 3 3 8.5v7L12 21l9-5.5z" /><path d="M3 8.5L12 14l9-5.5M12 14v7" /></>);
export const IconReceipt   = wrap(<><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" /><path d="M9 7h6M9 11h6M9 15h4" /></>);
export const IconAlert     = wrap(<><path d="M10.3 3.9L2.5 17.2A1.9 1.9 0 0 0 4.2 20h15.6a1.9 1.9 0 0 0 1.7-2.8L13.7 3.9a1.9 1.9 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>);
export const IconUsers     = wrap(<><path d="M16 20v-1.8a3.6 3.6 0 0 0-3.6-3.6H6.6A3.6 3.6 0 0 0 3 18.2V20" /><circle cx="9.5" cy="7.5" r="3.5" /><path d="M21 20v-1.8a3.6 3.6 0 0 0-2.7-3.5M16.5 4.2a3.6 3.6 0 0 1 0 6.9" /></>);
export const IconFolder    = wrap(<><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>);
export const IconHistory   = wrap(<><path d="M3 12a9 9 0 1 0 2.6-6.4" /><path d="M3 4v4h4" /><path d="M12 7.5V12l3 2" /></>);
export const IconPlus      = wrap(<><path d="M12 5v14M5 12h14" /></>);
export const IconStore     = wrap(<><path d="M4 9.5V20h16V9.5" /><path d="M3 4h18l1 5.5a3 3 0 0 1-5.7 1.3 3 3 0 0 1-5.3 0 3 3 0 0 1-5.7-1.3z" /><path d="M9.5 20v-5h5v5" /></>);
export const IconGrid      = wrap(<><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>);
export const IconInbox     = wrap(<><path d="M3 12h5l1.5 2.5h5L16 12h5" /><path d="M4.6 5.5L3 12v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6l-1.6-6.5A2 2 0 0 0 17.5 4h-11a2 2 0 0 0-1.9 1.5z" /></>);
export const IconCheck     = wrap(<><path d="M20 6L9 17l-5-5" /></>);
export const IconSearch    = wrap(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>);
export const IconBell      = wrap(<><path d="M6 8a6 6 0 1 1 12 0c0 4.2 1.4 5.6 2 6.2H4c.6-.6 2-2 2-6.2z" /><path d="M9.5 20a2.5 2.5 0 0 0 5 0" /></>);
export const IconSettings  = wrap(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9V9c.1.7.6 1.3 1.6 1.6h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z" /></>);
export const IconChevronUp   = wrap(<path d="M6 15l6-6 6 6" />);
export const IconChevronDown = wrap(<path d="M6 9l6 6 6-6" />);
export const IconColumns   = wrap(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></>);
export const IconDownload  = wrap(<><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 19h16" /></>);
export const IconX         = wrap(<path d="M18 6L6 18M6 6l12 12" />);
