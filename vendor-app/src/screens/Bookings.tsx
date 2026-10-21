import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { api, ApiError } from '../api';
import { Banner, Btn, Card, Chips, EmptyState, Icon, Pill, ScreenHeader } from '../ui/kit';
import { C, TONES } from '../theme';
import {
  Booking,
  BOOKING_FILTERS,
  BOOKING_STATUS_LABEL,
  BOOKING_TONE,
  BookingFilter,
  DECLINE_REASONS,
  bookingSteps,
  canDecline,
  matchesBookingFilter,
  when,
} from '../bookings/model';
import { fw } from '../ui/type';

const REFRESH_MS = 30000;

export function Bookings() {
  const [all, setAll] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<BookingFilter>('new');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Booking | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const wide = width >= 720;

  const load = useCallback(async (spin = false) => {
    if (spin) setRefreshing(true);
    try {
      const res = await api.get<{ bookings: Booking[] }>('/bookings/vendor');
      setAll(res.bookings);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Could not load bookings. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    const sub = Notifications.addNotificationReceivedListener(() => void load());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [load]);

  const counts = useMemo(() => {
    const map = {} as Record<BookingFilter, number>;
    for (const f of BOOKING_FILTERS) map[f.key] = all.filter((b) => matchesBookingFilter(b, f.key)).length;
    return map;
  }, [all]);

  const visible = useMemo(
    () => all.filter((b) => matchesBookingFilter(b, filter)).sort((a, b) => +new Date(a.slot_starts_at || a.preferred_at || a.created_at) - +new Date(b.slot_starts_at || b.preferred_at || b.created_at)),
    [all, filter],
  );

  const runStep = async (b: Booking, status: string) => {
    setBusyId(b.id);
    try {
      await api.patch(`/bookings/${b.id}`, { status });
      await load();
    } catch (e: any) {
      Alert.alert('Booking not updated', e instanceof ApiError ? e.message : 'Check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  const newCount = counts.new;
  const summary = newCount ? `${newCount} waiting for your reply` : counts.confirmed ? `${counts.confirmed} confirmed` : 'No bookings waiting';

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Bookings" subtitle={summary} />
      <Chips items={BOOKING_FILTERS.map((f) => ({ key: f.key, label: f.label, count: counts[f.key] || undefined }))} value={filter} onChange={(k) => setFilter(k)} />

      {error ? (
        <View style={styles.pad}>
          <Banner tone="error">{error}</Banner>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.frame} contentContainerStyle={[styles.list, wide && styles.listWide]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.primary} />}>
          {visible.length === 0 ? (
            <EmptyState icon="calendar-days" title={filter === 'new' ? 'No new bookings' : 'No bookings here'} body="Booking requests appear here and ring on your phone." />
          ) : null}
          {visible.map((b) => (
            <View key={b.id} style={{ width: wide ? '49%' : '100%' }}>
              <BookingCard booking={b} busy={busyId === b.id} onOpen={() => setSelected(b)} onStep={(status) => runStep(b, status)} />
            </View>
          ))}
        </ScrollView>
      )}

      <BookingSheet
        booking={selected}
        onClose={() => setSelected(null)}
        onChanged={async () => {
          setSelected(null);
          await load();
        }}
      />
    </View>
  );
}

function BookingCard({ booking: b, busy, onOpen, onStep }: { booking: Booking; busy: boolean; onOpen: () => void; onStep: (status: string) => void }) {
  const tone = TONES[BOOKING_TONE[b.status]];
  const primary = bookingSteps(b).find((s) => s.primary);
  const home = b.location_type === 'home';
  const noTime = !b.slot_starts_at && !b.scheduled_at;

  return (
    <Card padded={false} style={styles.card}>
      <View style={[styles.accent, { backgroundColor: tone.fg }]} />
      <View style={{ flex: 1 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Booking for ${b.listing_title}`} onPress={onOpen} style={styles.body}>
          <View style={styles.rowBetween}>
            <Text style={styles.title} numberOfLines={1}>{b.listing_title}</Text>
            <Pill label={BOOKING_STATUS_LABEL[b.status]} tone={BOOKING_TONE[b.status]} />
          </View>
          <View style={styles.metaRow}>
            <Icon name="calendar-days" size={16} color={C.muted} />
            <Text style={[styles.meta, noTime && { color: C.goldText }]}>{when(b)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Icon name="clock" size={16} color={C.muted} />
            <Text style={styles.meta}>{b.duration_mins} min</Text>
            <Text style={styles.dot}>·</Text>
            <Icon name={home ? 'home' : 'building-storefront'} size={16} color={C.muted} />
            <Text style={styles.meta}>{home ? 'At customer' : 'At your location'}</Text>
          </View>
          <View style={styles.metaRow}>
            <Icon name="user" size={16} color={C.muted} />
            <Text style={styles.meta} numberOfLines={1}>{b.contact_name}</Text>
          </View>
        </Pressable>

        {primary && noTime && primary.status === 'confirmed' ? (
          <View style={styles.actionRow}>
            <Banner tone="info" icon="information-circle">Agree a time with the customer, then set it on the website to accept.</Banner>
          </View>
        ) : primary ? (
          <View style={styles.actionRow}>
            <Btn compact label={primary.label} icon={primary.status === 'confirmed' ? 'check' : 'check-circle'} loading={busy} onPress={() => onStep(primary.status)} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function BookingSheet({ booking, onClose, onChanged }: { booking: Booking | null; onClose: () => void; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    setDeclining(false);
    setReason('');
    setOther('');
    setErr('');
  }, [booking?.id]);

  if (!booking) return null;

  const finalReason = reason === 'Other' ? other.trim() : reason;
  const reasonOk = !!finalReason && (reason !== 'Other' || finalReason.length >= 5);
  const steps = bookingSteps(booking);
  const noTime = !booking.slot_starts_at && !booking.scheduled_at;
  const home = booking.location_type === 'home';

  const change = async (status: string, cancelReason?: string) => {
    setBusy(true);
    setErr('');
    try {
      await api.patch(`/bookings/${booking.id}`, cancelReason ? { status, cancel_reason: cancelReason } : { status });
      await onChanged();
    } catch (e: any) {
      // The API explains refused changes, such as a time clash or an unset time. Show its message.
      setErr(e instanceof ApiError ? e.message : 'Could not update this booking. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetKicker}>{home ? 'Home visit' : 'Visit to your location'}</Text>
            <Text style={styles.sheetTitle} numberOfLines={2}>{booking.listing_title}</Text>
          </View>
          <Pill label={BOOKING_STATUS_LABEL[booking.status]} tone={BOOKING_TONE[booking.status]} />
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.closeBtn}>
            <Icon name="x-mark" size={22} color={C.text2} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.sheetBody}>
          {err ? <Banner tone="error">{err}</Banner> : null}

          {!declining ? (
            <>
              <Card>
                <Text style={styles.cardTitle}>When</Text>
                <View style={styles.infoRow}>
                  <Icon name="calendar-days" size={18} color={C.muted} />
                  <Text style={styles.infoText}>{when(booking)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Icon name="clock" size={18} color={C.muted} />
                  <Text style={styles.infoText}>{booking.duration_mins} minutes</Text>
                </View>
                {noTime ? (
                  <View style={{ marginTop: 6 }}>
                    <Banner tone="info" icon="information-circle">No fixed time yet. Agree a time with the customer, then set it on the website.</Banner>
                  </View>
                ) : null}
                {booking.preferred_note ? (
                  <View style={styles.note}>
                    <Text style={styles.noteText}>“{booking.preferred_note}”</Text>
                  </View>
                ) : null}
              </Card>

              <Card>
                <Text style={styles.cardTitle}>Customer</Text>
                <View style={styles.infoRow}>
                  <Icon name="user" size={18} color={C.muted} />
                  <Text style={styles.infoText}>{booking.contact_name}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Call customer" onPress={() => Linking.openURL(`tel:${booking.contact_phone}`)} style={styles.infoRow}>
                  <Icon name="phone" size={18} color={C.primary} />
                  <Text style={[styles.infoText, { color: C.primary, ...fw('700') }]}>{booking.contact_phone}</Text>
                </Pressable>
                <View style={styles.infoRow}>
                  <Icon name={home ? 'map-pin' : 'building-storefront'} size={18} color={C.muted} />
                  <Text style={styles.infoText}>{home ? booking.address || 'Address not given' : 'Customer visits you'}</Text>
                </View>
              </Card>
            </>
          ) : (
            <Card>
              <Text style={styles.cardTitle}>Why are you declining?</Text>
              <Text style={styles.helper}>The customer is told the reason.</Text>
              <View style={{ gap: 8, marginTop: 12 }}>
                {DECLINE_REASONS.map((r) => {
                  const on = reason === r;
                  return (
                    <Pressable key={r} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setReason(r)} style={[styles.reason, on && styles.reasonOn]}>
                      <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                      <Text style={[styles.reasonText, on && { color: C.primary, ...fw('700') }]}>{r}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {reason === 'Other' ? (
                <TextInput value={other} onChangeText={setOther} placeholder="Tell the customer why (at least 5 characters)" placeholderTextColor={C.muted} style={styles.input} maxLength={300} multiline />
              ) : null}
            </Card>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {!declining ? (
            <>
              {steps.filter((s) => !(noTime && s.status === 'confirmed')).map((s) => (
                <Btn key={s.status} label={s.label} variant={s.primary ? 'primary' : 'secondary'} icon={s.status === 'confirmed' ? 'check' : s.status === 'completed' ? 'check-circle' : 'clock'} loading={busy} onPress={() => change(s.status)} />
              ))}
              {canDecline(booking) ? <Btn label="Decline booking" variant="danger" icon="x-circle" disabled={busy} onPress={() => setDeclining(true)} /> : null}
            </>
          ) : (
            <>
              <Btn
                label="Confirm decline"
                variant="danger"
                icon="x-circle"
                loading={busy}
                disabled={!reasonOk}
                onPress={() =>
                  Alert.alert('Decline this booking?', 'The customer will be told why.', [
                    { text: 'Keep booking', style: 'cancel' },
                    { text: 'Decline', style: 'destructive', onPress: () => change('cancelled', finalReason) },
                  ])
                }
              />
              <Btn label="Back" variant="secondary" disabled={busy} onPress={() => setDeclining(false)} />
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  frame: { width: '100%', maxWidth: 760, alignSelf: 'center', flex: 1 },
  listWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  pad: { paddingHorizontal: 16, paddingTop: 8 },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 12 },
  card: { flexDirection: 'row', overflow: 'hidden' },
  accent: { width: 4 },
  body: { padding: 14, gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 16, ...fw('800'), color: C.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 13, color: C.text2, ...fw('600') },
  dot: { color: C.muted },
  actionRow: { paddingHorizontal: 14, paddingBottom: 14 },
  sheet: { flex: 1, backgroundColor: C.bg },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.borderSoft },
  sheetKicker: { fontSize: 12, color: C.muted, ...fw('700'), textTransform: 'uppercase', letterSpacing: 0.5 },
  sheetTitle: { fontSize: 19, ...fw('800'), color: C.text },
  closeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2 },
  sheetBody: { padding: 16, gap: 12, paddingBottom: 24 },
  footer: { padding: 16, gap: 10, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.borderSoft },
  cardTitle: { fontSize: 13, ...fw('800'), color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  infoText: { flex: 1, fontSize: 15, color: C.text, lineHeight: 21 },
  note: { marginTop: 8, padding: 12, borderRadius: 10, backgroundColor: C.goldSoft },
  noteText: { color: '#7C2D12', fontSize: 14, lineHeight: 20 },
  helper: { fontSize: 13, color: C.muted },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  reasonOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  reasonText: { fontSize: 15, color: C.text, ...fw('500') },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: C.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary },
  input: { marginTop: 12, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, minHeight: 80, fontSize: 15, color: C.text, backgroundColor: C.field, textAlignVertical: 'top' },
});
