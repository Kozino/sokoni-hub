import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { Alert, Empty, Spinner, StatusBadge } from '../../components/ui';
import type { Complaint } from '../../types';

export default function VendorComplaints() {
  const [items, setItems] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ complaints: Complaint[] }>('/complaints/vendor')
      .then((r) => setItems(r.complaints)).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);

  const open = items.filter((c) => c.status === 'open' || c.status === 'investigating').length;

  return (
    <>
      <div className="dash-title"><h1>Complaints</h1><p>Reports filed against your store. Admins mediate every case.</p></div>

      {open > 0 && <Alert kind="warn"><strong>{open} open case{open === 1 ? '' : 's'}.</strong> Resolve issues quickly — repeated unresolved complaints can lead to suspension.</Alert>}

      {loading ? <Spinner /> : items.length === 0 ? (
        <Empty icon="✅" title="No complaints" text="Nothing has been reported against your store. Keep it up." />
      ) : (
        <div className="col">
          {items.map((c) => (
            <div key={c.code} className="card card-pad">
              <div className="row-between mb-1">
                <div><strong style={{ color: 'var(--ink)' }}>{c.subject}</strong><div className="td-mono" style={{ fontSize: '.76rem', color: 'var(--muted)' }}>{c.code} · {dateTime(c.created_at)}</div></div>
                <StatusBadge status={c.status} />
              </div>
              <p style={{ margin: 0, fontSize: '.9rem' }}>{c.body}</p>
              {c.admin_note && <Alert kind="info"><strong>Admin note:</strong> {c.admin_note}</Alert>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
