import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { Spinner } from '../../components/ui';
import { useToast } from '../../state/ToastContext';
import { MarkdownDoc, MarkdownFaq } from '../../lib/markdown';

type Slug = 'terms' | 'privacy' | 'policy' | 'faq';

type Contact = {
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

type PageState = {
  slug: Slug;
  published: { title: string; version: string; effective: string; published_at: string } | null;
  has_draft: boolean;
  editor: { title: string; subtitle: string; markdown: string; version: string; effective: string };
};

const LABELS: Record<Slug, string> = {
  terms: 'Terms of use',
  privacy: 'Privacy policy',
  policy: 'Marketplace policy',
  faq: 'FAQ',
};

const TABS: Array<{ id: 'site' | Slug; label: string }> = [
  { id: 'site', label: 'Contact & banner' },
  { id: 'terms', label: 'Terms' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'policy', label: 'Policy' },
  { id: 'faq', label: 'FAQ' },
];

export function AdminContent() {
  const toast = useToast();
  const [tab, setTab] = useState<'site' | Slug>('site');
  const [contact, setContact] = useState<Contact | null>(null);
  const [pages, setPages] = useState<PageState[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = () => api.get<{ contact: Contact; pages: PageState[] }>('/admin/content')
    .then((r) => { setContact(r.contact); setPages(r.pages); setLoadError(''); })
    .catch((e) => {
      const msg = e instanceof ApiError ? e.message : 'Could not load content';
      setLoadError(msg);
      toast.push(msg, 'error');
    });

  useEffect(() => { void load(); }, []);

  const page = pages.find((p) => p.slug === tab);

  const setEditor = (patch: Partial<PageState['editor']>) => {
    if (tab === 'site') return;
    setPages((old) => old.map((p) => p.slug === tab ? { ...p, editor: { ...p.editor, ...patch } } : p));
  };

  const saveSite = async () => {
    if (!contact || busy) return;
    setBusy(true);
    try {
      const r = await api.put<{ contact: Contact }>('/admin/content/site', contact);
      setContact(r.contact);
      toast.push('Contact and banner saved. Live on web and app on the next fetch.', 'success');
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not save', 'error');
    } finally { setBusy(false); }
  };

  const saveDraft = async () => {
    if (!page || busy) return;
    setBusy(true);
    try {
      const r = await api.put<{ page: PageState }>(`/admin/content/pages/${page.slug}`, page.editor);
      setPages((old) => old.map((p) => p.slug === r.page.slug ? r.page : p));
      toast.push('Draft saved. Not public until you publish.', 'success');
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not save draft', 'error');
    } finally { setBusy(false); }
  };

  const publish = async () => {
    if (!page || busy) return;
    if (!window.confirm(`Publish ${LABELS[page.slug]} now? Buyers on web and in the app will see this version.`)) return;
    setBusy(true);
    try {
      await api.put(`/admin/content/pages/${page.slug}`, page.editor);
      const r = await api.post<{ page: PageState }>(`/admin/content/pages/${page.slug}/publish`, {});
      setPages((old) => old.map((p) => p.slug === r.page.slug ? r.page : p));
      toast.push('Published. Web and app will pick it up without a new build.', 'success');
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not publish', 'error');
    } finally { setBusy(false); }
  };

  const discard = async () => {
    if (!page || busy) return;
    if (!window.confirm('Discard the unpublished draft? The live page stays as it is.')) return;
    setBusy(true);
    try {
      const r = await api.post<{ page: PageState }>(`/admin/content/pages/${page.slug}/discard`, {});
      setPages((old) => old.map((p) => p.slug === r.page.slug ? r.page : p));
      toast.push('Draft discarded', 'success');
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not discard', 'error');
    } finally { setBusy(false); }
  };

  const setField = (key: keyof Contact) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!contact) return;
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setContact({ ...contact, [key]: value });
  };

  const editor = page?.editor;
  const previewBody = useMemo(() => editor?.markdown || '', [editor?.markdown]);

  if (!contact) {
    return loadError ? (
      <div className="card card-pad" style={{ maxWidth: 560 }}>
        <h1 style={{ marginTop: 0 }}>Content</h1>
        <p>{loadError}</p>
        <p style={{ color: 'var(--muted)' }}>If this is a new environment, run database migrations so <code>content_pages</code> exists, then retry.</p>
        <button type="button" className="btn btn-primary" onClick={() => void load()}>Retry</button>
      </div>
    ) : <Spinner />;
  }

  return (
    <div>
      <h1 style={{ margin: 0 }}>Content</h1>
      <p style={{ color: 'var(--muted)', margin: '4px 0 16px', maxWidth: 720 }}>
        Edit legal pages, support contact and a site banner. Publish to update the buyer website, vendor-facing legal links, and the mobile app without a new build. The app keeps a bundled copy if it is offline.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
            onClick={() => { setTab(t.id); setPreview(false); }}
          >
            {t.label}
            {t.id !== 'site' && pages.find((p) => p.slug === t.id)?.has_draft ? ' · draft' : ''}
          </button>
        ))}
      </div>

      {tab === 'site' && (
        <div className="card card-pad" style={{ maxWidth: 720 }}>
          <h3 style={{ marginTop: 0 }}>Operator & support</h3>
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>Shown on Terms, Privacy, Support, footer WhatsApp, and in the app.</p>
          <div className="form-row" style={{ display: 'grid', gap: 12 }}>
            <label>Operator name<input value={contact.operatorName} onChange={setField('operatorName')} /></label>
            <label>Commercial registration<input value={contact.operatorCR} onChange={setField('operatorCR')} /></label>
            <label>Address<input value={contact.operatorAddress} onChange={setField('operatorAddress')} /></label>
            <label>Support email<input type="email" value={contact.supportEmail} onChange={setField('supportEmail')} /></label>
            <label>WhatsApp (digits only, with country code)<input value={contact.supportWhatsApp} onChange={setField('supportWhatsApp')} placeholder="97466046431" /></label>
            <label>WhatsApp display<input value={contact.supportDisplay} onChange={setField('supportDisplay')} placeholder="+974 6604 6431" /></label>
            <label>Support hours<input value={contact.supportHours} onChange={setField('supportHours')} /></label>
            <label>Typical response time<input value={contact.responseTime} onChange={setField('responseTime')} /></label>
            <label>Public site URL<input value={contact.siteUrl} onChange={setField('siteUrl')} /></label>
          </div>

          <h3 style={{ marginTop: 24 }}>Announcement banner</h3>
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>Optional bar on the buyer website and the mobile home screen. Leave empty to hide.</p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
            <input type="checkbox" checked={contact.announcementEnabled} onChange={setField('announcementEnabled')} style={{ width: 18, height: 18, marginTop: 3 }} />
            <span>Show announcement</span>
          </label>
          <label>Banner text<textarea value={contact.announcementText} onChange={setField('announcementText')} maxLength={280} rows={3} /></label>
          <label>Optional link (internal path or https URL)<input value={contact.announcementHref} onChange={setField('announcementHref')} placeholder="/support" /></label>
          <button type="button" className="btn btn-primary mt-2" disabled={busy} onClick={() => void saveSite()}>{busy ? 'Saving…' : 'Save contact & banner'}</button>
        </div>
      )}

      {tab !== 'site' && editor && page && (
        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: 0 }}>{LABELS[page.slug]}</h3>
              <p style={{ color: 'var(--muted)', margin: '4px 0 0' }}>
                {page.published
                  ? `Live version ${page.published.version || '—'} · effective ${page.published.effective || '—'} · ${new Date(page.published.published_at).toLocaleString()}`
                  : 'Not published yet — buyers still see the copy bundled in the app/website.'}
                {page.has_draft ? ' · Unpublished draft waiting.' : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview((v) => !v)}>{preview ? 'Edit' : 'Preview'}</button>
              <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void saveDraft()}>Save draft</button>
              {page.has_draft ? <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void discard()}>Discard draft</button> : null}
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void publish()}>Publish</button>
            </div>
          </div>

          {preview ? (
            <div className="legal-content" style={{ marginTop: 16, maxWidth: 720 }}>
              <h2 style={{ marginTop: 0 }}>{editor.title}</h2>
              <p style={{ color: 'var(--muted)' }}>{editor.subtitle}</p>
              {page.slug === 'faq' ? <MarkdownFaq markdown={previewBody} /> : <MarkdownDoc markdown={previewBody} />}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
              <label>Title<input value={editor.title} onChange={(e) => setEditor({ title: e.target.value })} /></label>
              <label>Subtitle<input value={editor.subtitle} onChange={(e) => setEditor({ subtitle: e.target.value })} /></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label>Version<input value={editor.version} onChange={(e) => setEditor({ version: e.target.value })} placeholder="2026-10-01" /></label>
                <label>Effective date<input value={editor.effective} onChange={(e) => setEditor({ effective: e.target.value })} placeholder="1 October 2026" /></label>
              </div>
              <label>
                Body (Markdown: ## heading, ### subheading, - list, **bold**)
                <textarea value={editor.markdown} onChange={(e) => setEditor({ markdown: e.target.value })} rows={22} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.5 }} />
              </label>
              <p style={{ fontSize: '.82rem', color: 'var(--muted)', margin: 0 }}>
                Tokens you can paste: {'{{supportEmail}}'} {'{{supportDisplay}}'} {'{{supportHours}}'} {'{{responseTime}}'} {'{{operatorName}}'} {'{{operatorCR}}'}.
                They are filled from Contact & banner when the page is shown. HTML is stripped on save.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
