import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { AnimatedRegion, Marker, Polyline } from 'react-native-maps';
import Svg, { Circle, Path } from 'react-native-svg';
import { Image } from 'expo-image';
import { api, ApiError, query } from '../api';
import { useTheme } from '../providers';
import { Button, Card, Divider, Field, Header, Money, Notice, Text } from '../ui';
import { Icon } from '../icons';
import { Status } from './Status';

const POLL_MS = 15000;
const CLOSED_ORDER = ['delivered', 'delivered_pending_verification', 'cancelled'];
const CLOSED_BOOKING = ['completed', 'cancelled'];
const ON_THE_WAY = ['dispatched_to_driver', 'driver_arrived', 'out_for_delivery'];
const DOHA = { latitude: 25.2854, longitude: 51.531 };

const message = (error: any) =>
  error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const dateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'To be arranged';

const STEPS = [
  { key: 'placed', label: 'Order placed' },
  { key: 'confirmed', label: 'Confirmed by store' },
  { key: 'on_the_way', label: 'On the way' },
  { key: 'delivered', label: 'Delivered' },
] as const;

function stepIndex(status?: string | null): number {
  switch (status) {
    case 'confirmed':
    case 'preparing':
      return 1;
    case 'dispatched':
    case 'dispatched_to_driver':
    case 'driver_arrived':
    case 'out_for_delivery':
      return 2;
    case 'delivered':
    case 'delivered_pending_verification':
    case 'completed':
      return 3;
    default:
      return 0;
  }
}

function headline(order: any): { title: string; sub: string } {
  const status = order?.status;
  const pickup = order?.fulfilment_mode === 'pickup';
  if (status === 'cancelled') return { title: 'Order cancelled', sub: 'Contact the store if you need help.' };
  if (status === 'delivered' || status === 'delivered_pending_verification') {
    return pickup ? { title: 'Collected', sub: 'Thanks for shopping with Sokoni Hub.' } : { title: 'Delivered', sub: 'Enjoy your order!' };
  }
  if (pickup) {
    return stepIndex(status) >= 1 ? { title: 'Being prepared', sub: `Collect from ${order?.business_name || 'the store'}.` } : { title: 'Order received', sub: 'The store will confirm shortly.' };
  }
  switch (status) {
    case 'dispatched_to_driver':
      return { title: 'Rider assigned', sub: 'Your rider is heading to the store.' };
    case 'driver_arrived':
      return { title: 'Rider at the store', sub: 'Your order is being collected.' };
    case 'out_for_delivery':
      return { title: 'On the way to you', sub: 'Keep your phone nearby.' };
    case 'confirmed':
    case 'preparing':
    case 'dispatched':
      return { title: 'Being prepared', sub: 'The store is getting your order ready.' };
    default:
      return { title: 'Order received', sub: 'The store will confirm shortly.' };
  }
}

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const MAP_STYLE = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

/** Bike facing right by default; rotated so it points along the direction of travel. */
function RiderMarker({ heading, color }: { heading: number; color: string }) {
  return (
    <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[styles.riderDot, { backgroundColor: color, transform: [{ rotate: `${heading - 90}deg` }] }]}>
        <Svg width={28} height={28} viewBox="0 0 24 24">
          <Circle cx={6} cy={16} r={3.5} stroke="#FFFFFF" strokeWidth={2} fill="none" />
          <Circle cx={18} cy={16} r={3.5} stroke="#FFFFFF" strokeWidth={2} fill="none" />
          <Path d="M6 16 L10 9 L15 9 L18 16 M10 9 L12 16 L6 16" stroke="#FFFFFF" strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={15} cy={5} r={2} fill="#FFFFFF" />
        </Svg>
      </View>
    </View>
  );
}

/** House icon marking the customer's confirmed delivery point. */
function DestinationMarker({ color }: { color: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[styles.destDot, { backgroundColor: color }]}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d="M3 11 L12 4 L21 11 V20 H14.5 V14.5 H9.5 V20 H3 Z" fill="#FFFFFF" strokeLinejoin="round" />
        </Svg>
      </View>
      <View style={[styles.destTip, { borderTopColor: color }]} />
    </View>
  );
}

function TrackMap({ driver, destination, live }: {
  driver: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  live: boolean;
}) {
  const { colors } = useTheme();
  const mapRef = useRef<MapView>(null);
  const start = driver ?? destination ?? { lat: DOHA.latitude, lng: DOHA.longitude };
  const position = useRef(new AnimatedRegion({ latitude: start.lat, longitude: start.lng, latitudeDelta: 0, longitudeDelta: 0 })).current;
  const [trail, setTrail] = useState<{ latitude: number; longitude: number }[]>([]);
  const [heading, setHeading] = useState(0);
  const previous = useRef<{ lat: number; lng: number } | null>(null);
  const driverLat = driver?.lat;
  const driverLng = driver?.lng;
  const destLat = destination?.lat;
  const destLng = destination?.lng;

  // Glide the bike between position updates, turn it only when it really moved,
  // and keep the rider and the delivery point in view together.
  useEffect(() => {
    if (driverLat === undefined || driverLng === undefined) return;
    const next = { lat: driverLat, lng: driverLng };
    const prev = previous.current;
    if (!prev) {
      position.setValue({ latitude: next.lat, longitude: next.lng, latitudeDelta: 0, longitudeDelta: 0 });
    } else {
      if (prev.lat === next.lat && prev.lng === next.lng) return;
      if (metres(prev, next) > 3) setHeading(bearing(prev, next));
      position.timing({ latitude: next.lat, longitude: next.lng, duration: 900, useNativeDriver: false } as any).start();
    }
    previous.current = next;
    setTrail((points) => [...points.slice(-39), { latitude: next.lat, longitude: next.lng }]);
    const coords = [{ latitude: next.lat, longitude: next.lng }];
    if (destLat !== undefined && destLng !== undefined) coords.push({ latitude: destLat, longitude: destLng });
    if (coords.length > 1) {
      mapRef.current?.fitToCoordinates(coords, { edgePadding: { top: 80, right: 60, bottom: 180, left: 60 }, animated: true });
    } else {
      mapRef.current?.animateToRegion({ latitude: next.lat, longitude: next.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 900);
    }
  }, [driverLat, driverLng, destLat, destLng, position]);

  // Before any rider has reported a position, frame the delivery point alone.
  useEffect(() => {
    if (driverLat !== undefined || destLat === undefined || destLng === undefined) return;
    mapRef.current?.animateToRegion({ latitude: destLat, longitude: destLng, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 600);
  }, [driverLat, destLat, destLng]);

  const initial = { latitude: start.lat, longitude: start.lng, latitudeDelta: 0.012, longitudeDelta: 0.012 };

  return (
    <View style={[styles.mapBox, { backgroundColor: colors.surface2 }]}>
      <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={initial} customMapStyle={MAP_STYLE} showsCompass={false} toolbarEnabled={false}>
        {trail.length > 1 ? <Polyline coordinates={trail} strokeColor={colors.primary} strokeWidth={4} /> : null}
        {destination ? (
          <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false} title="Delivery point">
            <DestinationMarker color={colors.text} />
          </Marker>
        ) : null}
        {driver ? (
          <Marker.Animated coordinate={position as any} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={true} title="Your rider">
            <RiderMarker heading={heading} color={colors.primary} />
          </Marker.Animated>
        ) : null}
      </MapView>
      {live ? (
        <View style={styles.liveBadge}>
          <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
          <Text style={styles.liveText}>Live</Text>
        </View>
      ) : null}
    </View>
  );
}

function RiderCard({ driver, order, active }: { driver: any; order: any; active: boolean }) {
  const { colors } = useTheme();
  if (!driver) {
    return (
      <View style={[styles.riderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.surface2 }]}>
          <Icon name="time" size={22} color={colors.text2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.riderName, { color: colors.text }]}>Rider not assigned yet</Text>
          <Text style={[styles.riderMeta, { color: colors.text2 }]}>
            {active ? 'You will see your rider here once one accepts your order.' : 'No rider was needed for this order.'}
          </Text>
        </View>
      </View>
    );
  }
  const initials = String(driver.name || 'R').split(' ').map((part: string) => part[0]).slice(0, 2).join('').toUpperCase();
  const vehicle = [driver.vehicle_type, driver.license_plate].filter(Boolean).join(' · ');
  return (
    <View style={[styles.riderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
        <Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.riderName, { color: colors.text }]} numberOfLines={1}>{driver.name}</Text>
        <Text style={[styles.riderMeta, { color: colors.text2 }]} numberOfLines={1}>{vehicle || 'Sokoni Hub rider'}</Text>
      </View>
      {driver.phone ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Call ${driver.name}`}
          onPress={() => Linking.openURL(`tel:${driver.phone}`)}
          style={[styles.callButton, { backgroundColor: colors.primary }]}
        >
          <Icon name="call" size={18} color="#FFFFFF" />
          <Text style={styles.callText}>Call rider</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Track({ go, back, params }: any) {
  const { colors } = useTheme();
  const [orderCode, setOrderCode] = useState(params?.code || '');
  const [bookingCode, setBookingCode] = useState(params?.bookingCode || '');
  const [phone, setPhone] = useState(params?.phone || '');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [trackedPhone, setTrackedPhone] = useState('');
  const [trackedCode, setTrackedCode] = useState<{ code: string; isBooking: boolean } | null>(null);

  const fetchStatus = useCallback(async (code: string, isBooking: boolean, phoneValue: string) => {
    const path = isBooking ? `/bookings/track${query({ code, phone: phoneValue })}` : `/orders/track${query({ code, phone: phoneValue })}`;
    const data = await api.get<any>(path);
    return { ...data, isBooking };
  }, []);

  const track = async () => {
    if (!phone || (!orderCode && !bookingCode)) {
      return Alert.alert('Enter tracking details', 'Use either your order or booking code and the phone used at checkout.');
    }
    const isBooking = !!bookingCode;
    const code = isBooking ? bookingCode : orderCode;
    setBusy(true);
    try {
      const data = await fetchStatus(code, isBooking, phone);
      setResult(data);
      setTrackedPhone(phone);
      setTrackedCode({ code, isBooking });
      setUpdatedAt(new Date());
    } catch (e) {
      Alert.alert('Could not find it', message(e));
    } finally {
      setBusy(false);
    }
  };

  const current = result?.isBooking ? result?.booking : result?.order;
  const isOpen = !!current && !(result?.isBooking ? CLOSED_BOOKING : CLOSED_ORDER).includes(current.status);

  // Refresh while the order is still open.
  useEffect(() => {
    if (!trackedCode || !isOpen) return;
    const timer = setInterval(async () => {
      try {
        const data = await fetchStatus(trackedCode.code, trackedCode.isBooking, trackedPhone);
        setResult(data);
        setUpdatedAt(new Date());
      } catch {
        // Keep the last known status; the next tick retries.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [trackedCode, trackedPhone, isOpen, fetchStatus]);

  const order = result?.order;
  const driverLat = order?.driver_lat != null ? Number(order.driver_lat) : NaN;
  const driverLng = order?.driver_lng != null ? Number(order.driver_lng) : NaN;
  const hasDriverPosition = Number.isFinite(driverLat) && Number.isFinite(driverLng) && ON_THE_WAY.includes(order?.status);
  const destLat = order?.delivery_lat != null ? Number(order.delivery_lat) : NaN;
  const destLng = order?.delivery_lng != null ? Number(order.delivery_lng) : NaN;
  const hasDestination = Number.isFinite(destLat) && Number.isFinite(destLng) && order?.fulfilment_mode !== 'pickup';
  const showMap = !!order && isOpen && (hasDriverPosition || hasDestination);
  const title = result ? (result.isBooking ? result.booking?.code : result.order?.code) : '';
  const info = order ? headline(order) : null;
  const itemCount = order?.items?.reduce((sum: number, item: any) => sum + Number(item.qty || 0), 0) ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Track" back={back} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {!result ? (
          <Card style={{ padding: 16, borderRadius: 18 }}>
            <Text style={[styles.formTitle, { color: colors.text }]}>Track an order or booking</Text>
            <Text style={[styles.formHint, { color: colors.text2 }]}>Enter the code from your confirmation and the phone number used at checkout.</Text>
            <Field label="Order code" value={orderCode} onChangeText={(value) => { setOrderCode(value.toUpperCase()); if (value) setBookingCode(''); }} autoCapitalize="characters" placeholder="e.g. ORD-ABC123" />
            <Field label="Booking code (for services)" value={bookingCode} onChangeText={(value) => { setBookingCode(value.toUpperCase()); if (value) setOrderCode(''); }} autoCapitalize="characters" placeholder="e.g. BK-ABC123" />
            <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+974…" />
            <Button loading={busy} onPress={track} style={{ marginTop: 8 }}>Track status</Button>
          </Card>
        ) : (
          <>
            <View style={styles.topRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.codeLabel, { color: colors.text2 }]}>{result.isBooking ? 'Booking' : 'Order'}</Text>
                <Text style={[styles.code, { color: colors.text }]} numberOfLines={1}>{title}</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => { setResult(null); setTrackedCode(null); }} style={[styles.linkChip, { borderColor: colors.border }]}>
                <Text style={[styles.linkChipText, { color: colors.text2 }]}>Track another</Text>
              </Pressable>
            </View>

            {showMap ? (
              <View style={{ marginTop: 14 }}>
                <TrackMap
                  driver={hasDriverPosition ? { lat: driverLat, lng: driverLng } : null}
                  destination={hasDestination ? { lat: destLat, lng: destLng } : null}
                  live={hasDriverPosition}
                />
              </View>
            ) : null}

            {!result.isBooking && order ? (
              <View style={{ marginTop: showMap ? -40 : 14 }}>
                <RiderCard driver={order.driver} order={order} active={isOpen} />
              </View>
            ) : null}

            <Card style={{ marginTop: 14, padding: 16, borderRadius: 18 }}>
              <View style={styles.headRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.headline, { color: colors.text }]}>{result.isBooking ? (current?.status === 'completed' ? 'Service completed' : 'Booking received') : info?.title}</Text>
                  <Text style={[styles.sub, { color: colors.text2 }]}>{result.isBooking ? (result.booking?.listing_title || 'Your booking') : info?.sub}</Text>
                </View>
                <Status value={current?.status} />
              </View>
              {updatedAt ? (
                <Text style={[styles.updated, { color: colors.muted }]}>
                  {isOpen ? 'Updates automatically · ' : ''}Last checked {updatedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </Text>
              ) : null}

              {!result.isBooking ? (
                <View style={{ marginTop: 16 }}>
                  {STEPS.map((step, index) => {
                    const reached = stepIndex(order?.status);
                    const done = index <= reached;
                    const active = index === reached;
                    const last = index === STEPS.length - 1;
                    return (
                      <View key={step.key} style={{ flexDirection: 'row' }}>
                        <View style={{ width: 22, alignItems: 'center' }}>
                          <View style={[styles.stepDot, { backgroundColor: done ? colors.primary : colors.border, borderWidth: active ? 3 : 0, borderColor: colors.primaryLine }]} />
                          {!last ? <View style={[styles.stepLine, { backgroundColor: index < reached ? colors.primary : colors.border }]} /> : null}
                        </View>
                        <Text style={[styles.stepText, { color: done ? colors.text : colors.text2, fontWeight: active ? '800' : '600', paddingBottom: last ? 0 : 18 }]}>{step.label}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </Card>

            {result.isBooking ? (
              <Card style={{ marginTop: 14, padding: 16, borderRadius: 18 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Preferred time</Text>
                <Text style={[styles.sub, { color: colors.text2 }]}>{dateTime(result.booking?.slot_starts_at || result.booking?.scheduled_at || result.booking?.preferred_at)}</Text>
              </Card>
            ) : null}

            {order ? (
              <Card style={{ marginTop: 14, padding: 16, borderRadius: 18 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{order.business_name || 'Sokoni Hub'}</Text>
                <Text style={[styles.sub, { color: colors.text2 }]}>
                  {order.fulfilment_mode === 'pickup' ? 'Collection from store' : order.delivery_address}
                </Text>
                {order.items?.length ? (
                  <>
                    <Divider />
                    {order.items.map((item: any) => (
                      <View key={item.id} style={styles.itemRow}>
                        <Text style={[styles.itemText, { color: colors.text }]} numberOfLines={1}>{item.qty} × {item.title}</Text>
                        <Money value={item.line_total} currency={order.currency} />
                      </View>
                    ))}
                    <Divider />
                    <View style={styles.itemRow}>
                      <Text style={[styles.itemText, { color: colors.text2 }]}>{itemCount} item{itemCount === 1 ? '' : 's'} · Total</Text>
                      <Money value={order.total} currency={order.currency} strong />
                    </View>
                  </>
                ) : null}
              </Card>
            ) : null}

            {order?.delivery_proof_url ? (
              <Card style={{ marginTop: 14, padding: 16, borderRadius: 18 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Proof of delivery</Text>
                <Image source={{ uri: order.delivery_proof_url }} style={{ width: '100%', height: 200, borderRadius: 12, marginTop: 10 }} contentFit="cover" />
              </Card>
            ) : null}

            {order && isOpen && !order.delivery_lat && order.fulfilment_mode !== 'pickup' ? (
              <View style={{ marginTop: 14 }}><Notice>This order was placed before delivery pins were added, so the map shows the rider only.</Notice></View>
            ) : null}

            {order?.whatsapp_url ? (
              <Button variant="secondary" onPress={() => Linking.openURL(order.whatsapp_url)} style={{ marginTop: 14 }}>
                Contact seller on WhatsApp
              </Button>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  formTitle: { fontSize: 18, fontWeight: '900' },
  formHint: { fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  codeLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  code: { fontSize: 20, fontWeight: '900', marginTop: 2 },
  linkChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  linkChipText: { fontSize: 12, fontWeight: '700' },
  mapBox: { height: 320, borderRadius: 20, overflow: 'hidden' },
  liveBadge: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, elevation: 3 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 12, fontWeight: '800', color: '#111827' },
  riderDot: { width: 46, height: 46, borderRadius: 23, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
  destDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', elevation: 4 },
  destTip: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -1 },
  riderCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 12, padding: 12, borderRadius: 18, borderWidth: 1, elevation: 4, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '900' },
  riderName: { fontSize: 16, fontWeight: '800' },
  riderMeta: { fontSize: 13, marginTop: 2 },
  callButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  callText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headline: { fontSize: 20, fontWeight: '900' },
  sub: { fontSize: 14, marginTop: 4, lineHeight: 20 },
  updated: { fontSize: 12, marginTop: 8 },
  stepDot: { width: 14, height: 14, borderRadius: 7, marginTop: 3 },
  stepLine: { flex: 1, width: 2, minHeight: 26 },
  stepText: { flex: 1, fontSize: 15, paddingLeft: 12, paddingTop: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginVertical: 6 },
  itemText: { fontSize: 14, flex: 1 },
});
