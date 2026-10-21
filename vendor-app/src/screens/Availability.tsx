import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError } from '../api';
import { Banner, Btn, Card, Icon, ScreenHeader, Stepper } from '../ui/kit';
import { C } from '../theme';
import { fw } from '../ui/type';

// Weekday numbers follow the API (0 = Sunday). The list is shown Monday first, as most Qatari businesses plan their week.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_PERIODS = 3;

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
type Period = { weekday: number; opens: string; closes: string };
type TimeOff = { id: string; starts_at: string; ends_at: string; reason?: string | null };

const pad = (n: number) => String(n).padStart(2, '0');
const hhmmToDate = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};
const dateToHHMM = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dateToYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shortDay = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtStored = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Qatar' });

/** Overlap and order checks for one day's periods. Returns an error message or null. */
function dayProblem(periods: Period[]): string | null {
  const sorted = [...periods].sort((a, b) => a.opens.localeCompare(b.opens));
  for (const p of sorted) {
    if (!HHMM.test(p.opens) || !HHMM.test(p.closes)) return 'Use a valid time for each period.';
    if (p.closes <= p.opens) return 'Closing time must be after opening time.';
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].opens < sorted[i - 1].closes) return 'Periods on the same day cannot overlap.';
  }
  return null;
}

/** The settings the API stores. Used by both Save and the instant auto-accept switch. */
const settingsBody = (s: Settings) => ({
  auto_accept: s.auto_accept,
  offers_at_vendor: s.offers_at_vendor,
  offers_home_service: s.offers_home_service,
  home_service_notes: s.home_service_notes ?? null,
  cancel_notice_hours: s.cancel_notice_hours,
  slot_step_mins: s.slot_step_mins,
  min_notice_hours: s.min_notice_hours,
  max_advance_days: s.max_advance_days,
  buffer_mins: s.buffer_mins,
});

type PickerState = { value: Date; mode: 'time' | 'date'; apply: (d: Date) => void } | null;

export function Availability() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [configured, setConfigured] = useState(true);
  const [baseline, setBaseline] = useState('');
  const [picker, setPicker] = useState<PickerState>(null);

  // Time-off form state
  const [fromDate, setFromDate] = useState(new Date());
  const [fromTime, setFromTime] = useState(hhmmToDate('09:00'));
  const [toDate, setToDate] = useState(new Date());
  const [toTime, setToTime] = useState(hhmmToDate('17:00'));
  const [offReason, setOffReason] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ settings: Settings; configured: boolean; hours: Period[]; time_off: TimeOff[] }>('/bookings/vendor/availability');
      setSettings(r.settings);
      setPeriods(r.hours.map((h) => ({ weekday: h.weekday, opens: h.opens, closes: h.closes })));
      setTimeOff(r.time_off);
      setConfigured(r.configured);
      setBaseline(JSON.stringify({ s: r.settings, h: r.hours }));
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

  const dirty = useMemo(() => !!settings && JSON.stringify({ s: settings, h: periods }) !== baseline, [settings, periods, baseline]);

  const dayErrors = useMemo(() => {
    const map: Record<number, string | null> = {};
    for (const d of DAY_ORDER) map[d] = dayProblem(periods.filter((p) => p.weekday === d));
    return map;
  }, [periods]);

  if (loading || !settings) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Availability" subtitle="Your booking calendar" />
        {error ? <View style={styles.pad}><Banner tone="error">{error}</Banner></View> : <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  const set = (patch: Partial<Settings>) => {
    setSaved(false);
    setSettings({ ...settings, ...patch });
  };
  const locationNone = !settings.offers_at_vendor && !settings.offers_home_service;
  const anyDayError = Object.values(dayErrors).some(Boolean);
  const canSave = dirty && !locationNone && !anyDayError && !saving;

  const isOpen = (d: number) => periods.some((p) => p.weekday === d);
  const dayPeriods = (d: number) => periods.filter((p) => p.weekday === d).sort((a, b) => a.opens.localeCompare(b.opens));

  const toggleDay = (d: number, open: boolean) => {
    setSaved(false);
    setPeriods(open ? [...periods, { weekday: d, opens: '09:00', closes: '17:00' }] : periods.filter((p) => p.weekday !== d));
  };
  const updatePeriod = (target: Period, patch: Partial<Period>) => {
    setSaved(false);
    setPeriods(periods.map((p) => (p === target ? { ...p, ...patch } : p)));
  };
  const removePeriod = (target: Period) => {
    setSaved(false);
    setPeriods(periods.filter((p) => p !== target));
  };
  const addPeriod = (d: number) => {
    const existing = dayPeriods(d);
    const last = existing[existing.length - 1];
    // Start the new period one hour after the last one closes, or use a sensible default.
    const opens = last && last.closes < '22:00' ? `${pad(Math.min(23, Number(last.closes.slice(0, 2)) + 1))}:00` : '09:00';
    const closes = opens < '21:00' ? `${pad(Number(opens.slice(0, 2)) + 4)}:00` : '23:00';
    setSaved(false);
    setPeriods([...periods, { weekday: d, opens, closes }]);
  };

  /**
   * Auto-accept saves straight away, so the web app and the database match the switch.
   * It sends the last saved hours and settings, so unsaved edits elsewhere on this screen are not published.
   */
  const toggleAutoAccept = async (value: boolean) => {
    const server = JSON.parse(baseline) as { s: Settings; h: Period[] };
    setError('');
    setSaved(false);
    setSettings((prev) => (prev ? { ...prev, auto_accept: value } : prev));
    setSaving(true);
    try {
      await api.put('/bookings/vendor/availability', {
        settings: { ...settingsBody(server.s), auto_accept: value },
        hours: server.h.map((p) => ({ weekday: p.weekday, opens: p.opens, closes: p.closes })),
      });
      setBaseline(JSON.stringify({ s: { ...server.s, auto_accept: value }, h: server.h }));
    } catch (e: any) {
      setSettings((prev) => (prev ? { ...prev, auto_accept: !value } : prev));
      setError(e instanceof ApiError ? e.message : 'Could not save the auto-accept setting. It is still off on the server. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await api.put('/bookings/vendor/availability', {
        settings: settingsBody(settings),
        hours: periods.map((p) => ({ weekday: p.weekday, opens: p.opens, closes: p.closes })),
      });
      setSaved(true);
      await load();
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : 'Could not save availability. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const addTimeOff = async () => {
    const startsIso = `${dateToYMD(fromDate)}T${dateToHHMM(fromTime)}:00+03:00`;
    const endsIso = `${dateToYMD(toDate)}T${dateToHHMM(toTime)}:00+03:00`;
    if (+new Date(endsIso) <= +new Date(startsIso)) {
      setError('The closure must end after it starts.');
      return;
    }
    setAdding(true);
    setError('');
    try {
      await api.post('/bookings/vendor/time-off', { starts_at: startsIso, ends_at: endsIso, reason: offReason.trim() || null });
      setOffReason('');
      await load();
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : 'Could not add the closure.');
    } finally {
      setAdding(false);
    }
  };

  const removeTimeOff = (t: TimeOff) => {
    Alert.alert('Remove this closure?', 'Customers will be able to book this time again.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/bookings/vendor/time-off/${t.id}`);
            await load();
          } catch (e: any) {
            setError(e?.message || 'Could not remove the closure.');
          }
        },
      },
    ]);
  };

  const openPicker = (value: Date, mode: 'time' | 'date', apply: (d: Date) => void) => setPicker({ value, mode, apply });

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Availability" subtitle={dirty ? 'Unsaved changes' : 'Your booking calendar'} />

      <ScrollView style={styles.frame} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!configured ? (
          <Banner tone="info" icon="information-circle">Your booking calendar is not switched on yet. Set your hours below, and customers will see your open slots.</Banner>
        ) : null}
        {error ? <Banner tone="error">{error}</Banner> : null}
        {saved && !dirty ? <Banner tone="success">Availability saved.</Banner> : null}

        <Section title="Where you take bookings">
          <Card padded={false}>
            <LocationOption icon="building-storefront" title="At my location" body="Customers come to your store." on={settings.offers_at_vendor} onPress={() => set({ offers_at_vendor: !settings.offers_at_vendor })} />
            <View style={styles.divider} />
            <LocationOption icon="home" title="At the customer's home" body="You visit the customer's address." on={settings.offers_home_service} onPress={() => set({ offers_home_service: !settings.offers_home_service })} />
          </Card>
          {locationNone ? <Banner tone="error">Choose at least one place to take bookings.</Banner> : null}
        </Section>

        <Section title="Booking rules">
          <Card padded={false}>
            <View style={styles.ruleRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.ruleTitle}>Accept bookings automatically</Text>
                <Text style={styles.ruleHelp}>Confirm straight away when the time is free. Saves as soon as you change it.</Text>
              </View>
              <Switch accessibilityLabel="Accept bookings automatically" value={settings.auto_accept} disabled={saving} onValueChange={(v) => void toggleAutoAccept(v)} trackColor={{ true: C.primary }} />
            </View>
            <View style={styles.divider} />
            <View style={styles.ruleRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.ruleTitle}>Minimum notice</Text>
                <Text style={styles.ruleHelp}>How soon before a visit a customer can book.</Text>
              </View>
              <Stepper label="Minimum notice" value={settings.min_notice_hours} min={0} max={72} unit="hours" onChange={(v) => set({ min_notice_hours: v })} />
            </View>
            <View style={styles.divider} />
            <View style={styles.ruleRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.ruleTitle}>Booking window</Text>
                <Text style={styles.ruleHelp}>How far ahead customers can book.</Text>
              </View>
              <Stepper label="Booking window" value={settings.max_advance_days} min={1} max={180} unit="days" onChange={(v) => set({ max_advance_days: v })} />
            </View>
            <View style={styles.divider} />
            <View style={styles.ruleRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.ruleTitle}>Gap between visits</Text>
                <Text style={styles.ruleHelp}>Time kept free after each booking.</Text>
              </View>
              <Stepper label="Gap between visits" value={settings.buffer_mins} min={0} max={120} step={5} unit="min" onChange={(v) => set({ buffer_mins: v })} />
            </View>
          </Card>
        </Section>

        <Section title="Weekly hours" hint={periods.length === 0 ? 'Customers cannot book until you open at least one day.' : undefined}>
          <Card padded={false}>
            {DAY_ORDER.map((d, idx) => {
              const open = isOpen(d);
              const own = dayPeriods(d);
              const err = dayErrors[d];
              return (
                <View key={d}>
                  <View style={styles.dayRow}>
                    <Text style={[styles.dayName, !open && { color: C.muted }]}>{DAY_NAME[d]}</Text>
                    <View style={{ flex: 1 }} />
                    <Text style={[styles.dayState, { color: open ? C.primary : C.muted }]}>{open ? 'Open' : 'Closed'}</Text>
                    <Switch accessibilityLabel={`${DAY_NAME[d]} open`} value={open} onValueChange={(v) => toggleDay(d, v)} trackColor={{ true: C.primary }} />
                  </View>
                  {open ? (
                    <View style={styles.periods}>
                      {own.map((p, i) => (
                        <View key={`${d}-${i}-${p.opens}-${p.closes}`} style={styles.periodRow}>
                          <TimeChip label="From" value={p.opens} onPress={() => openPicker(hhmmToDate(p.opens), 'time', (v) => updatePeriod(p, { opens: dateToHHMM(v) }))} />
                          <Text style={styles.to}>to</Text>
                          <TimeChip label="Until" value={p.closes} onPress={() => openPicker(hhmmToDate(p.closes), 'time', (v) => updatePeriod(p, { closes: dateToHHMM(v) }))} />
                          <View style={{ flex: 1 }} />
                          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${DAY_NAME[d]} period`} onPress={() => removePeriod(p)} style={styles.iconBtn}>
                            <Icon name="trash" size={18} color={C.dangerFg} />
                          </Pressable>
                        </View>
                      ))}
                      {own.length < MAX_PERIODS ? (
                        <Pressable accessibilityRole="button" onPress={() => addPeriod(d)} style={styles.addPeriod}>
                          <Icon name="plus" size={16} color={C.primary} />
                          <Text style={styles.addPeriodText}>Add another period</Text>
                        </Pressable>
                      ) : null}
                      {err ? <Text style={styles.dayError}>{err}</Text> : null}
                    </View>
                  ) : null}
                  {idx < DAY_ORDER.length - 1 ? <View style={styles.divider} /> : null}
                </View>
              );
            })}
          </Card>
        </Section>

        <Section title="Closures" hint="Closures are saved as soon as you add them.">
          {timeOff.length === 0 ? (
            <Card>
              <Text style={styles.muted}>No closures planned.</Text>
            </Card>
          ) : (
            <Card padded={false}>
              {timeOff.map((t, idx) => (
                <View key={t.id}>
                  <View style={styles.offRow}>
                    <View style={styles.offIcon}>
                      <Icon name="calendar-days" size={18} color={C.gold} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ruleTitle}>{fmtStored(t.starts_at)}</Text>
                      <Text style={styles.ruleHelp}>to {fmtStored(t.ends_at)}{t.reason ? ` · ${t.reason}` : ''}</Text>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel="Remove closure" onPress={() => removeTimeOff(t)} style={styles.iconBtn}>
                      <Icon name="trash" size={18} color={C.dangerFg} />
                    </Pressable>
                  </View>
                  {idx < timeOff.length - 1 ? <View style={styles.divider} /> : null}
                </View>
              ))}
            </Card>
          )}

          <Card>
            <Text style={styles.formTitle}>Add a closure</Text>
            <View style={styles.formRow}>
              <Text style={styles.formLabel}>From</Text>
              <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
                <DateChip label={shortDay(fromDate)} onPress={() => openPicker(fromDate, 'date', setFromDate)} />
                <TimeChip label="" value={dateToHHMM(fromTime)} onPress={() => openPicker(fromTime, 'time', setFromTime)} />
              </View>
            </View>
            <View style={styles.formRow}>
              <Text style={styles.formLabel}>Until</Text>
              <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
                <DateChip label={shortDay(toDate)} onPress={() => openPicker(toDate, 'date', setToDate)} />
                <TimeChip label="" value={dateToHHMM(toTime)} onPress={() => openPicker(toTime, 'time', setToTime)} />
              </View>
            </View>
            <TextInput accessibilityLabel="Reason" value={offReason} onChangeText={setOffReason} placeholder="Reason (optional), e.g. Public holiday" placeholderTextColor={C.muted} style={styles.input} maxLength={200} />
            <View style={{ marginTop: 12 }}>
              <Btn label="Add closure" variant="secondary" icon="plus" loading={adding} onPress={addTimeOff} />
            </View>
          </Card>
        </Section>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.saveBar}>
        <View style={styles.saveInner}>
          <Text style={[styles.saveHint, dirty && { color: C.goldText }]}>{dirty ? 'You have unsaved changes' : 'Everything is saved'}</Text>
          <View style={{ width: 170 }}>
            <Btn label="Save changes" icon="check" loading={saving} disabled={!canSave} onPress={save} />
          </View>
        </View>
      </SafeAreaView>

      <PickerSheet picker={picker} onClose={() => setPicker(null)} />
    </View>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function LocationOption({ icon, title, body, on, onPress }: { icon: 'building-storefront' | 'home'; title: string; body: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={title} onPress={onPress} style={styles.locRow}>
      <View style={[styles.locIcon, on && { backgroundColor: C.primary }]}>
        <Icon name={icon} size={20} color={on ? '#FFFFFF' : C.muted} solid={on} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.ruleTitle}>{title}</Text>
        <Text style={styles.ruleHelp}>{body}</Text>
      </View>
      <View style={[styles.check, on && styles.checkOn]}>{on ? <Icon name="check" size={14} color="#FFFFFF" /> : null}</View>
    </Pressable>
  );
}

function TimeChip({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label || 'Time'} ${value}`} onPress={onPress} style={styles.chipField}>
      {label ? <Text style={styles.chipLabel}>{label}</Text> : null}
      <View style={styles.chipValueRow}>
        <Icon name="clock" size={15} color={C.primary} />
        <Text style={styles.chipValue}>{value}</Text>
      </View>
    </Pressable>
  );
}

function DateChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Date ${label}`} onPress={onPress} style={[styles.chipField, { flex: 1 }]}>
      <View style={styles.chipValueRow}>
        <Icon name="calendar-days" size={15} color={C.primary} />
        <Text style={styles.chipValue}>{label}</Text>
      </View>
    </Pressable>
  );
}

/** One picker for the whole screen. iOS shows a bottom sheet with Done. Android shows the native dialog. */
function PickerSheet({ picker, onClose }: { picker: PickerState; onClose: () => void }) {
  const [draft, setDraft] = useState<Date | null>(null);
  useEffect(() => {
    setDraft(picker ? picker.value : null);
  }, [picker]);

  if (!picker || !draft) return null;

  if (Platform.OS === 'android') {
    return (
      <DateTimePicker
        value={draft}
        mode={picker.mode}
        display="default"
        is24Hour
        onChange={(event, date) => {
          onClose();
          if (event.type === 'set' && date) picker.apply(date);
        }}
      />
    );
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHead}>
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8}>
              <Text style={styles.pickerCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.pickerTitle}>{picker.mode === 'time' ? 'Choose time' : 'Choose date'}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                picker.apply(draft);
                onClose();
              }}
              hitSlop={8}
            >
              <Text style={styles.pickerDone}>Done</Text>
            </Pressable>
          </View>
          <DateTimePicker value={draft} mode={picker.mode} display="spinner" is24Hour minuteInterval={5} onChange={(_, date) => date && setDraft(date)} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  frame: { width: '100%', maxWidth: 760, alignSelf: 'center', flex: 1 },
  pad: { paddingHorizontal: 16, paddingTop: 12 },
  body: { padding: 16, gap: 22, paddingBottom: 24 },
  sectionTitle: { fontSize: 13, ...fw('800'), color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: 4 },
  hint: { fontSize: 13, color: C.muted, marginLeft: 4 },
  muted: { fontSize: 14, color: C.muted },
  divider: { height: 1, backgroundColor: C.borderSoft, marginLeft: 16 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 72 },
  locIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.primary, borderColor: C.primary },
  ruleRow: { flexDirection: 'row', alignItems: 'center', padding: 14, minHeight: 64 },
  ruleTitle: { fontSize: 15, ...fw('700'), color: C.text },
  ruleHelp: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 18 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 10, minHeight: 56 },
  dayName: { fontSize: 15, ...fw('700'), color: C.text, width: 96 },
  dayState: { fontSize: 13, ...fw('700') },
  periods: { paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  to: { color: C.muted, fontSize: 13, ...fw('600') },
  chipField: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: C.field, borderWidth: 1, borderColor: C.border, justifyContent: 'center' },
  chipLabel: { fontSize: 11, ...fw('700'), color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  chipValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipValue: { fontSize: 15, ...fw('700'), color: C.text },
  iconBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  addPeriod: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36 },
  addPeriodText: { color: C.primary, ...fw('700'), fontSize: 14 },
  dayError: { color: C.dangerFg, fontSize: 13, ...fw('600') },
  offRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  offIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.goldSoft, alignItems: 'center', justifyContent: 'center' },
  formTitle: { fontSize: 15, ...fw('800'), color: C.text, marginBottom: 12 },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  formLabel: { width: 48, fontSize: 14, ...fw('700'), color: C.text2 },
  input: { marginTop: 4, minHeight: 48, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, fontSize: 15, color: C.text, backgroundColor: C.field },
  saveBar: { backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.borderSoft },
  saveInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  saveHint: { fontSize: 14, ...fw('600'), color: C.muted, flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28 },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.borderSoft },
  pickerTitle: { fontSize: 16, ...fw('700'), color: C.text },
  pickerCancel: { fontSize: 16, color: C.muted, ...fw('600') },
  pickerDone: { fontSize: 16, color: C.primary, ...fw('800') },
});
