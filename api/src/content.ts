/**
 * Published site copy: legal documents, operator/contact, announcement banner.
 * Admin drafts; the public GET only returns published pages. Clients keep bundled fallback.
 */
import { z } from 'zod';
import { one, query } from './db';
import { HttpError } from './utils';
import { DEFAULT_PAGES } from './contentDefaults';

export const CONTENT_SLUGS = ['terms', 'privacy', 'policy', 'faq'] as const;
export type ContentSlug = (typeof CONTENT_SLUGS)[number];

export type ContentBlock =
  | { t: 'h3'; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul'; items: { b?: string; text: string }[] };
export type ContentSection = { title: string; blocks: ContentBlock[] };

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
  announcementEnabled: boolean;
  announcementText: string;
  announcementHref: string;
};

export const DEFAULT_CONTACT: SiteContact = {
  operatorName: 'Sokoni Hub Retail and Business Support Platforms',
  operatorCR: '254111',
  operatorAddress: 'Doha, Qatar',
  supportEmail: 'support@sokonihub.qa',
  supportWhatsApp: '97466046431',
  supportDisplay: '+974 6604 6431',
  supportHours: '24 hours a day, 7 days a week',
  responseTime: '24 hours',
  siteUrl: 'https://sokonihub.qa',
  announcementEnabled: false,
  announcementText: '',
  announcementHref: '',
};

export const siteContactSchema = z.object({
  operatorName: z.string().trim().max(200),
  operatorCR: z.string().trim().max(80),
  operatorAddress: z.string().trim().max(300),
  supportEmail: z.string().trim().email().max(200),
  supportWhatsApp: z.string().trim().regex(/^\d{8,15}$/, 'WhatsApp must be digits only, country code included (e.g. 97466046431)'),
  supportDisplay: z.string().trim().max(40),
  supportHours: z.string().trim().max(120),
  responseTime: z.string().trim().max(80),
  siteUrl: z.string().trim().max(200),
  announcementEnabled: z.boolean(),
  announcementText: z.string().trim().max(280),
  announcementHref: z.string().trim().max(300),
});

export const pageDraftSchema = z.object({
  title: z.string().trim().min(2).max(160),
  subtitle: z.string().trim().max(400),
  markdown: z.string().min(1).max(100_000),
  version: z.string().trim().max(40),
  effective: z.string().trim().max(40),
});

const SLUGS = new Set<string>(CONTENT_SLUGS);

export function parseSlug(raw: string): ContentSlug {
  if (!SLUGS.has(raw)) throw new HttpError(404, 'Unknown document');
  return raw as ContentSlug;
}

/** Strip tags so a paste cannot inject HTML. Markdown only. */
export function sanitiseMarkdown(raw: string): string {
  return String(raw || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\u0000/g, '')
    .slice(0, 100_000);
}

export function markdownToSections(md: string): ContentSection[] {
  const lines = sanitiseMarkdown(md).replace(/\r\n/g, '\n').split('\n');
  const sections: ContentSection[] = [];
  let current: ContentSection | null = null;
  let para: string[] = [];
  let list: { b?: string; text: string }[] = [];

  const flushPara = () => {
    if (!current) return;
    const text = para.join(' ').trim();
    para = [];
    if (text) current.blocks.push({ t: 'p', text });
  };
  const flushList = () => {
    if (!current || !list.length) return;
    current.blocks.push({ t: 'ul', items: list });
    list = [];
  };
  const ensure = () => {
    if (current) return;
    current = { title: 'Overview', blocks: [] };
    sections.push(current);
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (/^##\s+/.test(trimmed) && !trimmed.startsWith('###')) {
      flushList(); flushPara();
      current = { title: trimmed.replace(/^##\s+/, ''), blocks: [] };
      sections.push(current);
      continue;
    }
    if (/^###\s+/.test(trimmed)) {
      flushList(); flushPara(); ensure();
      current!.blocks.push({ t: 'h3', text: trimmed.replace(/^###\s+/, '') });
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      flushPara(); ensure();
      const item = trimmed.replace(/^[-*]\s+/, '');
      const m = item.match(/^\*\*(.+?)\*\*:?\s*(.*)$/);
      if (m) list.push({ b: m[1], text: m[2] });
      else list.push({ text: item });
      continue;
    }
    if (!trimmed) {
      flushList(); flushPara();
      continue;
    }
    if (/^#\s+/.test(trimmed)) continue; // page title lives in the title field
    flushList();
    ensure();
    para.push(trimmed);
  }
  flushList(); flushPara();
  return sections.filter((s) => s.title || s.blocks.length);
}

function applyTokens(md: string, contact: SiteContact): string {
  return md
    .replaceAll('{{supportEmail}}', contact.supportEmail)
    .replaceAll('{{supportDisplay}}', contact.supportDisplay)
    .replaceAll('{{supportHours}}', contact.supportHours)
    .replaceAll('{{responseTime}}', contact.responseTime)
    .replaceAll('{{operatorName}}', contact.operatorName)
    .replaceAll('{{operatorCR}}', contact.operatorCR);
}

export function publicDocument(row: any, contact: SiteContact) {
  if (!row?.published_at || !row.published_markdown) return null;
  const markdown = applyTokens(row.published_markdown, contact);
  return {
    slug: row.slug as ContentSlug,
    title: row.published_title || 'Document',
    subtitle: row.published_subtitle || '',
    version: row.published_version || '',
    effective: row.published_effective || '',
    markdown,
    sections: markdownToSections(markdown),
    published_at: row.published_at,
  };
}

export function adminDocument(row: any) {
  const hasDraft = !!(row.draft_markdown || row.draft_title);
  return {
    slug: row.slug as ContentSlug,
    published: row.published_at
      ? {
          title: row.published_title || '',
          subtitle: row.published_subtitle || '',
          markdown: row.published_markdown || '',
          version: row.published_version || '',
          effective: row.published_effective || '',
          published_at: row.published_at,
        }
      : null,
    draft: hasDraft
      ? {
          title: row.draft_title ?? row.published_title ?? '',
          subtitle: row.draft_subtitle ?? row.published_subtitle ?? '',
          markdown: row.draft_markdown ?? row.published_markdown ?? '',
          version: row.draft_version ?? row.published_version ?? '',
          effective: row.draft_effective ?? row.published_effective ?? '',
          updated_at: row.draft_updated_at,
        }
      : null,
    editor: {
      title: row.draft_title ?? row.published_title ?? '',
      subtitle: row.draft_subtitle ?? row.published_subtitle ?? '',
      markdown: row.draft_markdown ?? row.published_markdown ?? '',
      version: row.draft_version ?? row.published_version ?? '',
      effective: row.draft_effective ?? row.published_effective ?? '',
    },
    updated_at: row.updated_at,
    has_draft: hasDraft,
  };
}

function asContact(raw: any): SiteContact {
  const merged = { ...DEFAULT_CONTACT, ...(raw && typeof raw === 'object' ? raw : {}) };
  const parsed = siteContactSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_CONTACT;
}

export async function loadContact(): Promise<SiteContact> {
  const row = await one<any>(`select value from system_settings where key = 'site_content'`).catch(() => null);
  return asContact(row?.value);
}

export async function saveContact(next: SiteContact): Promise<SiteContact> {
  const value = siteContactSchema.parse(next);
  if (value.announcementHref && !value.announcementHref.startsWith('/') && !value.announcementHref.startsWith('https://')) {
    value.announcementHref = '';
  }
  await query(
    `insert into system_settings (key, value, updated_at) values ('site_content', $1::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(value)],
  );
  return value;
}

export async function ensureSeeded() {
  const existing = await query<{ slug: string }>('select slug from content_pages');
  const have = new Set(existing.map((r) => r.slug));
  for (const page of DEFAULT_PAGES) {
    if (have.has(page.slug)) continue;
    await query(
      `insert into content_pages (
         slug, published_title, published_subtitle, published_markdown,
         published_version, published_effective, published_at, updated_at
       ) values ($1,$2,$3,$4,$5,$6,now(),now())
       on conflict (slug) do nothing`,
      [page.slug, page.title, page.subtitle, page.markdown, page.version, page.effective],
    );
  }
}

export async function listPages() {
  await ensureSeeded();
  return query<any>(`select * from content_pages order by slug`);
}

export async function getPage(slug: ContentSlug) {
  return one<any>(`select * from content_pages where slug = $1`, [slug]);
}

export async function saveDraft(slug: ContentSlug, body: z.infer<typeof pageDraftSchema>, userId: string) {
  const markdown = sanitiseMarkdown(body.markdown);
  const row = await one<any>(
    `insert into content_pages as p (slug, draft_title, draft_subtitle, draft_markdown, draft_version, draft_effective, draft_updated_at, updated_at, updated_by)
     values ($1,$2,$3,$4,$5,$6,now(),now(),$7)
     on conflict (slug) do update set
       draft_title = excluded.draft_title,
       draft_subtitle = excluded.draft_subtitle,
       draft_markdown = excluded.draft_markdown,
       draft_version = excluded.draft_version,
       draft_effective = excluded.draft_effective,
       draft_updated_at = now(),
       updated_at = now(),
       updated_by = excluded.updated_by
     returning *`,
    [slug, body.title, body.subtitle, markdown, body.version, body.effective, userId],
  );
  return row;
}

export async function publishPage(slug: ContentSlug, userId: string) {
  const existing = await getPage(slug);
  if (!existing) throw new HttpError(404, 'Save a draft first');
  const title = existing.draft_title ?? existing.published_title;
  const subtitle = existing.draft_subtitle ?? existing.published_subtitle ?? '';
  const markdown = existing.draft_markdown ?? existing.published_markdown;
  const version = existing.draft_version ?? existing.published_version ?? '';
  const effective = existing.draft_effective ?? existing.published_effective ?? '';
  if (!title || !markdown) throw new HttpError(422, 'Publish needs a title and body');
  if (!version || !effective) throw new HttpError(422, 'Set a version and effective date before publishing (needed for the legal record).');
  return one<any>(
    `update content_pages set
       published_title = $2,
       published_subtitle = $3,
       published_markdown = $4,
       published_version = $5,
       published_effective = $6,
       published_at = now(),
       draft_title = null,
       draft_subtitle = null,
       draft_markdown = null,
       draft_version = null,
       draft_effective = null,
       draft_updated_at = null,
       updated_at = now(),
       updated_by = $7
     where slug = $1
     returning *`,
    [slug, title, subtitle, sanitiseMarkdown(markdown), version, effective, userId],
  );
}

export async function discardDraft(slug: ContentSlug, userId: string) {
  const existing = await getPage(slug);
  if (!existing) throw new HttpError(404, 'Nothing to discard');
  return one<any>(
    `update content_pages set
       draft_title = null, draft_subtitle = null, draft_markdown = null,
       draft_version = null, draft_effective = null, draft_updated_at = null,
       updated_at = now(), updated_by = $2
     where slug = $1
     returning *`,
    [slug, userId],
  );
}

export async function publicPayload() {
  const contact = await loadContact();
  const pages = await listPages().catch(() => []);
  const documents: Record<string, ReturnType<typeof publicDocument>> = {};
  for (const slug of CONTENT_SLUGS) {
    const row = pages.find((p) => p.slug === slug);
    const doc = publicDocument(row, contact);
    if (doc) documents[slug] = doc;
  }
  return {
    contact: {
      operatorName: contact.operatorName,
      operatorCR: contact.operatorCR,
      operatorAddress: contact.operatorAddress,
      supportEmail: contact.supportEmail,
      supportWhatsApp: contact.supportWhatsApp,
      supportDisplay: contact.supportDisplay,
      supportHours: contact.supportHours,
      responseTime: contact.responseTime,
      siteUrl: contact.siteUrl,
    },
    announcement: contact.announcementEnabled && contact.announcementText
      ? { text: contact.announcementText, href: contact.announcementHref || null }
      : null,
    documents,
  };
}
