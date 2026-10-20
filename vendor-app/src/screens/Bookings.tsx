import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api, ApiError } from '../api';
import { Button, Notice } from '../components/AuthUI';
import { C } from '../theme';
import { Booking, BOOKING_FILTERS, BOOKING_STATUS_LABEL, DECLINE_REASONS, bookingSteps, canDecline, when } from '../bookings/model';

const REFRESH_MS = 30000;

export function Bookings() {
  const [filter, setFilter] = useState('new');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Booking | null>(null);

  const load = useCallback(async (spin = false) => {
    if (spin) setRefreshing(true);
    try {
      const q = filter ? `?status=${encodeURIComponent(filter)}` : '';
      const res = await api.get<{ bookings: Booking[] }>(`/bookings/vendor${q}`);
      setBookings(res.bookings);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Could not load bookings.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    const sub = Notifications.addNotificationReceivedListener(() => void load());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [load]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {BOOKING_FILTERS.map((f) => (
          <Pressable
            key={f.key || 'all'}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f.key }}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key && styles.chipOn]}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ marginTop: 32 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.primary} />}
        >
          {bookings.length === 0 ? <Text style={styles.empty}>No bookings here right now.</Text> : null}
          {bookings.map((b) => (
            <Pressable key={b.id} accessibilityRole="button" onPress={() => setSelected(b)} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title} numberOfLines={1}>{b.listing_title}</Text>
                <Text style={[styles.badge, b.status === 'new' && styles.badgeNew]}>{BOOKING_STATUS_LABEL[b.status]}</Text>
              </View>
              <Text style={styles.muted}>{when(b)} · {b.duration_mins} min · {b.location_type === 'home' ? 'At customer' : 'At your location'}</Text>
              <Text style={styles.muted}>{b.contact_name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <BookingDetail
        booking={selected}
        onClose={() => setSelected(null)}
        onChanged={() => {
          setSelected(null);
          void load();
        }}
      />
    </View>
  );
}

function BookingDetail({ booking, onClose, onChanged }: { booking: Booking | null; onClose: () => void; onChanged: () => void }) {
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

  const change = async (status: string, cancelReason?: string) => {
    setBusy(true);
    setErr('');
    try {
      await api.patch(`/bookings/${booking.id}`, cancelReason ? { status, cancel_reason: cancelReason } : { status });
      onChanged();
    } catch (e: any) {
      // The API explains refused changes, such as a time clash or an unset time. Show its message.
      setErr(e instanceof ApiError ? e.message : 'Could not update this booking. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const steps = bookingSteps(booking);
  const noTime = !booking.slot_starts_at && !booking.scheduled_at;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <ScrollView contentContainerStyle={styles.sheet}>
        <View style={styles.row}>
          <Text style={styles.heading}>{booking.listing_title}</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <Text style={styles.muted}>{BOOKING_STATUS_LABEL[booking.status]} · {booking.duration_mins} min</Text>

        <Text style={styles.section}>When</Text>
        <Text style={styles.line}>{when(booking)}</Text>
        {!booking.slot_starts_at && booking.preferred_note ? <Text style={styles.muted}>Customer note: {booking.preferred_note}</Text> : null}
        {noTime && steps.length ? <Text style={styles.muted}>This booking has no fixed time. Agree the time with the customer, then set it on the website.</Text> : null}

        <Text style={styles.section}>Customer</Text>
        <Text style={styles.line}>{booking.contact_name} · {booking.contact_phone}</Text>
        <Text style={styles.line}>{booking.location_type === 'home' ? `At customer: ${booking.address || 'address not given'}` : 'At your location'}</Text>

        {err ? <Notice tone="error">{err}</Notice> : null}

        {!declining ? (
          <View style={{ gap: 10, marginTop: 20 }}>
            {steps.map((s) => (
              <Button key={s.status} loading={busy} onPress={() => change(s.status)} variant={s.primary ? 'primary' : 'secondary'}>
                {s.label}
              </Button>
            ))}
            {canDecline(booking) ? (
              <Button variant="gold" disabled={busy} onPress={() => setDeclining(true)}>
                Decline booking
              </Button>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 10, marginTop: 20 }}>
            <Text style={styles.section}>Why are you declining?</Text>
            <View style={styles.reasons}>
              {DECLINE_REASONS.map((r) => (
                <Pressable
                  key={r}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: reason === r }}
                  onPress={() => setReason(r)}
                  style={[styles.chip, reason === r && styles.chipOn]}
                >
                  <Text style={[styles.chipText, reason === r && styles.chipTextOn]}>{r}</Text>
                </Pressable>
              ))}
            </View>
            {reason === 'Other' ? (
              <TextInput value={other} onChangeText={setOther} placeholder="Tell the customer why (at least 5 characters)" style={styles.input} maxLength={300} />
            ) : null}
            <Button variant="gold" loading={busy} disabled={!reasonOk} onPress={() => {
              Alert.alert('Decline this booking?', 'The customer will be told why.', [
                { text: 'Keep booking', style: 'cancel' },
                { text: 'Decline', style: 'destructive', onPress: () => change('cancelled', finalReason) },
              ]);
            }}>
              Confirm decline
            </Button>
            <Button variant="secondary" disabled={busy} onPress={() => setDeclining(false)}>Back</Button>
          </View>
        )}
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginRight: 8 },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { color: C.text, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  list: { padding: 16, gap: 12, paddingTop: 4 },
  empty: { textAlign: 'center', color: C.muted, marginTop: 40 },
  card: { backgroundColor: C.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: C.text, flexShrink: 1 },
  heading: { fontSize: 20, fontWeight: '700', color: C.text, flexShrink: 1 },
  badge: { fontSize: 12, fontWeight: '700', color: C.primary, backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  badgeNew: { color: '#fff', backgroundColor: C.gold },
  muted: { color: C.muted, fontSize: 14 },
  sheet: { padding: 20, gap: 6, paddingBottom: 40 },
  close: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  closeText: { color: C.primary, fontWeight: '700', fontSize: 16 },
  section: { marginTop: 14, fontWeight: '700', color: C.text, fontSize: 15 },
  line: { color: C.text, fontSize: 15 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, minHeight: 44, fontSize: 16, color: C.text, backgroundColor: C.surface },
});
