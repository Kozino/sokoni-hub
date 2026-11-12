import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../lib/api';
import { Spinner } from '../../components/ui';
import { useToast } from '../../state/ToastContext';

type AssistantAdmin = {
  enabled: boolean;
  voice_enabled: boolean;
  retention_days: number;
  llm_configured: boolean;
  stt_configured: boolean;
  llm_model: string | null;
  llm_base: string | null;
};

/**
 * Kill switch for Sokoni Assistant (Ask Sokoni).
 * Mirrors system_settings.assistant — the same flag the consumer API reads on every chat/STT call.
 */
export function AdminAssistant() {
  const toast = useToast();
  const [row, setRow] = useState<AssistantAdmin | null>(null);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState('90');

  const load = () => api.get<AssistantAdmin>('/admin/assistant')
    .then((r) => { setRow(r); setDays(String(r.retention_days)); })
    .catch(() => {});

  useEffect(() => { void load(); }, []);

  if (!row) return <Spinner />;

  const save = async (patch: Partial<Pick<AssistantAdmin, 'enabled' | 'voice_enabled' | 'retention_days'>>) => {
    if (busy) return;
    setBusy(true);
    try {
      const body = {
        enabled: patch.enabled ?? row.enabled,
        voice_enabled: patch.voice_enabled ?? row.voice_enabled,
        retention_days: patch.retention_days ?? row.retention_days,
      };
      const saved = await api.put<AssistantAdmin>('/admin/assistant', body);
      setRow(saved);
      setDays(String(saved.retention_days));
      toast.push('Ask Sokoni settings saved', 'success');
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not update Ask Sokoni', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: 'enabled' | 'voice_enabled') => {
    const next = !row[key];
    if (key === 'enabled' && !next) {
      const ok = window.confirm('Turn Ask Sokoni off for every buyer? Chat and voice will pause immediately. Catalogue search on Explore still works.');
      if (!ok) return;
    }
    void save({ [key]: next });
  };

  const saveDays = () => {
    const n = Number(days);
    if (!Number.isFinite(n) || n < 1 || n > 365) {
      toast.push('Retention must be between 1 and 365 days', 'error');
      return;
    }
    void save({ retention_days: Math.round(n) });
  };

  return (
    <div>
      <h1 style={{ margin: 0 }}>Ask Sokoni</h1>
      <p style={{ color: 'var(--muted)', margin: '4px 0 16px' }}>
        Kill switch for the consumer shopping assistant. Off means the helper pauses; buyers still browse, cart and check out themselves.
      </p>

      <div className="card card-pad" style={{ maxWidth: 640, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Assistant</h3>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          When this is off, the app shows “Assistant is paused” and <code>POST /api/assistant/chat</code> returns 503. Nothing is charged and no order is placed by the helper in either state.
        </p>
        <label style={rowStyle(row.enabled, busy)}>
          <input
            type="checkbox"
            checked={row.enabled}
            disabled={busy}
            onChange={() => toggle('enabled')}
            style={{ width: 18, height: 18, marginTop: 3 }}
          />
          <span>
            <strong>{row.enabled ? 'Ask Sokoni is on' : 'Ask Sokoni is off'}</strong>
            <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginTop: 4 }}>
              {row.enabled
                ? 'Buyers can search the live catalogue, add to cart and open Checkout. They always confirm the order.'
                : 'Chat is paused. Turn it back on when you are ready. Explore search is unaffected.'}
            </div>
          </span>
        </label>
      </div>

      <div className="card card-pad" style={{ maxWidth: 640, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Voice</h3>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Hold-to-talk. Audio is transcribed then discarded. Qatar all-party recording consent applies; the app asks before the microphone.
        </p>
        <label style={rowStyle(row.voice_enabled && row.enabled, busy)}>
          <input
            type="checkbox"
            checked={row.voice_enabled}
            disabled={busy || !row.enabled}
            onChange={() => toggle('voice_enabled')}
            style={{ width: 18, height: 18, marginTop: 3 }}
          />
          <span>
            <strong>{row.voice_enabled ? 'Voice is on' : 'Voice is off'}</strong>
            <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginTop: 4 }}>
              {row.stt_configured
                ? 'Whisper (or a compatible speech endpoint) is configured on the API host.'
                : 'No speech key on the API host — buyers can still type. Set ASSISTANT_LLM_KEY to enable hold-to-talk.'}
            </div>
          </span>
        </label>
      </div>

      <div className="card card-pad" style={{ maxWidth: 640, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Transcript retention</h3>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Qatar PDPPL: keep chats only as long as needed to run the helper, then delete. Buyers can also delete chats in Profile. Default 90 days.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            disabled={busy}
            style={{ width: 88, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)' }}
            aria-label="Retention days"
          />
          <span style={{ color: 'var(--muted)', fontSize: '.9rem' }}>days</span>
          <button className="btn" type="button" disabled={busy} onClick={saveDays}>Save retention</button>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 640 }}>
        <h3 style={{ marginTop: 0 }}>Hosted model (orchestrator)</h3>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Tool-calling and Whisper run only on the API host. Never put the key in the mobile app or a <code>VITE_</code> / <code>EXPO_PUBLIC_</code> variable.
        </p>
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 12px', fontSize: '.9rem' }}>
          <dt style={{ color: 'var(--muted)' }}>API key</dt>
          <dd style={{ margin: 0 }}>
            {row.llm_configured ? (
              <strong style={{ color: '#047857' }}>Configured on the API host</strong>
            ) : (
              <strong style={{ color: '#b45309' }}>Not set</strong>
            )}
          </dd>
          <dt style={{ color: 'var(--muted)' }}>Model</dt>
          <dd style={{ margin: 0 }}><code>{row.llm_model || 'gpt-4o-mini (default, unused until a key is set)'}</code></dd>
          <dt style={{ color: 'var(--muted)' }}>Endpoint</dt>
          <dd style={{ margin: 0 }}><code>{row.llm_base || 'https://api.openai.com/v1'}</code></dd>
        </dl>
        <ol style={{ margin: '14px 0 0', paddingLeft: 18, color: 'var(--muted)', fontSize: '.85rem', lineHeight: 1.55 }}>
          <li>Create a key at the OpenAI platform (or any OpenAI-compatible host: Azure OpenAI, Groq, Together, OpenRouter).</li>
          <li>On the API host (Render/env), set <code>ASSISTANT_LLM_KEY</code>. Optional: <code>ASSISTANT_LLM_MODEL</code>, <code>ASSISTANT_LLM_BASE_URL</code>.</li>
          <li>Without a key, Ask Sokoni still searches the live catalogue and quotes the cart on-server. It will not call a hosted model or transcribe voice.</li>
          <li>Apply migration <code>032_assistant.sql</code>. Rebuild the consumer app with EAS so <code>expo-av</code> / <code>expo-speech</code> are in the binary.</li>
        </ol>
      </div>
    </div>
  );
}

function rowStyle(active: boolean, busy: boolean): CSSProperties {
  return {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
    padding: '12px 14px',
    borderRadius: 10,
    border: `2px solid ${active ? '#047857' : 'var(--border, #e5e7eb)'}`,
    background: active ? 'rgba(4,120,87,.06)' : 'transparent',
    cursor: busy ? 'wait' : 'pointer',
  };
}
