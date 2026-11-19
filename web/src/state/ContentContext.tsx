import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { legalConfig } from '../legalConfig';

export type SiteContact = {
  operatorName: string;
  operatorCR: string;
  operatorAddress: string;
  supportEmail: string;
  supportWhatsApp: string;
  supportDisplay: string;
  supportHours: string;
  responseTime: string;
  siteUrl: string;
};

export type PublishedDoc = {
  slug: string;
  title: string;
  subtitle: string;
  version: string;
  effective: string;
  markdown: string;
  published_at: string;
};

export type Announcement = { text: string; href: string | null };

type ContentState = {
  contact: SiteContact;
  announcement: Announcement | null;
  documents: Partial<Record<'terms' | 'privacy' | 'policy' | 'faq', PublishedDoc>>;
  ready: boolean;
};

const fallbackContact: SiteContact = {
  operatorName: legalConfig.operatorName,
  operatorCR: legalConfig.operatorCR,
  operatorAddress: legalConfig.operatorAddress,
  supportEmail: legalConfig.supportEmail,
  supportWhatsApp: legalConfig.supportWhatsApp,
  supportDisplay: legalConfig.supportDisplay,
  supportHours: legalConfig.supportHours,
  responseTime: legalConfig.responseTime,
  siteUrl: legalConfig.siteUrl,
};

const Ctx = createContext<ContentState>({
  contact: fallbackContact,
  announcement: null,
  documents: {},
  ready: false,
});

export const useSiteContent = () => useContext(Ctx);

export function ContentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ContentState>({
    contact: fallbackContact,
    announcement: null,
    documents: {},
    ready: false,
  });

  useEffect(() => {
    let cancelled = false;
    api.get<{
      contact: SiteContact;
      announcement: Announcement | null;
      documents: ContentState['documents'];
    }>('/content')
      .then((r) => {
        if (cancelled) return;
        setState({
          contact: { ...fallbackContact, ...r.contact },
          announcement: r.announcement,
          documents: r.documents || {},
          ready: true,
        });
      })
      .catch(() => {
        if (!cancelled) setState((old) => ({ ...old, ready: true }));
      });
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => state, [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
