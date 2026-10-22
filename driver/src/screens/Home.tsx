import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as Location from 'expo-location';
import {
  BoltIcon,
  BuildingStorefrontIcon,
  CheckCircleIcon,
  ClockIcon,
  CubeIcon,
  MapPinIcon,
  PhoneIcon,
  TruckIcon,
} from 'react-native-heroicons/outline';
import { api } from '../api';
import { useAuth } from '../providers/AuthContext';
import { resumeRiderTracking, startRiderTracking, stopRiderTracking } from '../backgroundLocation';
import { Badge, Button, Card, DriverTopbar, EmptyState, Notice, PageHeading, SectionTitle } from '../components/UI';
import { dateTime, errorText, mapsLink, mapsPointLink, money, statusLabel } from '../format';
import { C } from '../theme';
import type { Order } from './types';

const POLL_MS = 10000;
type TodaySummary = { today: number; trips_today: number };

export function Home({ onOpenDelivery, onOnlineChange }: { onOpenDelivery: (orderId: string) => void; onOnlineChange?: (online: boolean) => void }) {
  const { user } = useAuth();
  const [online, setOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [available, setAvailable] = useState<Order[]>([]);
  const [active, setActive] = useState<Order | null>(null);
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [current, open] = await Promise.all([
        api.get<{ order: Order | null }>('/drivers/active-order'),
        api.get<{ orders: Order[] }>('/drivers/available-orders'),
      ]);
      setActive(current.order);
      setAvailable(open.orders);
      setError('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const res = await api.get<{ summary: { today: number | string; trips_today: number } }>('/drivers/earnings');
      setSummary({ today: Number(res.summary.today), trips_today: Number(res.summary.trips_today) });
    } catch {
      // Order dispatch remains usable if the secondary earnings summary is unavailable.
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.get<{ driver: { is_online: boolean } | null }>('/drivers/me');
        const isOnline = !!me.driver?.is_online;
        setOnline(isOnline);
        onOnlineChange?.(isOnline);
        if (isOnline) void resumeRiderTracking();
      } catch {}
      void load();
      void loadSummary();
    })();
  }, [load, loadSummary]);

  // Refresh the request list while online.
  useEffect(() => {
    if (!online) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [online, load]);

  const toggleOnline = async (value: boolean) => {
    setToggling(true);
    try {
      const body: { is_online: boolean; lat?: number; lng?: number } = { is_online: value };
      if (value) {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          Alert.alert('Location needed', 'Allow location access so Sokoni Hub can match you with nearby deliveries.');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({});
        body.lat = pos.coords.latitude;
        body.lng = pos.coords.longitude;
      }
      await api.post('/drivers/status', body);
      setOnline(value);
      onOnlineChange?.(value);
      if (value) {
        void load();
        const tracking = await startRiderTracking();
        if (!tracking) {
          Alert.alert(
            'Background location is off',
            'You are online, but Sokoni Hub cannot follow you when the app is closed. Allow "Always" location access in Settings so buyers see live tracking and you get matched while the app is in the background.',
          );
        }
      } else {
        await stopRiderTracking();
        setAvailable([]);
      }
    } catch (e) {
      Alert.alert('Could not change status', errorText(e));
    } finally {
      setToggling(false);
    }
  };

  const accept = async (order: Order) => {
    setAccepting(order.id);
    try {
      await api.post(`/drivers/orders/${order.id}/accept`, {});
      onOpenDelivery(order.id);
    } catch (e) {
      Alert.alert('Could not accept', errorText(e));
      load();
    } finally {
      setAccepting(null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), loadSummary()]);
    setRefreshing(false);
  };

  const openActiveNavigation = () => {
    if (!active) return;
    if (active.status !== 'out_for_delivery') {
      if (active.store_lat != null && active.store_lng != null) {
        void Linking.openURL(mapsPointLink(active.store_lat, active.store_lng));
      } else if (active.pickup_address) {
        void Linking.openURL(mapsLink(active.pickup_address));
      }
      return;
    }
    void Linking.openURL(mapsLink(active.delivery_address));
  };

  const featured = available[0];
  const otherRequests = available.slice(1);
  const activeCanNavigate = !!active && (active.status === 'out_for_delivery'
    ? !!active.delivery_address
    : !!(active.pickup_address || (active.store_lat != null && active.store_lng != null)));

  return (
    <View style={styles.page}>
      <DriverTopbar online={online} name={user?.full_name} />
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        <PageHeading
          title="Delivery Queue"
          subtitle="Live dispatch & accepted trips across Qatar"
          right={(
            <View style={styles.shiftControl}>
              <Switch
                accessibilityLabel={online ? 'Go offline' : 'Go online'}
                value={online}
                onValueChange={toggleOnline}
                disabled={toggling || !!active}
                trackColor={{ true: C.primary, false: '#D7DBE2' }}
                thumbColor="#fff"
              />
              <Text style={[styles.shiftText, { color: online ? C.primary : C.text2 }]}>{active ? 'ON TRIP' : online ? 'READY' : 'OFFLINE'}</Text>
            </View>
          )}
        />

        <View style={styles.stats}>
          <StatCard label="Requests" value={loading ? '—' : String(available.length)} note="Open now" icon={<BoltIcon size={16} color={C.gold} />} />
          <StatCard label="Active" value={loading ? '—' : String(active ? 1 : 0)} note={active ? 'In progress' : 'No active trip'} icon={<TruckIcon size={16} color={C.primary} />} />
          <StatCard label="Earned today" value={summary ? money(summary.today) : '—'} note={summary ? `${summary.trips_today} completed` : 'Live summary'} icon={<CubeIcon size={16} color={C.gold} />} small />
        </View>

        {error ? <View style={styles.error}><Notice tone="error">{error}</Notice></View> : null}

        {active ? (
          <>
            <SectionTitle meta="1 in progress">Active delivery</SectionTitle>
            <Card style={styles.activeCard}>
              <View style={styles.orderTop}>
                <Text style={styles.code}>{active.code}</Text>
                <Badge label={statusLabel(active.status)} tone={active.status === 'out_for_delivery' ? 'green' : 'gold'} />
              </View>
              <View style={styles.merchantRow}>
                <View style={styles.merchantIcon}><BuildingStorefrontIcon size={23} color={C.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.biz}>{active.business_name}</Text>
                  <Text style={styles.muted} numberOfLines={2}>{active.pickup_address || active.delivery_address}</Text>
                </View>
              </View>
              <View style={styles.dropRow}>
                <MapPinIcon size={17} color={C.gold} />
                <Text style={styles.dropText} numberOfLines={2}>
                  {active.contact_name ? `${active.contact_name} · ` : ''}{active.delivery_address}, {active.city}
                </Text>
              </View>
              <View style={styles.activeActions}>
                {active.vendor_phone ? (
                  <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${active.vendor_phone}`)} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}>
                    <PhoneIcon size={18} color={C.text} />
                    <Text style={styles.secondaryActionText}>Call merchant</Text>
                  </Pressable>
                ) : null}
                {activeCanNavigate ? (
                  <Pressable accessibilityRole="button" onPress={openActiveNavigation} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}>
                    <MapPinIcon size={18} color={C.text} />
                    <Text style={styles.secondaryActionText}>Navigate</Text>
                  </Pressable>
                ) : null}
              </View>
              <Button title="Continue delivery" onPress={() => onOpenDelivery(active.id)} icon={<CheckCircleIcon size={19} color="#fff" />} style={{ marginTop: 10 }} />
            </Card>
          </>
        ) : null}

        {!active && !online && !loading ? (
          <>
            <SectionTitle>Shift paused</SectionTitle>
            <EmptyState icon={<TruckIcon size={30} color={C.primary} />} title="Go online to start" text="Switch on when you are ready. New delivery requests will appear here automatically." />
            <Button title="Start my shift" onPress={() => toggleOnline(true)} loading={toggling} style={{ marginTop: 12 }} />
          </>
        ) : null}

        {!active && online && loading ? (
          <View style={styles.loading}><ActivityIndicator color={C.primary} /><Text style={styles.loadingText}>Checking live dispatch…</Text></View>
        ) : null}

        {!active && online && !loading && !featured ? (
          <>
            <SectionTitle meta="Auto-refreshing">Delivery requests</SectionTitle>
            <EmptyState icon={<ClockIcon size={30} color={C.primary} />} title="No requests right now" text="Stay online and we will notify you as soon as a new delivery is available." />
          </>
        ) : null}

        {!active && online && featured ? (
          <>
            <SectionTitle meta={`${available.length} open`}>New delivery request</SectionTitle>
            <RequestCard order={featured} featured accepting={accepting} onAccept={accept} />
            {otherRequests.length ? (
              <>
                <SectionTitle meta={`${otherRequests.length} more`}>Other requests</SectionTitle>
                {otherRequests.map((order) => <RequestCard key={order.id} order={order} accepting={accepting} onAccept={accept} />)}
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function StatCard({ label, value, note, icon, small }: { label: string; value: string; note: string; icon: React.ReactNode; small?: boolean }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statLabelRow}><Text style={styles.statLabel} numberOfLines={1}>{label}</Text>{icon}</View>
      <Text style={[styles.statValue, small && styles.statValueSmall]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statNote} numberOfLines={1}>{note}</Text>
    </View>
  );
}

function RequestCard({ order, featured = false, accepting, onAccept }: { order: Order; featured?: boolean; accepting: string | null; onAccept: (order: Order) => void }) {
  const itemCount = (order.items ?? []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
  return (
    <Card style={[styles.requestCard, featured && styles.featuredCard]}>
      <View style={styles.orderTop}>
        <View style={styles.requestLabel}>
          {featured ? <BoltIcon size={15} color={C.gold} /> : null}
          <Text style={styles.code}>{order.code}</Text>
        </View>
        <Text style={styles.fee}>{money(order.delivery_fee)}</Text>
      </View>
      <View style={styles.requestBody}>
        <View style={styles.stop}>
          <View style={[styles.stopIcon, { backgroundColor: C.primarySoft }]}><BuildingStorefrontIcon size={18} color={C.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stopLabel}>PICKUP</Text>
            <Text style={styles.stopText}>{order.business_name}</Text>
            {order.pickup_address ? <Text style={styles.muted} numberOfLines={2}>{order.pickup_address}</Text> : null}
          </View>
        </View>
        <View style={styles.stop}>
          <View style={[styles.stopIcon, { backgroundColor: C.goldSoft }]}><MapPinIcon size={18} color={C.gold} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stopLabel}>DROP-OFF · {order.city}</Text>
            <Text style={styles.stopText} numberOfLines={2}>{order.delivery_address}</Text>
          </View>
        </View>
        <View style={styles.requestMeta}>
          <View style={styles.metaItem}><CubeIcon size={14} color={C.text2} /><Text style={styles.metaText}>{itemCount} {itemCount === 1 ? 'item' : 'items'}</Text></View>
          <View style={styles.metaItem}><MapPinIcon size={14} color={C.text2} /><Text style={styles.metaText}>{order.pickup_km != null ? `${order.pickup_km.toFixed(1)} km to pickup` : 'Share location for distance'}</Text></View>
        </View>
        <Text style={styles.created}>Placed {dateTime(order.created_at)}</Text>
      </View>
      <Button
        title={`Accept offer · ${money(order.delivery_fee)}`}
        onPress={() => onAccept(order)}
        loading={accepting === order.id}
        disabled={!!accepting}
        icon={<CheckCircleIcon size={19} color="#fff" />}
        style={{ marginTop: 12 }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 30 },
  pressed: { opacity: 0.65 },
  shiftControl: { alignItems: 'center', marginTop: -6 },
  shiftText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5, marginTop: -2 },
  stats: { flexDirection: 'row', gap: 8, marginBottom: 2 },
  statCard: { flex: 1, minWidth: 0, backgroundColor: C.surface, borderRadius: 17, borderWidth: 1, borderColor: C.border, paddingHorizontal: 11, paddingVertical: 13 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 3 },
  statLabel: { flexShrink: 1, color: C.text2, fontSize: 10, fontWeight: '700' },
  statValue: { color: C.text, fontSize: 23, lineHeight: 30, fontWeight: '900', letterSpacing: -0.5, marginTop: 5 },
  statValueSmall: { fontSize: 16 },
  statNote: { color: C.text2, fontSize: 10, marginTop: 1 },
  error: { marginTop: 12 },
  activeCard: { borderColor: C.primaryLine },
  requestCard: { marginBottom: 12 },
  featuredCard: { borderTopColor: C.gold, borderTopWidth: 3 },
  orderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  requestLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  code: { fontSize: 13, fontWeight: '900', color: C.text },
  merchantRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  merchantIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  biz: { fontSize: 17, fontWeight: '900', color: C.text, letterSpacing: -0.2 },
  muted: { fontSize: 12, lineHeight: 18, color: C.text2, marginTop: 3 },
  dropRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.surface2, borderRadius: 13, padding: 11, marginTop: 13 },
  dropText: { flex: 1, fontSize: 12, lineHeight: 18, color: C.text2 },
  activeActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  secondaryAction: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, backgroundColor: C.surface2, paddingHorizontal: 8 },
  secondaryActionText: { color: C.text, fontSize: 12, fontWeight: '800' },
  requestBody: { backgroundColor: C.infoSoft, borderRadius: 17, padding: 13, marginTop: 13 },
  stop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 12 },
  stopIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stopLabel: { fontSize: 9, fontWeight: '900', color: C.text2, letterSpacing: 0.7 },
  stopText: { fontSize: 14, lineHeight: 19, fontWeight: '800', color: C.text, marginTop: 2 },
  requestMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { color: C.text2, fontSize: 11, fontWeight: '600' },
  created: { color: C.text2, fontSize: 10, marginTop: 10 },
  fee: { fontSize: 18, fontWeight: '900', color: C.primary, letterSpacing: -0.3 },
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 46, gap: 12 },
  loadingText: { color: C.text2, fontSize: 12, fontWeight: '600' },
});
