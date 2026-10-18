import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Alert, Modal, StatusBadge } from '../../components/ui';
import { dateTime } from '../../lib/format';
import PrivateDocument from '../../components/PrivateDocument';

// Document keys saved by the driver app (drivers.documents jsonb).
const DOCUMENTS: { key: string; label: string }[] = [
  { key: 'licence', label: 'Driving licence' },
  { key: 'id_card', label: 'Valid ID (QID or passport)' },
  { key: 'vehicle_registration', label: 'Vehicle registration (Mulkiya)' },
];

export function AdminDrivers() {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState<any | null>(null);

  const load = async () => {
    try {
      const { drivers } = await api.get<{ drivers: any[] }>('/admin/drivers');
      setDrivers(drivers);
      setErr('');
      // Keep the open review panel in sync with fresh data.
      setSelected((current: any) => (current ? drivers.find((d) => d.id === current.id) ?? null : null));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to load drivers');
    }
  };

  useEffect(() => { load(); }, []);

  const action = async (id: string, actionType: 'approve' | 'suspend') => {
    if (!window.confirm(`Are you sure you want to ${actionType} this driver?`)) return;
    try {
      await api.post(`/admin/drivers/${id}/${actionType}`, {});
      setMsg(`Driver ${actionType === 'approve' ? 'approved' : 'suspended'} successfully`);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Action failed');
    }
  };

  const pending = drivers.filter(d => d.status === 'pending');
  const active = drivers.filter(d => d.status !== 'pending');

  const reviewButton = (d: any) => (
    <button className="btn btn-outline btn-sm" onClick={() => setSelected(d)}>Review</button>
  );

  return (
    <div>
      <div className="row-between">
        <h2>Delivery Fleet</h2>
      </div>
      <p style={{ color: 'var(--muted)' }}>Review rider applications and their documents before approving. Manage online status for approved riders.</p>

      {err && <Alert kind="error">{err}</Alert>}
      {msg && <Alert kind="success">{msg}</Alert>}

      <div className="card mt-3">
        <div className="card-head"><h3>New Driver Applications</h3></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Applied</th><th>Name & Phone</th><th>Vehicle</th><th>License Plate</th><th>Action</th></tr>
            </thead>
            <tbody>
              {pending.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>No pending applications</td></tr>}
              {pending.map(d => (
                <tr key={d.id}>
                  <td>{dateTime(d.created_at)}</td>
                  <td><strong>{d.full_name}</strong><br/><small>{d.phone}</small></td>
                  <td>{d.vehicle_type}</td>
                  <td><code style={{ fontSize: '0.85rem' }}>{d.license_plate}</code></td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {reviewButton(d)}
                    <button className="btn btn-primary btn-sm" onClick={() => action(d.id, 'approve')}>Approve</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-head"><h3>Active Fleet</h3></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Status</th><th>Name & Phone</th><th>Vehicle</th><th>License Plate</th><th>Action</th></tr>
            </thead>
            <tbody>
              {active.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>No drivers in the system</td></tr>}
              {active.map(d => (
                <tr key={d.id}>
                  <td>
                    <StatusBadge status={d.status} />
                    <div style={{ marginTop: 4, fontSize: '0.75rem', fontWeight: 'bold', color: d.is_online ? 'var(--green)' : 'var(--muted)' }}>
                      {d.is_online ? '🟢 ONLINE' : '⚪ OFFLINE'}
                    </div>
                  </td>
                  <td><strong>{d.full_name}</strong><br/><small>{d.phone}</small></td>
                  <td>{d.vehicle_type}</td>
                  <td><code style={{ fontSize: '0.85rem' }}>{d.license_plate}</code></td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {reviewButton(d)}
                    {d.status === 'approved' ? (
                      <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => action(d.id, 'suspend')}>Suspend</button>
                    ) : (
                      <button className="btn btn-outline btn-sm" onClick={() => action(d.id, 'approve')}>Reinstate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!selected}
        title={selected ? `Rider application: ${selected.full_name}` : ''}
        onClose={() => setSelected(null)}
        footer={selected ? (
          <>
            <button className="btn btn-ghost" onClick={() => setSelected(null)}>Close</button>
            {selected.status === 'approved' ? (
              <button className="btn btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => action(selected.id, 'suspend')}>Suspend</button>
            ) : (
              <button className="btn btn-primary" onClick={() => action(selected.id, 'approve')}>
                {selected.status === 'pending' ? 'Approve driver' : 'Reinstate'}
              </button>
            )}
          </>
        ) : null}
      >
        {selected && (
          <>
            <div className="row-between mb-2">
              <StatusBadge status={selected.status} />
              <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Applied {dateTime(selected.created_at)}</span>
            </div>

            <h4>Personal and vehicle</h4>
            <dl className="kv">
              <dt>Full name</dt><dd>{selected.full_name}</dd>
              <dt>Phone</dt><dd>{selected.phone}</dd>
              <dt>Email</dt><dd>{selected.email || '—'}</dd>
              <dt>Vehicle type</dt><dd>{selected.vehicle_type}</dd>
              <dt>License plate</dt><dd><code>{selected.license_plate}</code></dd>
              <dt>Online now</dt><dd>{selected.is_online ? 'Yes' : 'No'}</dd>
            </dl>

            <h4 className="mt-2">Documents</h4>
            <div className="gallery">
              {DOCUMENTS.map(({ key, label }) => {
                const value = selected.documents?.[key];
                return (
                  <div key={key} style={{ marginBottom: 12 }}>
                    <strong style={{ fontSize: '.85rem' }}>{label}</strong>
                    <div className="mt-1">
                      {value ? <PrivateDocument value={value} /> : <span style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>Not uploaded</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            {DOCUMENTS.some(({ key }) => !selected.documents?.[key]) && (
              <Alert kind="warn">Some documents are missing. Ask the rider to upload them from the driver app before approving.</Alert>
            )}

            <h4 className="mt-2">Bank details (for payouts)</h4>
            {selected.bank_iban || selected.bank_name ? (
              <dl className="kv">
                <dt>Bank</dt><dd>{selected.bank_name || '—'}</dd>
                <dt>Account name</dt><dd>{selected.bank_account_name || '—'}</dd>
                <dt>IBAN</dt><dd><code>{selected.bank_iban || '—'}</code></dd>
              </dl>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>Not added yet</span>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
