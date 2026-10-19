import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Alert, Modal } from '../../components/ui';
import { dateTime } from '../../lib/format';

type Dispute = {
  id: string;
  code: string;
  total: number;
  currency: string;
  business_name: string;
  contact_name: string;
  contact_phone: string;
  delivery_address: string;
  dispute_reason: string;
  disputed_at: string;
  verify_by: string | null;
  delivery_proof_url: string | null;
  drop_distance_m: number | null;
  driver_name: string | null;
  driver_phone: string | null;
};

type Settings = { auto_complete_hours: number; geofence_metres: number };

const errorOf = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message : fallback);

export function AdminDisputes() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [settings, setSettings] = useState<Settings>({ auto_complete_hours: 24, geofence_metres: 150 });
  const [savedSettings, setSavedSettings] = useState<Settings>({ auto_complete_hours: 24, geofence_metres: 150 });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [decision, setDecision] = useState<{ dispute: Dispute; action: 'release' | 'cancel' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [list, cfg] = await Promise.all([
        api.get<{ disputes: Dispute[] }>('/admin/orders/disputes'),
        api.get<{ settings: Settings }>('/admin/delivery-verification'),
      ]);
      setDisputes(list.disputes);
      setSettings(cfg.settings);
      setSavedSettings(cfg.settings);
      setErr('');
    } catch (e) {
      setErr(errorOf(e, 'Failed to load disputes'));
    }
  };

  useEffect(() => { void load(); }, []);

  const submitDecision = async () => {
    if (!decision) return;
    setBusy(true);
    try {
      await api.post(`/admin/orders/${decision.dispute.id}/resolve`, { action: decision.action, note: note.trim() || undefined });
      setMsg(decision.action === 'release' ? `Order ${decision.dispute.code} released and settled.` : `Order ${decision.dispute.code} cancelled and restocked.`);
      setDecision(null);
      setNote('');
      await load();
    } catch (e) {
      setErr(errorOf(e, 'Could not record the decision'));
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      const res = await api.put<{ settings: Settings }>('/admin/delivery-verification', settings);
      setSavedSettings(res.settings);
      setMsg('Delivery verification settings saved.');
      setErr('');
    } catch (e) {
      setErr(errorOf(e, 'Could not save the settings'));
    } finally {
      setBusy(false);
    }
  };

  const changed = JSON.stringify(settings) !== JSON.stringify(savedSettings);

  return (
    <div>
      <div className="row-between">
        <h2>Delivery disputes</h2>
      </div>
      <p style={{ color: 'var(--muted)' }}>
        Orders that the buyer reported before the confirmation window closed. Review the proof photo and the drop-off location, then release or cancel.
      </p>

      {err && <Alert kind="error">{err}</Alert>}
      {msg && <Alert kind="success">{msg}</Alert>}

      <div className="card mt-3">
        <div className="card-head"><h3>Reported orders ({disputes.length})</h3></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Order</th><th>Buyer</th><th>Problem</th><th>Drop-off</th><th>Action</th></tr>
            </thead>
            <tbody>
              {disputes.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>No reported orders</td></tr>
              )}
              {disputes.map((d) => (
                <tr key={d.id}>
                  <td>
                    <code>{d.code}</code><br/>
                    <small>{d.business_name}</small><br/>
                    <small>{d.currency} {Number(d.total).toFixed(2)}</small>
                  </td>
                  <td><strong>{d.contact_name}</strong><br/><small>{d.contact_phone}</small><br/><small>{d.delivery_address}</small></td>
                  <td style={{ maxWidth: 260 }}>
                    {d.dispute_reason}
                    <br/><small style={{ color: 'var(--muted)' }}>Reported {dateTime(d.disputed_at)}</small>
                  </td>
                  <td>
                    {d.delivery_proof_url ? <a href={d.delivery_proof_url} target="_blank" rel="noreferrer">View proof photo</a> : <small>No photo</small>}
                    <br/><small>{d.driver_name ? `Rider: ${d.driver_name}` : 'No rider'}</small>
                    <br/><small>{d.drop_distance_m != null ? `${Math.round(Number(d.drop_distance_m))} m from pin` : 'No GPS recorded'}</small>
                  </td>
                  <td style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => setDecision({ dispute: d, action: 'release' })}>Not upheld: release</button>
                    <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => setDecision({ dispute: d, action: 'cancel' })}>Cancel and restock</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-head"><h3>Verification rules</h3></div>
        <div style={{ padding: 16, display: 'grid', gap: 14, maxWidth: 520 }}>
          <label>
            <strong>Buyer confirmation window (hours)</strong>
            <input
              type="number" min={1} max={168} value={settings.auto_complete_hours}
              onChange={(e) => setSettings({ ...settings, auto_complete_hours: Number(e.target.value) })}
              style={{ display: 'block', marginTop: 6, width: 140 }}
            />
            <small style={{ color: 'var(--muted)' }}>After this time with no report, the order completes automatically and settles.</small>
          </label>
          <label>
            <strong>Drop-off geofence (metres)</strong>
            <input
              type="number" min={30} max={1000} value={settings.geofence_metres}
              onChange={(e) => setSettings({ ...settings, geofence_metres: Number(e.target.value) })}
              style={{ display: 'block', marginTop: 6, width: 140 }}
            />
            <small style={{ color: 'var(--muted)' }}>The rider must be within this distance of the buyer's confirmed pin to complete a delivery.</small>
          </label>
          <div>
            <button className="btn btn-primary" disabled={!changed || busy} onClick={() => void saveSettings()}>Save rules</button>
          </div>
        </div>
      </div>

      <Modal
        open={!!decision}
        title={decision?.action === 'release' ? 'Release this order?' : 'Cancel this order?'}
        onClose={() => setDecision(null)}
        footer={decision ? (
          <>
            <button className="btn btn-ghost" onClick={() => setDecision(null)}>Back</button>
            <button
              className={decision.action === 'release' ? 'btn btn-primary' : 'btn btn-danger'}
              disabled={busy}
              onClick={() => void submitDecision()}
            >
              {decision.action === 'release' ? 'Release and settle' : 'Cancel and restock'}
            </button>
          </>
        ) : null}
      >
        {decision && (
          <>
            <p>
              {decision.action === 'release'
                ? 'The order will complete and be included in the vendor statement. Use this when the problem report is not upheld.'
                : 'The order will be cancelled and its stock returned. Refunds are handled outside the app.'}
            </p>
            <label>
              <strong>Note (optional)</strong>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} style={{ display: 'block', width: '100%', marginTop: 6 }} />
            </label>
          </>
        )}
      </Modal>
    </div>
  );
}
