import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { api, ApiError } from '../api';
import { Banner, Btn, Card, Chips, EmptyState, Icon, Pill, ScreenHeader, StatRow, StatTile } from '../ui/kit';
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
import { dohaDay, dohaToday, initialsOf, qar } from '../format';
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
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
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

  // Today's figures use the Doha calendar day, and cancelled orders are left out of the sales total.
  const today = useMemo(() => {
    const day = dohaToday();
    const todays = all.filter((o) => dohaDay(o.created_at) === day);
    const sales = todays.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + Number(o.total || 0), 0);
    return { count: todays.length, sales };
  }, [all]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = all.filter((o) => matchesFilter(o, filter)).filter((o) => {
      if (!term) return true;
      return [o.code, o.contact_name, o.contact_phone, o.delivery_address, o.pickup_address, ...o.items.map((i) => i.title)]
        .some((v) => (v || '').toLowerCase().includes(term));
    });
    // New orders are handled oldest first. Everything else is newest first.
    return filter === 'pending'
      ? [...list].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
      : [...list].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [all, filter, query]);

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
      <ScreenHeader
        title="Orders"
        subtitle={summary}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel={searching ? 'Close search' : 'Search orders'} onPress={() => { setSearching((s) => !s); setQuery(''); }} style={styles.searchBtn} hitSlop={6}>
            <Icon name={searching ? 'x-mark' : 'magnifying-glass'} size={20} color={C.text2} />
          </Pressable>
        }
      />

      <StatRow style={{ paddingHorizontal: 16, paddingTop: 2 }}>
        <StatTile label="Today" value={String(today.count)} sub={today.count === 1 ? 'order today' : 'orders today'} icon="shopping-bag" tone="brand" />
        <StatTile label="New" value={String(counts.pending)} sub={counts.pending ? 'to accept' : 'all caught up'} icon="clock" tone="amber" />
        <StatTile label="Sales today" value={qar(today.sales).replace('QAR ', '')} sub="QAR, not cancelled" icon="banknotes" tone="violet" />
      </StatRow>

      <Chips items={ORDER_FILTERS.map((f) => ({ key: f.key, label: f.label, count: counts[f.key] || undefined }))} value={filter} onChange={(k) => setFilter(k)} />

      {searching ? (
        <View style={styles.searchWrap}>
          <Icon name="magnifying-glass" size={18} color={C.muted} />
          <TextInput
            accessibilityLabel="Search orders"
            value={query}
            onChangeText={setQuery}
            placeholder="Search code, customer, phone or item"
            placeholderTextColor={C.muted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoFocus
            returnKeyType="search"
          />
        </View>
      ) : null}

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
            <EmptyState
              icon="shopping-bag"
              title={query ? 'No matching orders' : filter === 'pending' ? 'No new orders' : 'No orders here'}
              body={query ? 'Try a different code, name or item.' : 'New orders appear here and ring on your phone.'}
            />
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
  const items = o.items.slice(0, 3);
  const moreItems = o.items.length - items.length;
  const name = o.contact_name || 'Customer';
  const count = itemCount(o);
  const paid = o.payment_status === 'paid';
  const canDecline = canCancel(o);

  return (
    <Card padded={false} style={styles.orderCard}>
      <View style={{ flex: 1 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Order ${o.code}`} onPress={onOpen} style={styles.orderBody}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.code} numberOfLines={1}>#{o.code}</Text>
              <Text style={styles.meta} numberOfLines={2}>
                {pickup ? 'Pickup' : 'Delivery'}
                {o.city ? ` · ${o.city}` : ''} · {count} {count === 1 ? 'item' : 'items'} · {timeAgo(o.created_at)}
              </Text>
            </View>
            <Pill label={ORDER_STATUS_LABEL[o.status]} tone={ORDER_TONE[o.status]} />
          </View>

          <View style={styles.customer}>
            <View style={styles.custAvatar}>
              <Text style={styles.custInitials}>{initialsOf(name)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.custName} numberOfLines={2}>{name}</Text>
              {place ? (
                <View style={styles.placeRow}>
                  <Icon name={pickup ? 'building-storefront' : 'map-pin'} size={14} color={C.muted} />
                  <Text style={styles.place} numberOfLines={2}>{place}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.itemList}>
            {items.map((i, idx) => (
              <View key={idx} style={styles.itemLine}>
                <View style={styles.qtyChip}>
                  <Text style={styles.qtyChipText}>{i.qty}×</Text>
                </View>
                <Text style={styles.itemLineTitle} numberOfLines={2}>{i.title}</Text>
                {i.line_total !== undefined ? <Text style={styles.itemLineTotal}>{qar(i.line_total)}</Text> : null}
              </View>
            ))}
            {moreItems > 0 ? <Text style={styles.moreItems}>+{moreItems} more</Text> : null}
          </View>

          <View style={styles.totalBar}>
            {o.payment_status ? (
              <Pill label={paid ? 'Paid' : 'Unpaid'} tone={paid ? 'green' : 'amber'} icon={paid ? 'check-circle' : 'banknotes'} />
            ) : <View />}
            <View style={styles.totalCol}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={[styles.totalValue, { color: tone.fg }]}>{money(o.total)}</Text>
            </View>
          </View>
        </Pressable>

        {o.contact_phone || step || canDecline ? (
          <View style={styles.actions}>
            {canDecline ? (
              <View style={{ flex: 1 }}>
                <Btn compact variant="danger" label={o.status === 'pending' ? 'Decline' : 'Cancel'} icon="x-circle" disabled={busy} onPress={onOpen} />
              </View>
            ) : null}
            {o.contact_phone ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Call customer" onPress={() => Linking.openURL(`tel:${o.contact_phone}`)} style={styles.callBtn}>
                <Icon name="phone" size={18} color={C.primary} />
              </Pressable>
            ) : null}
            {step ? (
              <View style={{ flex: 1.4 }}>
                <Btn compact variant={o.status === 'pending' ? 'primary' : 'gold'} label={step.label} icon={step.icon} loading={busy} onPress={() => onAdvance(step.status)} />
              </View>
            ) : null}
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
  frame: { width: '100%', maxWidth: 760, alignSelf: 'center', flex: 1, minHeight: 0 },
  listWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  pad: { paddingHorizontal: 12, paddingTop: 6 },
  list: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 24, gap: 9 },
  searchBtn: { width: 34, height: 34, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  statRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingTop: 2 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 6, paddingHorizontal: 10, height: 39, borderRadius: 11, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  searchInput: { flex: 1, fontSize: 13, color: C.text, paddingVertical: 0 },
  orderCard: { flexDirection: 'row', overflow: 'hidden' },
  orderBody: { padding: 12, gap: 9 },
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  code: { fontSize: 16, ...fw('800'), color: C.text, letterSpacing: -0.2 },
  meta: { fontSize: 11, color: C.muted, ...fw('600'), marginTop: 2 },
  customer: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 9, borderRadius: 13, backgroundColor: C.surface2 },
  custAvatar: { width: 36, height: 36, borderRadius: 17, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  custInitials: { fontSize: 12, ...fw('800'), color: C.primaryDeep },
  custName: { fontSize: 13, ...fw('800'), color: C.text },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  place: { flex: 1, fontSize: 11, color: C.muted },
  itemList: { gap: 6 },
  itemLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyChip: { minWidth: 31, height: 26, borderRadius: 6, paddingHorizontal: 4, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  qtyChipText: { fontSize: 11, ...fw('800'), color: C.primary },
  itemLineTitle: { flex: 1, fontSize: 12, ...fw('600'), color: C.text },
  itemLineTotal: { fontSize: 12, ...fw('800'), color: C.text },
  moreItems: { fontSize: 11, color: C.muted, ...fw('700') },
  totalBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 9, paddingVertical: 8, borderRadius: 11, backgroundColor: C.surface2 },
  totalCol: { alignItems: 'flex-end' },
  totalLabel: { fontSize: 11, color: C.muted, ...fw('700') },
  totalValue: { fontSize: 15, ...fw('800') },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingBottom: 12 },
  callBtn: { width: 39, height: 39, borderRadius: 11, borderWidth: 1, borderColor: C.primaryLine, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  sheet: { flex: 1, backgroundColor: C.bg },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 15, paddingTop: 10, paddingBottom: 9, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.borderSoft },
  sheetKicker: { fontSize: 11, color: C.muted, ...fw('700'), textTransform: 'uppercase', letterSpacing: 0.5 },
  sheetTitle: { fontSize: 19, ...fw('800'), color: C.text },
  closeBtn: { width: 37, height: 37, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2 },
  sheetBody: { padding: 12, gap: 9, paddingBottom: 18 },
  footer: { padding: 12, gap: 8, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.borderSoft },
  cardTitle: { fontSize: 11, ...fw('800'), color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 4 },
  qty: { minWidth: 30, height: 30, borderRadius: 6, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  qtyText: { color: C.primary, ...fw('800') },
  itemTitle: { flex: 1, fontSize: 13, color: C.text, ...fw('600') },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 9, borderTopWidth: 1, borderTopColor: C.borderSoft },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  infoText: { flex: 1, fontSize: 13, color: C.text, lineHeight: 21 },
  note: { marginTop: 6, padding: 9, borderRadius: 8, backgroundColor: C.goldSoft },
  noteText: { color: '#7C2D12', fontSize: 12, lineHeight: 20 },
  helper: { fontSize: 11, color: C.muted },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 41, paddingHorizontal: 9, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  reasonOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  reasonText: { fontSize: 13, color: C.text, ...fw('500') },
  radio: { width: 20, height: 20, borderRadius: 8, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: C.primary },
  radioDot: { width: 10, height: 10, borderRadius: 6, backgroundColor: C.primary },
  input: { marginTop: 9, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 9, minHeight: 68, fontSize: 13, color: C.text, backgroundColor: C.field, textAlignVertical: 'top' },
});
