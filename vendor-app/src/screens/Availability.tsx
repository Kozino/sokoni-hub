import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { api, ApiError } from '../api';
import { Button, Notice } from '../components/AuthUI';
import { C } from '../theme';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Settings = {
  auto_accept: boolean;
  offers_at_vendor: boolean;
  offers_home_service: boolean;
  home_service_notes?: string | null;
  cancel_notice_hours: number;
  buffer_mins: number;
  slot_step_mins: number;
  min_notice_hours: number;
  max_advance_days: number;
};
type Hour = { id?: string; weekday: number; opens: string; closes: string };
type TimeOff = { id: string; starts_at: string; ends_at: string; reason?: string | null };

// Booking times are Doha time (UTC+3), so entered times are sent with that offset.
const qatarIso = (date: string, time: string) => `${date}T${time}:00+03:00`;
const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Qatar' });

export function Availability() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hours, setHours] = useState<Hour[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [configured, setConfigured] = useState(true);
  const [minNotice, setMinNotice] = useState('');
  const [maxAdvance, setMaxAdvance] = useState('');
  const [buffer, setBuffer] = useState('');
  // Time-off form
  const [fromD, setFromD] = useState('');
  const [fromT, setFromT] = useState('');
  const [toD, setToD] = useState('');
  const [toT, setToT] = useState('');
  const [offReason, setOffReason] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ settings: Settings; configured: boolean; hours: Hour[]; time_off: TimeOff[] }>('/bookings/vendor/availability');
      setSettings(r.settings);
      setHours(r.hours.map((h) => ({ ...h })));
      setTimeOff(r.time_off);
      setConfigured(r.configured);
      setMinNotice(String(r.settings.min_notice_hours));
      setMaxAdvance(String(r.settings.max_advance_days));
      setBuffer(String(r.settings.buffer_mins));
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Could not load availability.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !settings) return <ActivityIndicator color={C.primary} style={{ marginTop: 32 }} />;

  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });
  const updateHour = (i: number, patch: Partial<Hour>) => setHours(hours.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));

  const hourProblem = hours.find((h) => !HHMM.test(h.opens) || !HHMM.test(h.closes) || h.closes <= h.opens);
  const serviceProblem = !settings.offers_at_vendor && !settings.offers_home_service;
  const numbersOk = [minNotice, maxAdvance, buffer].every((v) => /^\d+$/.test(v));

  const saveSettings = async () => {
    if (serviceProblem) return setError('Choose at least one service location.');
    if (hourProblem) return setError('Each opening time needs a valid start and end, with the end after the start.');
    if (!numbersOk) return setError('Notice, advance days and buffer must be whole numbers.');
    setSaving(true);
    setError('');
    setSaved('');
    try {
      await api.put('/bookings/vendor/availability', {
        settings: {
          auto_accept: settings.auto_accept,
          offers_at_vendor: settings.offers_at_vendor,
          offers_home_service: settings.offers_home_service,
          home_service_notes: settings.home_service_notes ?? null,
          cancel_notice_hours: settings.cancel_notice_hours,
          slot_step_mins: settings.slot_step_mins,
          min_notice_hours: Number(minNotice),
          max_advance_days: Number(maxAdvance),
          buffer_mins: Number(buffer),
        },
        hours: hours.map((h) => ({ weekday: h.weekday, opens: h.opens, closes: h.closes })),
      });
      setSaved('Availability saved.');
      await load();
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : 'Could not save availability.');
    } finally {
      setSaving(false);
    }
  };

  const addTimeOff = async () => {
    if (!DATE.test(fromD) || !DATE.test(toD) || !HHMM.test(fromT) || !HHMM.test(toT)) {
      return setError('Enter dates as YYYY-MM-DD and times as HH:MM.');
    }
    setError('');
    try {
      await api.post('/bookings/vendor/time-off', { starts_at: qatarIso(fromD, fromT), ends_at: qatarIso(toD, toT), reason: offReason.trim() || null });
      setFromD(''); setFromT(''); setToD(''); setToT(''); setOffReason('');
      await load();
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : 'Could not add time off.');
    }
  };

  const removeTimeOff = (t: TimeOff) => {
    Alert.alert('Remove this time off?', 'Customers can book this time again.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/bookings/vendor/time-off/${t.id}`);
            await load();
          } catch (e: any) {
            setError(e?.message || 'Could not remove time off.');
          }
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      {!configured ? <Notice>Your booking calendar is not switched on yet. Set your hours below, then the website will show your slots.</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? <Notice>{saved}</Notice> : null}

      <Text style={styles.section}>Where you take bookings</Text>
      <Toggle label="At my location" value={settings.offers_at_vendor} onChange={(v) => set({ offers_at_vendor: v })} />
      <Toggle label="At the customer's home" value={settings.offers_home_service} onChange={(v) => set({ offers_home_service: v })} />

      <Text style={styles.section}>Bookings</Text>
      <Toggle label="Accept bookings automatically" value={settings.auto_accept} onChange={(v) => set({ auto_accept: v })} />
      <Field label="Minimum notice (hours)" value={minNotice} onChange={setMinNotice} />
      <Field label="How far ahead (days)" value={maxAdvance} onChange={setMaxAdvance} />
      <Field label="Gap between bookings (minutes)" value={buffer} onChange={setBuffer} />

      <Text style={styles.section}>Weekly hours</Text>
      {hours.length === 0 ? <Text style={styles.muted}>No hours set. Customers cannot book until you add some.</Text> : null}
      {hours.map((h, i) => (
        <View key={i} style={styles.hourRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Day: ${DAYS[h.weekday]}. Tap to change`}
            onPress={() => updateHour(i, { weekday: (h.weekday + 1) % 7 })}
            style={styles.dayBtn}
          >
            <Text style={styles.dayText}>{DAYS[h.weekday].slice(0, 3)}</Text>
          </Pressable>
          <TextInput accessibilityLabel="Opens" value={h.opens} onChangeText={(v) => updateHour(i, { opens: v })} placeholder="09:00" style={styles.timeInput} keyboardType="numbers-and-punctuation" maxLength={5} />
          <Text style={styles.muted}>to</Text>
          <TextInput accessibilityLabel="Closes" value={h.closes} onChangeText={(v) => updateHour(i, { closes: v })} placeholder="17:00" style={styles.timeInput} keyboardType="numbers-and-punctuation" maxLength={5} />
          <Pressable accessibilityRole="button" onPress={() => setHours(hours.filter((_, idx) => idx !== i))} style={styles.removeBtn}>
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      ))}
      <Button variant="secondary" onPress={() => setHours([...hours, { weekday: 1, opens: '09:00', closes: '17:00' }])}>Add hours</Button>

      <View style={{ marginTop: 12 }}>
        <Button loading={saving} onPress={saveSettings}>Save availability</Button>
      </View>

      <Text style={styles.section}>Time off</Text>
      {timeOff.length === 0 ? <Text style={styles.muted}>No time off planned.</Text> : null}
      {timeOff.map((t) => (
        <View key={t.id} style={styles.offRow}>
          <Text style={[styles.muted, { flex: 1 }]}>{fmt(t.starts_at)} – {fmt(t.ends_at)}{t.reason ? ` · ${t.reason}` : ''}</Text>
          <Pressable accessibilityRole="button" onPress={() => removeTimeOff(t)} style={styles.removeBtn}>
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      ))}
      <Text style={styles.muted}>Add a closure (Doha time)</Text>
      <View style={styles.hourRow}>
        <TextInput accessibilityLabel="From date" value={fromD} onChangeText={setFromD} placeholder="2026-10-25" style={[styles.timeInput, { flex: 2 }]} maxLength={10} />
        <TextInput accessibilityLabel="From time" value={fromT} onChangeText={setFromT} placeholder="09:00" style={styles.timeInput} maxLength={5} />
      </View>
      <View style={styles.hourRow}>
        <TextInput accessibilityLabel="To date" value={toD} onChangeText={setToD} placeholder="2026-10-25" style={[styles.timeInput, { flex: 2 }]} maxLength={10} />
        <TextInput accessibilityLabel="To time" value={toT} onChangeText={setToT} placeholder="17:00" style={styles.timeInput} maxLength={5} />
      </View>
      <TextInput accessibilityLabel="Reason" value={offReason} onChangeText={setOffReason} placeholder="Reason (optional)" style={styles.input} maxLength={200} />
      <Button variant="secondary" onPress={addTimeOff}>Add time off</Button>
    </ScrollView>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: C.primary }} />
    </View>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.toggle}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} keyboardType="number-pad" style={[styles.timeInput, { flex: 0, width: 80 }]} maxLength={4} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 10, paddingBottom: 40 },
  section: { marginTop: 14, fontWeight: '700', color: C.text, fontSize: 16 },
  muted: { color: C.muted, fontSize: 14 },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: C.border },
  toggleLabel: { color: C.text, fontSize: 15, flexShrink: 1, marginRight: 8 },
  hourRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 12, padding: 8, borderWidth: 1, borderColor: C.border },
  dayBtn: { minHeight: 44, minWidth: 56, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: C.primarySoft },
  dayText: { color: C.primary, fontWeight: '700' },
  timeInput: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, fontSize: 16, color: C.text, backgroundColor: C.surface },
  input: { minHeight: 44, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, color: C.text, backgroundColor: C.surface },
  removeBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  removeText: { color: C.danger, fontWeight: '600' },
  offRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: C.border },
});
