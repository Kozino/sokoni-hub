import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { api, ApiError } from '../api';
import { Banner, Btn, Card, Chips, EmptyState, Icon, Pill, ScreenHeader } from '../ui/kit';
import { C, TONES } from '../theme';
import {
  CANCEL_REASONS,
  ORDER_FILTERS,
  ORDER_STATUS_LABEL,
  ORDER_TONE,
  OrderFilter,
  VendorOrder,
  canCancel,
  itemCount,
  matchesFilter,
  money,
  nextStep,
  timeAgo,
} from '../orders/model';
import { fw } from '../ui/type';

const REFRESH_MS = 30000;

export function Orders() {
  const [all, setAll] = useState<VendorOrder[]>([]);
  const [filter, setFilter] = useState<OrderFilter>('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<VendorOrder | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const wide = width >= 720;

  // One request loads every order. Filters and counts are computed on the device, so switching chips is instant.
  const load = useCallback(async (spin = false) => {
    if (spin) setRefreshing(true);
    try {
      const res = await api.get<{ orders: VendorOrder[] }>('/orders/vendor');
      setAll(res.orders);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Could not load orders. Pull down to try again.');
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
    const map = {} as Record<OrderFilter, number>;
    for (const f of ORDER_FILTERS) map[f.key] = all.filter((o) => matchesFilter(o, f.key)).length;
    return map;
  }, [all]);

  const visible = useMemo(() => {
    const list = all.filter((o) => matchesFilter(o, filter));
    // New orders are handled oldest first. Everything else is newest first.
    return filter === 'pending'
      ? [...list].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
      : [...list].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [all, filter]);

  const advance = async (o: VendorOrder, status: string) => {
    setBusyId(o.id);
    try {
      await api.patch(`/orders/vendor/${o.id}/status`, { status });
      await load();
    } catch (e: any) {
      Alert.alert('Order not updated', e instanceof ApiError ? e.message : 'Check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  const summary = counts.pending
    ? `${counts.pending} new · ${counts.confirmed} preparing`
    : counts.confirmed || counts.dispatched
      ? `${counts.confirmed} preparing · ${counts.dispatched} on the way`
      : 'All caught up';

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Orders" subtitle={summary} />
      <Chips items={ORDER_FILTERS.map((f) => ({ key: f.key, label: f.label, count: counts[f.key] || undefined }))} value={filter} onChange={(k) => setFilter(k)} />

      {error ? (
        <View style={styles.pad}>
          <Banner tone="error">{error}</Banner>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          style={styles.frame}
          contentContainerStyle={[styles.list, wide && styles.listWide]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.primary} />}
        >
          {visible.length === 0 ? (
            <EmptyState icon="shopping-bag" title={filter === 'pending' ? 'No new orders' : 'No orders here'} body="New orders appear here and ring on your phone." />
          ) : null}
          {visible.map((o) => (
            <View key={o.id} style={{ width: wide ? '49%' : '100%' }}>
              <OrderCard order={o} busy={busyId === o.id} onOpen={() => setSelected(o)} onAdvance={(status) => advance(o, status)} />
            </View>
          ))}
        </ScrollView>
      )}

      <OrderSheet
        order={selected}
        onClose={() => setSelected(null)}
        onChanged={async () => {
          setSelected(null);
          await load();
        }}
      />
    </View>
  );
}

function OrderCard({ order: o, busy, onOpen, onAdvance }: { order: VendorOrder; busy: boolean; onOpen: () => void; onAdvance: (status: string) => void }) {
  const tone = TONES[ORDER_TONE[o.status]];
  const step = nextStep(o);
  const pickup = o.fulfilment_mode === 'pickup';
  const place = pickup ? o.pickup_address : o.delivery_address;

  return (
    <Card padded={false} style={styles.orderCard}>
      <View style={[styles.accent, { backgroundColor: tone.fg }]} />
      <View style={{ flex: 1 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Order ${o.code}`} onPress={onOpen} style={styles.orderBody}>
          <View style={styles.rowBetween}>
            <Text style={styles.code}>#{o.code}</Text>
            <Pill label={ORDER_STATUS_LABEL[o.status]} tone={ORDER_TONE[o.status]} />
          </View>
          <View style={styles.metaRow}>
            <Icon name={pickup ? 'building-storefront' : 'truck'} size={16} color={C.muted} />
            <Text style={styles.meta}>{pickup ? 'Pickup' : 'Delivery'}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.meta}>{itemCount(o)} {itemCount(o) === 1 ? 'item' : 'items'}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.metaStrong}>{money(o.total)}</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.time}>{timeAgo(o.created_at)}</Text>
          </View>
          <Text style={styles.items} numberOfLines={2}>{o.items.map((i) => `${i.qty}× ${i.title}`).join(', ')}</Text>
          {place ? (
            <View style={styles.metaRow}>
              <Icon name="map-pin" size={16} color={C.muted} />
              <Text style={styles.place} numberOfLines={1}>{place}</Text>
            </View>
          ) : null}
        </Pressable>

        {step ? (
          <View style={styles.actionRow}>
            <Btn compact label={step.label} icon={step.icon} loading={busy} onPress={() => onAdvance(step.status)} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function OrderSheet({ order, onClose, onChanged }: { order: VendorOrder | null; onClose: () => void; onChanged: () => Promise<void> }) {
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
  const pickup = order.fulfilment_mode === 'pickup';
  const step = nextStep(order);

  const change = async (status: string, why?: string) => {
    setBusy(true);
    setErr('');
    try {
      await api.patch(`/orders/vendor/${order.id}/status`, why ? { status, reason: why } : { status });
      await onChanged();
    } catch (e: any) {
      // The API explains refused moves, such as a rider already being assigned. Show its message.
      setErr(e instanceof ApiError ? e.message : 'Could not update this order. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetKicker}>{pickup ? 'Pickup order' : 'Delivery order'}</Text>
            <Text style={styles.sheetTitle}>#{order.code}</Text>
          </View>
          <Pill label={ORDER_STATUS_LABEL[order.status]} tone={ORDER_TONE[order.status]} />
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.closeBtn}>
            <Icon name="x-mark" size={22} color={C.text2} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.sheetBody}>
          {err ? <Banner tone="error">{err}</Banner> : null}

          {!cancelling ? (
            <>
              <Card>
                <Text style={styles.cardTitle}>Items</Text>
                {order.items.map((i, idx) => (
                  <View key={idx} style={styles.itemRow}>
                    <View style={styles.qty}>
                      <Text style={styles.qtyText}>{i.qty}</Text>
                    </View>
                    <Text style={styles.itemTitle}>{i.title}</Text>
                  </View>
                ))}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>{money(order.total)}</Text>
                </View>
                {order.payment_status ? (
                  <View style={{ marginTop: 12 }}>
                    <Pill label={order.payment_status === 'paid' ? 'Paid' : 'Unpaid'} tone={order.payment_status === 'paid' ? 'green' : 'amber'} icon={order.payment_status === 'paid' ? 'check-circle' : 'banknotes'} />
                  </View>
                ) : null}
              </Card>

              <Card>
                <Text style={styles.cardTitle}>Customer</Text>
                <View style={styles.infoRow}>
                  <Icon name="user" size={18} color={C.muted} />
                  <Text style={styles.infoText}>{order.contact_name || 'No name given'}</Text>
                </View>
                {order.contact_phone ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Call customer" onPress={() => Linking.openURL(`tel:${order.contact_phone}`)} style={styles.infoRow}>
                    <Icon name="phone" size={18} color={C.primary} />
                    <Text style={[styles.infoText, { color: C.primary, ...fw('700') }]}>{order.contact_phone}</Text>
                  </Pressable>
                ) : null}
                <View style={styles.infoRow}>
                  <Icon name={pickup ? 'building-storefront' : 'map-pin'} size={18} color={C.muted} />
                  <Text style={styles.infoText}>{(pickup ? order.pickup_address : order.delivery_address) || (pickup ? 'Collected from your store' : 'No address given')}</Text>
                </View>
                {order.note ? (
                  <View style={styles.note}>
                    <Text style={styles.noteText}>“{order.note}”</Text>
                  </View>
                ) : null}
              </Card>
            </>
          ) : (
            <Card>
              <Text style={styles.cardTitle}>Why are you cancelling?</Text>
              <Text style={styles.helper}>The customer is told the reason.</Text>
              <View style={{ gap: 8, marginTop: 12 }}>
                {CANCEL_REASONS.map((r) => {
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
          {!cancelling ? (
            <>
              {step ? <Btn label={step.label} icon={step.icon} loading={busy} onPress={() => change(step.status)} /> : null}
              {canCancel(order) ? <Btn label="Cancel order" variant="danger" icon="x-circle" disabled={busy} onPress={() => setCancelling(true)} /> : null}
            </>
          ) : (
            <>
              <Btn
                label="Confirm cancellation"
                variant="danger"
                icon="x-circle"
                loading={busy}
                disabled={!reasonOk}
                onPress={() =>
                  Alert.alert('Cancel this order?', 'The customer will be told why.', [
                    { text: 'Keep order', style: 'cancel' },
                    { text: 'Cancel order', style: 'destructive', onPress: () => change('cancelled', finalReason) },
                  ])
                }
              />
              <Btn label="Back" variant="secondary" disabled={busy} onPress={() => setCancelling(false)} />
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
  orderCard: { flexDirection: 'row', overflow: 'hidden' },
  accent: { width: 4 },
  orderBody: { padding: 14, gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  code: { fontSize: 17, ...fw('800'), color: C.text, letterSpacing: 0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 13, color: C.muted, ...fw('600') },
  metaStrong: { fontSize: 13, color: C.text, ...fw('800') },
  dot: { color: C.muted },
  time: { fontSize: 12, color: C.muted, ...fw('600') },
  items: { fontSize: 14, color: C.text2, lineHeight: 20 },
  place: { flex: 1, fontSize: 13, color: C.muted },
  actionRow: { paddingHorizontal: 14, paddingBottom: 14 },
  sheet: { flex: 1, backgroundColor: C.bg },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.borderSoft },
  sheetKicker: { fontSize: 12, color: C.muted, ...fw('700'), textTransform: 'uppercase', letterSpacing: 0.5 },
  sheetTitle: { fontSize: 22, ...fw('800'), color: C.text },
  closeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2 },
  sheetBody: { padding: 16, gap: 12, paddingBottom: 24 },
  footer: { padding: 16, gap: 10, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.borderSoft },
  cardTitle: { fontSize: 13, ...fw('800'), color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  qty: { minWidth: 30, height: 30, borderRadius: 8, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  qtyText: { color: C.primary, ...fw('800') },
  itemTitle: { flex: 1, fontSize: 15, color: C.text, ...fw('600') },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.borderSoft },
  totalLabel: { fontSize: 15, color: C.text2, ...fw('600') },
  totalValue: { fontSize: 17, color: C.text, ...fw('800') },
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
