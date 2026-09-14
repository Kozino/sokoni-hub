import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError, qs } from '../../lib/api';
import { date, dateTime } from '../../lib/format';
import { Alert, Empty, Modal, Spinner, StatusBadge, Tabs } from '../../components/ui';
import { useToast } from '../../state/ToastContext';
import type { Vendor } from '../../types';

const TABS = [
  { id: 'pending', label: 'Pending' }, { id: 'verified', label: 'Verified' },
  { id: 'rejected', label: 'Rejected' }, { id: 'suspended', label: 'Suspended' }, { id: '', label: 'All' },
];

export default function AdminVendors() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'pending';
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [action, setAction] = useState<'reject' | 'suspend' | null>(null);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const { push } = useToast();

  const load = () => {
    setLoading(true);
    api.get<{ vendors: Vendor[] }>(`/admin/vendors${qs({ status, q })}`)
      .then((r) => setVendors(r.vendors)).catch(() => setVendors([])).finally(() => setLoading(false));
  };
  useEffect(load, [status]);

  const open = async (id: string) => {
    setDetail(null); setErr('');
    try { setDetail((await api.get<any>(`/admin/vendors/${id}`)).vendor); }
    catch (e) { push('Could not load vendor', 'error'); }
  };

  const act = async (path: string, body?: any, msg = 'Done') => {
    try {
      await api.post(`/admin/vendors/${detail.id}/${path}`, body);
      push(msg, 'success'); setDetail(null); setAction(null); setReason(''); load();
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Action failed'); }
  };

  return (
    <>
      <div className="dash-title"><h1>Vendor verification</h1><p>Approve, reject or suspend stores. Nothing goes live without your approval.</p></div>

      <Tabs value={status} onChange={(v) => setParams(v ? { status: v } : {})} tabs={TABS as any} />

      <form className="filters" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input placeholder="Search business, owner or phone…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
        <button className="btn btn-primary btn-sm">Search</button>
      </form>

      {loading ? <Spinner /> : vendors.length === 0 ? (
        <Empty icon="🛡️" title={`No ${status || ''} vendors`} text="Nothing to review right now." />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Business</th><th>Owner</th><th>Location</th><th>WhatsApp</th><th>Listings</th><th>Complaints</th><th>Status</th><th>Applied</th><th></th></tr></thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td>
                    <div className="row" style={{ gap: 9 }}>
                      <div className="avatar" style={{ width: 34, height: 34, fontSize: '.9rem' }}>
                        {v.logo_url ? <img src={v.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} /> : v.business_name[0]}
                      </div>
                      <span className="td-strong">{v.business_name}</span>
                    </div>
                  </td>
                  <td>{v.owner_name}<div style={{ fontSize: '.76rem', color: 'var(--muted)' }}>{v.owner_phone}</div></td>
                  <td>{v.city}, {v.country}</td>
                  <td className="td-mono" style={{ fontSize: '.8rem' }}>{v.whatsapp}</td>
                  <td>{v.listings as number}</td>
                  <td style={{ color: (v.open_complaints ?? 0) > 0 ? 'var(--danger)' : undefined, fontWeight: (v.open_complaints ?? 0) > 0 ? 700 : 400 }}>{v.open_complaints}</td>
                  <td><StatusBadge status={v.status} /></td>
                  <td style={{ fontSize: '.8rem' }}>{date(v.created_at)}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => open(v.id)}>Review</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!detail} title={detail?.business_name ?? ''} onClose={() => { setDetail(null); setAction(null); }}
        footer={detail && !action ? (
          <>
            {detail.status !== 'verified' && <button className="btn btn-green" onClick={() => act(detail.status === 'suspended' ? 'reinstate' : 'verify', undefined, 'Vendor verified')}>✓ Verify &amp; publish</button>}
            {detail.status !== 'rejected' && <button className="btn btn-outline" onClick={() => setAction('reject')}>Reject</button>}
            {detail.status === 'verified' && <button className="btn btn-danger" onClick={() => setAction('suspend')}>Suspend</button>}
          </>
        ) : action ? (
          <>
            <button className="btn btn-ghost" onClick={() => setAction(null)}>Back</button>
            <button className="btn btn-danger" disabled={action === 'reject' && reason.trim().length < 3}
              onClick={() => act(action, { reason }, action === 'reject' ? 'Vendor rejected' : 'Vendor suspended')}>
              Confirm {action}
            </button>
          </>
        ) : null}>
        {detail && (
          <>
            <Alert kind="error">{err}</Alert>
            {action ? (
              <div className="field">
                <label>Reason {action === 'reject' ? '*' : '(optional)'}</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder={action === 'reject' ? 'e.g. ID document is unreadable — please re-upload a clear photo.' : 'e.g. Repeated complaints about undelivered orders.'} />
                <div className="hint">The vendor sees this message on their dashboard.</div>
              </div>
            ) : (
              <>
                <div className="row-between mb-2"><StatusBadge status={detail.status} /><span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Applied {dateTime(detail.created_at)}</span></div>
                <dl className="kv">
                  <dt>Owner</dt><dd>{detail.owner_name}</dd>
                  <dt>Phone</dt><dd>{detail.owner_phone}</dd>
                  <dt>Email</dt><dd>{detail.owner_email || '—'}</dd>
                  <dt>WhatsApp</dt><dd>{detail.whatsapp}</dd>
                  <dt>Location</dt><dd>{detail.city}, {detail.country}</dd>
                  <dt>Address</dt><dd>{detail.address || '—'}</dd>
                  <dt>Description</dt><dd>{detail.description || '—'}</dd>
                  <dt>Listings</dt><dd>{detail.listings.length}</dd>
                  <dt>Complaints</dt><dd>{detail.complaints.length}</dd>
                </dl>
                {detail.rejection_reason && <Alert kind="warn"><strong>Previous note:</strong> {detail.rejection_reason}</Alert>}
                <h4 className="mt-2">Verification documents</h4>
                <div className="gallery">
                  {detail.logo_url && <div className="g-item"><a href={detail.logo_url} target="_blank" rel="noreferrer"><img src={detail.logo_url} alt="Logo" /></a></div>}
                  {detail.id_document_url && (
                    /\.pdf$/i.test(detail.id_document_url)
                      ? <a className="btn btn-outline btn-sm" href={detail.id_document_url} target="_blank" rel="noreferrer">Open ID (PDF)</a>
                      : <div className="g-item"><a href={detail.id_document_url} target="_blank" rel="noreferrer"><img src={detail.id_document_url} alt="ID" /></a></div>
                  )}
                  {!detail.logo_url && !detail.id_document_url && <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>No documents uploaded</span>}
                </div>
                {detail.listings.length > 0 && (
                  <>
                    <h4 className="mt-3">Listings</h4>
                    <table className="tbl">
                      <tbody>
                        {detail.listings.slice(0, 10).map((l: any) => (
                          <tr key={l.id}><td>{l.title}</td><td style={{ textTransform: 'capitalize' }}>{l.kind}</td><td><StatusBadge status={l.status} /></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
