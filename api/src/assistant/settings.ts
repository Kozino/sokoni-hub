import { one, query } from '../db';

export type AssistantSettings = { enabled: boolean; retention_days: number; voice_enabled: boolean };

const DEFAULTS: AssistantSettings = { enabled: true, retention_days: 90, voice_enabled: true };

function normalize(value: Partial<AssistantSettings> = {}): AssistantSettings {
  const retention = Number(value.retention_days);
  return {
    enabled: value.enabled !== false,
    retention_days: Number.isFinite(retention) && retention >= 1 ? Math.min(Math.round(retention), 365) : DEFAULTS.retention_days,
    voice_enabled: value.voice_enabled !== false,
  };
}

export async function assistantSettings(): Promise<AssistantSettings> {
  const row = await one<{ value: Partial<AssistantSettings> }>("select value from system_settings where key='assistant'");
  return normalize(row?.value || {});
}

/** Persist the kill switch, voice flag and retention window. Takes effect on the next assistant request. */
export async function saveAssistantSettings(patch: Partial<AssistantSettings>): Promise<AssistantSettings> {
  const next = normalize({ ...(await assistantSettings()), ...patch });
  await query(
    `insert into system_settings (key, value, updated_at) values ('assistant', $1, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(next)],
  );
  return next;
}

/** Drop messages older than the retention window. Called from the API process, not a public route. */
export async function sweepAssistantTranscripts(): Promise<number> {
  const { retention_days } = await assistantSettings();
  const deleted = await query<{ id: string }>(
    `delete from assistant_messages where created_at < now() - ($1 || ' days')::interval returning id`,
    [String(retention_days)],
  );
  await query(`delete from assistant_threads where not exists (select 1 from assistant_messages m where m.thread_id = assistant_threads.id)`);
  return deleted.length;
}
