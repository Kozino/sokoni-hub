import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Alert, StatusBadge } from '../../components/ui';
import { dateTime } from '../../lib/format';

export function AdminDrivers() {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      const { drivers } = await api.get<{ drivers: any[] }>('/admin/drivers');
      setDrivers(drivers);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to load drivers');
    }
  };

  useEffect(() => { load(); }, []);

  const action = async (id: string, actionType: 'approve' | 'suspend') => {
    if (!window.confirm(`Are you sure you want to ${actionType} this driver?`)) return;
    try {
      await api.post(`/admin/drivers/${id}/${actionType}`, {});
      setMsg(`Driver ${actionType}d successfully`);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Action failed');
    }
  };

  const pending = drivers.filter(d => d.status === 'pending');
  const active = drivers.filter(d => d.status !== 'pending');

  return (
    <div>
      <div className="row-between">
        <h2>Delivery Fleet</h2>
      </div>
      <p style={{ color: 'var(--muted)' }}>Manage delivery riders, approve new applications, and view their online status.</p>

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
                  <td>
                    <button className="btn btn-primary btn-sm" onClick={() => action(d.id, 'approve')}>Approve Driver</button>
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
                  <td>
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
    </div>
  );
}
