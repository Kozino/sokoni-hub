import { api } from './api';
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP } from './config';
import { LEGAL_DOCS, LEGAL_OPERATOR, type LegalDoc } from './legalText';

export type SiteContact = {
  operatorName: string;
  operatorCR: string;
  operatorAddress: string;
  supportEmail: string;
  supportWhatsApp: string;
  supportDisplay: string;
  supportHours: string;
  responseTime: string;
};

export type RemoteDoc = {
  slug: 'terms' | 'privacy' | 'policy' | 'faq';
  title: string;
  subtitle: string;
  version: string;
  effective: string;
  sections: LegalDoc['sections'];
};

type Payload = {
  contact: SiteContact;
  announcement: { text: string; href: string | null } | null;
  documents: Partial<Record<RemoteDoc['slug'], RemoteDoc>>;
};

const fallbackContact: SiteContact = {
  operatorName: LEGAL_OPERATOR.operatorName,
  operatorCR: LEGAL_OPERATOR.registration,
  operatorAddress: 'Doha, Qatar',
  supportEmail: SUPPORT_EMAIL,
  supportWhatsApp: SUPPORT_WHATSAPP,
  supportDisplay: LEGAL_OPERATOR.display,
  supportHours: LEGAL_OPERATOR.hours,
  responseTime: LEGAL_OPERATOR.response,
};

let cache: Payload | null = null;
let fetchedAt = 0;
let inflight: Promise<Payload> | null = null;
const TTL_MS = 60_000;

const bundled: Payload = { contact: fallbackContact, announcement: null, documents: {} };

export async function loadSiteContent(): Promise<Payload> {
  if (cache && Date.now() - fetchedAt < TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = api.get<Payload>('/content')
    .then((r) => {
      cache = {
        contact: { ...fallbackContact, ...r.contact },
        announcement: r.announcement,
        documents: r.documents || {},
      };
      fetchedAt = Date.now();
      return cache;
    })
    .catch(() => cache || bundled)
    .finally(() => { inflight = null; });
  return inflight;
}

export function bundledDocs(): LegalDoc[] {
  return LEGAL_DOCS;
}

export function docsFromContent(payload: Payload): LegalDoc[] {
  return LEGAL_DOCS.map((bundled) => {
    const remote = payload.documents[bundled.key];
    if (!remote?.sections?.length) return bundled;
    return {
      key: bundled.key,
      title: remote.title || bundled.title,
      subtitle: remote.subtitle || bundled.subtitle,
      sections: remote.sections,
    };
  });
}

export function operatorFromContent(payload: Payload) {
  const c = payload.contact;
  const remoteTerms = payload.documents.terms;
  return {
    registration: c.operatorCR || LEGAL_OPERATOR.registration,
    operatorName: c.operatorName || LEGAL_OPERATOR.operatorName,
    email: c.supportEmail || SUPPORT_EMAIL,
    whatsapp: c.supportWhatsApp || SUPPORT_WHATSAPP,
    display: c.supportDisplay || LEGAL_OPERATOR.display,
    hours: c.supportHours || LEGAL_OPERATOR.hours,
    response: c.responseTime || LEGAL_OPERATOR.response,
    version: remoteTerms?.version || LEGAL_OPERATOR.version,
    effective: remoteTerms?.effective || LEGAL_OPERATOR.effective,
  };
}
