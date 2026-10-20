import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { ClockIcon, MapPinIcon, TruckIcon } from 'react-native-heroicons/outline';
import { api } from '../api';
import { useAuth } from '../providers/AuthContext';
import { resumeRiderTracking, startRiderTracking, stopRiderTracking } from '../backgroundLocation';
import { Badge, Button, Card, EmptyState, Notice } from '../components/UI';
import { dateTime, errorText, money, statusLabel } from '../format';
import { C } from '../theme';
import type { Order } from './types';

const POLL_MS = 10000;

export function Home({ onOpenDelivery }: { onOpenDelivery: (orderId: string) => void }) {
  const { user } = useAuth();
  const [online, setOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [available, setAvailable] = useState<Order[]>([]);
  const [active, setActive] = useState<Order | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
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
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.get<{ driver: { is_online: boolean } | null }>('/drivers/me');
        setOnline(!!me.driver?.is_online);
        if (me.driver?.is_online) void resumeRiderTracking();
      } catch {}
      load();
    })();
  }, [load]);

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
      if (value) {
        load();
        const tracking = await startRiderTracking();
        if (!tracking) {
          Alert.alert(
            'Background location is off',
            'You are online, but Sokoni Hub cannot follow you when the app is closed. Allow "Always" location access in Settings so buyers see live tracking and you get matched while the app is in the background.',
          );
        }
      } else {
        await stopRiderTracking();
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
    await load();
    setRefreshing(false);
  };

  const firstName = user?.full_name?.split(' ')[0] ?? 'Rider';

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
    >
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greet}>Hello, {firstName}</Text>
          <Text style={styles.heroSub}>{online ? 'Looking for nearby deliveries' : 'You are offline'}</Text>
        </View>
        <View style={styles.toggle}>
          <Text style={[styles.toggleText, { color: online ? '#fff' : 'rgba(255,255,255,0.8)' }]}>{online ? 'Online' : 'Offline'}</Text>
          <Switch value={online} onValueChange={toggleOnline} disabled={toggling || !!active} trackColor={{ true: C.gold, false: '#9AA5A0' }} thumbColor="#fff" />
        </View>
      </View>

      {error ? <View style={{ marginTop: 14 }}><Notice tone="error">{error}</Notice></View> : null}

      {active ? (
        <>
          <Text style={styles.section}>Current delivery</Text>
          <Pressable accessibilityRole="button" onPress={() => onOpenDelivery(active.id)}>
            <Card style={styles.activeCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.code}>{active.code}</Text>
                <Badge label={statusLabel(active.status)} tone="gold" />
              </View>
              <Text style={styles.biz}>{active.business_name}</Text>
              <Text style={styles.muted}>To {active.delivery_address}</Text>
              <View style={{ marginTop: 14 }}>
                <Button title="Continue delivery" tone="gold" onPress={() => onOpenDelivery(active.id)} />
              </View>
            </Card>
          </Pressable>
        </>
      ) : null}

      {!active && !online ? (
        <EmptyState
          icon={<TruckIcon size={30} color={C.primary} />}
          title="Go online to start"
          text="Switch on when you are ready. New delivery requests will appear here."
        />
      ) : null}

      {!active && online ? (
        <>
          <Text style={styles.section}>Delivery requests</Text>
          {available.length === 0 ? (
            <EmptyState
              icon={<ClockIcon size={30} color={C.primary} />}
              title="No requests right now"
              text="We refresh automatically. Stay online and we will notify you of new orders."
            />
          ) : (
            available.map((o) => (
              <Card key={o.id} style={styles.requestCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.code}>{o.code}</Text>
                  <Text style={styles.fee}>{money(o.delivery_fee)}</Text>
                </View>
                <View style={styles.stop}>
                  <MapPinIcon size={18} color={C.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stopLabel}>PICKUP</Text>
                    <Text style={styles.stopText}>{o.business_name}</Text>
                    {o.pickup_address ? <Text style={styles.muted}>{o.pickup_address}</Text> : null}
                    <Text style={styles.distance}>
                      {o.pickup_km != null ? `${o.pickup_km.toFixed(1)} km away` : 'Distance unknown until you go online and share location'}
                    </Text>
                  </View>
                </View>
                <View style={styles.stop}>
                  <MapPinIcon size={18} color={C.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stopLabel}>DROP-OFF · {o.city}</Text>
                    <Text style={styles.stopText}>{o.delivery_address}</Text>
                  </View>
                </View>
                <Text style={styles.muted}>Placed {dateTime(o.created_at)}</Text>
                <View style={{ marginTop: 12 }}>
                  <Button title="Accept delivery" onPress={() => accept(o)} loading={accepting === o.id} disabled={!!accepting} />
                </View>
              </Card>
            ))
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, paddingBottom: 32 },
  hero: { backgroundColor: C.primary, borderRadius: 22, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  greet: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  heroSub: { color: 'rgba(255,255,255,0.82)', marginTop: 4, fontSize: 13 },
  toggle: { alignItems: 'center', gap: 2 },
  toggleText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  section: { fontSize: 13, fontWeight: '800', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 10 },
  activeCard: { borderColor: C.gold, borderWidth: 1.5 },
  requestCard: { marginBottom: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  code: { fontSize: 15, fontWeight: '900', color: C.text },
  biz: { fontSize: 17, fontWeight: '800', color: C.text, marginTop: 2 },
  fee: { fontSize: 16, fontWeight: '900', color: C.primary },
  muted: { fontSize: 13, color: C.text2, marginTop: 2 },
  distance: { fontSize: 12, fontWeight: '800', color: C.primary, marginTop: 4 },
  stop: { flexDirection: 'row', gap: 10, marginTop: 10, alignItems: 'flex-start' },
  stopLabel: { fontSize: 10, fontWeight: '900', color: C.muted, letterSpacing: 0.6 },
  stopText: { fontSize: 15, fontWeight: '700', color: C.text, marginTop: 2 },
});
