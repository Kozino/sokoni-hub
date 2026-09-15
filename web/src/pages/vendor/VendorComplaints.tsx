import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { Alert, Empty, Spinner, StatusBadge } from '../../components/ui';
import { useToast } from '../../state/ToastContext';
import type { Complaint, ComplaintMessage } from '../../types';

export default function VendorComplaints() {
  const [items, setItems] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const { push } = useToast();

  useEffect(() => {
    api.get<{ complaints: Complaint[] }>('/complaints/vendor')
      .then((r) => setItems(r.complaints)).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);

  const open = items.filter((c) => c.status === 'open' || c.status === 'investigating').length;

  const reply = async (c: Complaint) => {
    const body = (drafts[c.id] || '').trim();
    if (body.length < 2) return;
    setSending(c.id); setErr((e) => ({ ...e, [c.id]: '' }));
    try {
      const r = await api.post<{ message: ComplaintMessage; status: Complaint['status'] }>(
        `/complaints/${c.id}/messages`, { body }
      );
      setItems((prev) => prev.map((x) => x.id === c.id
        ? { ...x, status: r.status, messages: [...(x.messages || []), r.message] }
        : x));
      setDrafts((d) => ({ ...d, [c.id]: '' }));
      push('Reply sent to the admin', 'success');
    } catch (e) {
      setErr((prev) => ({ ...prev, [c.id]: e instanceof ApiError ? e.message : 'Could not send your reply' }));
    } finally { setSending(null); }
  };

  return (
    <>
      <div className="dash-title"><h1>Complaints</h1><p>Reports filed against your store. Admins mediate every case — tell your side and they'll take it into account.</p></div>

      {open > 0 && <Alert kind="warn"><strong>{open} open case{open === 1 ? '' : 's'}.</strong> Reply with your side quickly — repeated unresolved complaints can lead to suspension.</Alert>}

      {loading ? <Spinner /> : items.length === 0 ? (
        <Empty icon="✅" title="No complaints" text="Nothing has been reported against your store. Keep it up." />
      ) : (
        <div className="col">
          {items.map((c) => {
            const settled = c.status === 'resolved' || c.status === 'dismissed';
            return (
              <div key={c.id} className="card card-pad">
                <div className="row-between mb-1">
                  <div><strong style={{ color: 'var(--ink)' }}>{c.subject}</strong><div className="td-mono" style={{ fontSize: '.76rem', color: 'var(--muted)' }}>{c.code} · {dateTime(c.created_at)}</div></div>
                  <StatusBadge status={c.status} />
                </div>
                <p style={{ margin: 0, fontSize: '.9rem' }}>{c.body}</p>

                {!!c.messages?.length && (
                  <div className="complaint-thread">
                    {c.messages.map((m) => (
                      <div key={m.id} className={`complaint-msg ${m.author_role === 'vendor' ? 'mine' : 'theirs'}`}>
                        <div className="complaint-msg-meta">
                          <span>{m.author_role === 'vendor' ? 'You' : (m.author_name || 'Admin')}</span>
                          <time>{dateTime(m.created_at)}</time>
                        </div>
                        <div className="complaint-msg-body">{m.body}</div>
                      </div>
                    ))}
                  </div>
                )}

                {c.admin_note && <Alert kind="info"><strong>Admin's decision:</strong> {c.admin_note}</Alert>}
                {err[c.id] && <Alert kind="error">{err[c.id]}</Alert>}

                {settled ? (
                  <p className="hint" style={{ fontSize: '.78rem', color: 'var(--muted)', margin: 'var(--s-2) 0 0' }}>
                    This case is {c.status} — replies are closed.
                  </p>
                ) : (
                  <div className="complaint-reply mt-2">
                    <textarea
                      placeholder="Explain your side of the story…"
                      value={drafts[c.id] || ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) reply(c); }}
                    />
                    <button className="btn btn-primary" disabled={sending === c.id || (drafts[c.id] || '').trim().length < 2}
                      onClick={() => reply(c)}>
                      {sending === c.id ? 'Sending…' : 'Send reply'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
