import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api, ApiError } from '../api';
import { Button, Notice } from '../components/AuthUI';
import { C } from '../theme';
import { CANCEL_REASONS, ORDER_FILTERS, STATUS_LABEL, VendorOrder, canCancel, money, nextSteps } from '../orders/model';

const REFRESH_MS = 30000;

export function Orders() {
  const [filter, setFilter] = useState('pending');
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<VendorOrder | null>(null);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const q = filter ? `?status=${encodeURIComponent(filter)}` : '';
      const res = await api.get<{ orders: VendorOrder[] }>(`/orders/vendor${q}`);
      setOrders(res.orders);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Could not load orders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  // Reload on filter change, every 30 seconds, and whenever an alert arrives while the app is open.
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
        {ORDER_FILTERS.map((f) => (
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
          {orders.length === 0 ? <Text style={styles.empty}>No orders here right now.</Text> : null}
          {orders.map((o) => (
            <Pressable key={o.id} accessibilityRole="button" onPress={() => setSelected(o)} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.code}>#{o.code}</Text>
                <Text style={[styles.badge, o.status === 'pending' && styles.badgeNew]}>{STATUS_LABEL[o.status] || o.status}</Text>
              </View>
              <Text style={styles.muted}>
                {o.fulfilment_mode === 'pickup' ? 'Pickup' : 'Delivery'} · {money(o.total)} · {o.items.reduce((n, i) => n + i.qty, 0)} items
              </Text>
              <Text numberOfLines={1} style={styles.items}>
                {o.items.map((i) => `${i.qty}× ${i.title}`).join(', ')}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <OrderDetail
        order={selected}
        onClose={() => setSelected(null)}
        onChanged={() => {
          setSelected(null);
          void load();
        }}
      />
    </View>
  );
}

function OrderDetail({ order, onClose, onChanged }: { order: VendorOrder | null; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    setCancelling(false);
    setReason('');
    setOther('');
    setErr('');
  }, [order?.id]);

  if (!order) return null;

  const finalReason = reason === 'Other' ? other.trim() : reason;
  const reasonOk = !!finalReason && (reason !== 'Other' || finalReason.length >= 5);

  const change = async (status: string, why?: string) => {
    setBusy(true);
    setErr('');
    try {
      await api.patch(`/orders/vendor/${order.id}/status`, why ? { status, reason: why } : { status });
      onChanged();
    } catch (e: any) {
      // The API explains refused moves (for example, a rider already assigned). Show its message.
      setErr(e instanceof ApiError ? e.message : 'Could not update this order. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const steps = nextSteps(order);
  const address = order.fulfilment_mode === 'pickup' ? order.pickup_address : order.delivery_address;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <ScrollView contentContainerStyle={styles.sheet}>
        <View style={styles.row}>
          <Text style={styles.title}>Order #{order.code}</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <Text style={styles.muted}>
          {STATUS_LABEL[order.status] || order.status} · {order.fulfilment_mode === 'pickup' ? 'Pickup' : 'Delivery'} · {money(order.total)}
        </Text>

        <Text style={styles.section}>Items</Text>
        {order.items.map((i, idx) => (
          <Text key={idx} style={styles.line}>{i.qty}× {i.title}</Text>
        ))}

        <Text style={styles.section}>{order.fulfilment_mode === 'pickup' ? 'Pickup' : 'Delivery to'}</Text>
        <Text style={styles.line}>{address || 'No address given'}</Text>
        {order.contact_name ? <Text style={styles.line}>{order.contact_name}{order.contact_phone ? ` · ${order.contact_phone}` : ''}</Text> : null}
        {order.note ? <Text style={styles.muted}>Note: {order.note}</Text> : null}

        {err ? <Notice tone="error">{err}</Notice> : null}

        {!cancelling ? (
          <View style={{ gap: 10, marginTop: 20 }}>
            {steps.map((s) => (
              <Button key={s.status} loading={busy} onPress={() => change(s.status)} variant={s.status === 'confirmed' ? 'primary' : 'gold'}>
                {s.label}
              </Button>
            ))}
            {canCancel(order) ? (
              <Button variant="secondary" disabled={busy} onPress={() => setCancelling(true)}>
                Cancel order
              </Button>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 10, marginTop: 20 }}>
            <Text style={styles.section}>Why are you cancelling?</Text>
            <View style={styles.reasons}>
              {CANCEL_REASONS.map((r) => (
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
              <TextInput
                value={other}
                onChangeText={setOther}
                placeholder="Tell the buyer why (at least 5 characters)"
                style={styles.input}
                maxLength={300}
              />
            ) : null}
            <Button variant="gold" loading={busy} disabled={!reasonOk} onPress={() => {
              Alert.alert('Cancel this order?', 'The buyer will be told why.', [
                { text: 'Keep order', style: 'cancel' },
                { text: 'Cancel order', style: 'destructive', onPress: () => change('cancelled', finalReason) },
              ]);
            }}>
              Confirm cancellation
            </Button>
            <Button variant="secondary" disabled={busy} onPress={() => setCancelling(false)}>
              Back
            </Button>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontSize: 16, fontWeight: '700', color: C.text },
  badge: { fontSize: 12, fontWeight: '700', color: C.primary, backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  badgeNew: { color: '#fff', backgroundColor: C.gold },
  muted: { color: C.muted, fontSize: 14 },
  items: { color: C.text, fontSize: 14 },
  sheet: { padding: 20, gap: 6, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', color: C.text },
  close: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  closeText: { color: C.primary, fontWeight: '700', fontSize: 16 },
  section: { marginTop: 14, fontWeight: '700', color: C.text, fontSize: 15 },
  line: { color: C.text, fontSize: 15 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, minHeight: 44, fontSize: 16, color: C.text, backgroundColor: C.surface },
});
