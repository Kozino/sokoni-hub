/**
 * Track an order or booking. Opened from My Orders / My Bookings / a confirmation it loads straight away;
 * opened empty it asks for the code and the phone number used at checkout.
 * Everything shown comes from `GET /orders/track` or `GET /bookings/track`, refreshed every 15 s while open.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { api, query } from '../api';
import { API_URL } from '../config';
import { errorMessage } from '../data';
import { distanceKm, distanceLabel, durationLabel, longDate, money, placedLabel, telUrl, time12, time24, whatsappUrl } from '../format';
import { Icon, type IconName } from '../icons';
import { AppBar, Avatar, InfoLine, Panel, Pill, RoundButton, Screen, StatusPill, SubBar, Tabs, bookingLook, orderLook, softShadow } from '../kit';
import type { NavProps } from '../nav';
import { useTheme } from '../providers';
import type { Booking, Order } from '../types';
import { Button, Field, Notice, Text } from '../ui';
import { TrackMap } from './TrackMap';

const POLL_MS = 15000;
// Pending verification stays open so the buyer's confirmation and any report show up live.
const CLOSED_ORDER = ['delivered', 'cancelled'];
const CLOSED_BOOKING = ['completed', 'cancelled', 'no_show'];
const ON_THE_WAY = ['dispatched_to_driver', 'driver_arrived', 'out_for_delivery'];

type Result = { isBooking: boolean; order?: Order; booking?: Booking };

/** Which step of the journey an order has reached. */
function reached(status: string | undefined, pickup: boolean): number {
  switch (status) {
    case 'confirmed': case 'preparing': return 1;
    case 'dispatched': return pickup ? 2 : 1;
    case 'dispatched_to_driver': case 'driver_arrived': return 2;
    case 'out_for_delivery': return 3;
    case 'delivered_pending_verification': return pickup ? 3 : 4;
    case 'delivered': case 'completed': return pickup ? 3 : 4;
    default: return 0;
  }
}

function headline(order: Order): { title: string; sub: string; icon: IconName } {
  const status = order.status;
  const pickup = order.fulfilment_mode === 'pickup';
  if (status === 'cancelled') return { title: 'Order cancelled', sub: 'Contact the store if you need help.', icon: 'close-circle' };
  if (status === 'delivered_pending_verification') {
    if (order.disputed_at) return { title: 'Problem reported', sub: 'Our team is reviewing your order and will contact you if needed.', icon: 'flag' };
    return { title: 'Did your order arrive?', sub: 'Confirm it arrived, or tell us if something is wrong.', icon: 'checkmark-circle' };
  }
  if (status === 'delivered') return pickup ? { title: 'Collected', sub: 'Thanks for shopping with Sokoni Hub.', icon: 'checkmark-circle' } : { title: 'Delivered', sub: 'Enjoy your order!', icon: 'checkmark-circle' };
  if (pickup) return reached(status, true) >= 1 ? { title: 'Being prepared', sub: `Collect from ${order.business_name || 'the store'} when it is ready.`, icon: 'cube' } : { title: 'Order received', sub: 'The store will confirm shortly.', icon: 'time' };
  switch (status) {
    case 'dispatched_to_driver': return { title: 'Rider assigned', sub: 'Your rider is heading to the store.', icon: 'car' };
    case 'driver_arrived': return { title: 'Rider at the store', sub: 'Your order is being collected.', icon: 'car' };
    case 'out_for_delivery': return { title: 'On the way to you', sub: 'Keep your phone nearby.', icon: 'car' };
    case 'confirmed': case 'preparing': case 'dispatched': return { title: 'Being prepared', sub: 'The store is getting your order ready.', icon: 'cube' };
    default: return { title: 'Order received', sub: 'The store will confirm shortly.', icon: 'time' };
  }
}

const STEPS = (order: Order) => {
  const pickup = order.fulfilment_mode === 'pickup';
  const store = order.business_name || 'the store';
  return pickup
    ? [
      { title: 'Order placed', sub: `Sent to ${store}` },
      { title: 'Confirmed by store', sub: 'The store is getting your order ready' },
      { title: 'Ready for pickup', sub: `Collect from ${store}` },
      { title: 'Collected', sub: 'Pay the store when you collect' },
    ]
    : [
      { title: 'Order placed', sub: `Sent to ${store}` },
      { title: 'Confirmed by store', sub: 'The store is getting your order ready' },
      { title: 'Rider assigned', sub: 'A rider is heading to the store' },
      { title: 'Out for delivery', sub: 'Keep your phone nearby' },
      { title: 'Delivered', sub: order.status === 'delivered_pending_verification' ? 'Confirm receipt to complete your order' : 'Pay the rider in cash on delivery' },
    ];
};

export function Track({ go, back, tab, params }: NavProps & { params?: Record<string, any> }) {
  const { colors } = useTheme();
  const [orderCode, setOrderCode] = useState<string>(params?.code || '');
  const [bookingCode, setBookingCode] = useState<string>(params?.bookingCode || '');
  const [phone, setPhone] = useState<string>(params?.phone || '');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [tracked, setTracked] = useState<{ code: string; isBooking: boolean; phone: string } | null>(null);

  const fetchStatus = useCallback(async (code: string, isBooking: boolean, phoneValue: string): Promise<Result> => {
    const data = await api.get<any>(`${isBooking ? '/bookings/track' : '/orders/track'}${query({ code, phone: phoneValue })}`);
    return { isBooking, order: data.order, booking: data.booking };
  }, []);

  const run = useCallback(async (code: string, isBooking: boolean, phoneValue: string) => {
    setBusy(true); setError('');
    try {
      setResult(await fetchStatus(code, isBooking, phoneValue));
      setTracked({ code, isBooking, phone: phoneValue });
      setUpdatedAt(new Date());
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }, [fetchStatus]);

  // Arriving with a code and phone (from My Orders, a confirmation, a notification): show the order straight away.
  useEffect(() => {
    const code = params?.code || params?.bookingCode;
    if (code && params?.phone) void run(String(code).toUpperCase(), !!params?.bookingCode && !params?.code, String(params.phone));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    if (!phone.trim() || (!orderCode.trim() && !bookingCode.trim())) { setError('Enter your order or booking code and the phone number used at checkout.'); return; }
    const isBooking = !!bookingCode.trim();
    void run((isBooking ? bookingCode : orderCode).trim(), isBooking, phone.trim());
  };
  const refresh = useCallback(async () => {
    if (!tracked) return;
    try { setResult(await fetchStatus(tracked.code, tracked.isBooking, tracked.phone)); setUpdatedAt(new Date()); } catch { /* the next tick retries */ }
  }, [tracked, fetchStatus]);

  const current = result?.isBooking ? result.booking : result?.order;
  const isOpen = !!current && !(result?.isBooking ? CLOSED_BOOKING : CLOSED_ORDER).includes(current.status);
  useEffect(() => {
    if (!tracked || !isOpen) return undefined;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [tracked, isOpen, refresh]);

  const order = result?.order;
  const live = !!order && ON_THE_WAY.includes(order.status);
  const title = result ? (result.isBooking ? `Booking #${result.booking?.code}` : `Order #${result.order?.code}`) : 'Track an order';

  return (
    <Screen>
      <AppBar go={go} tab={tab} />
      <SubBar eyebrow={result ? (live ? 'LIVE STATUS' : result.isBooking ? 'BOOKING STATUS' : 'ORDER STATUS') : 'TRACKING'} title={title} back={back} right={<RoundButton icon="help" label="Get help" onPress={() => go('support')} />} />
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 56, gap: 14 }}>
        {!result ? (
          <Panel>
            <Text style={[s.formTitle, { color: colors.text }]}>Track an order or booking</Text>
            <Text style={[s.formHint, { color: colors.text2 }]}>Enter the code from your confirmation and the phone number you used.</Text>
            {error ? <View style={{ marginBottom: 12 }}><Notice type="warning">{error}</Notice></View> : null}
            <Field label="Order code" value={orderCode} onChangeText={(v) => { setOrderCode(v.toUpperCase()); if (v) setBookingCode(''); }} autoCapitalize="characters" placeholder="e.g. ORD-ABC123" />
            <Field label="Booking code (for services)" value={bookingCode} onChangeText={(v) => { setBookingCode(v.toUpperCase()); if (v) setOrderCode(''); }} autoCapitalize="characters" placeholder="e.g. BK-ABC123" />
            <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+974…" />
            <Button loading={busy} onPress={submit}>Track status</Button>
          </Panel>
        ) : result.isBooking && result.booking ? (
          <BookingView booking={result.booking} phone={tracked?.phone || ''} updatedAt={updatedAt} />
        ) : order ? (
          <OrderView order={order} phone={tracked?.phone || ''} updatedAt={updatedAt} onChanged={refresh} go={go} />
        ) : null}
        {result ? <Pressable accessibilityRole="button" onPress={() => { setResult(null); setTracked(null); setError(''); }} style={{ alignSelf: 'center', padding: 8 }}><Text style={{ color: colors.text2, fontSize: 13.5, fontWeight: '800' }}>Track another order or booking</Text></Pressable> : null}
      </ScrollView>
      <Tabs active="none" tab={tab} />
    </Screen>
  );
}

/* ------------------------------------------------------------------------------- order view */
function OrderView({ order, phone, updatedAt, onChanged, go }: { order: Order; phone: string; updatedAt: Date | null; onChanged: () => void | Promise<void>; go: NavProps['go'] }) {
  const { colors } = useTheme();
  const pickup = order.fulfilment_mode === 'pickup';
  const isOpen = !CLOSED_ORDER.includes(order.status);
  const info = headline(order);
  const look = orderLook(order.status, { pickup, disputed: !!order.disputed_at });
  const driverLat = order.driver_lat != null ? Number(order.driver_lat) : NaN;
  const driverLng = order.driver_lng != null ? Number(order.driver_lng) : NaN;
  const hasDriver = Number.isFinite(driverLat) && Number.isFinite(driverLng) && ON_THE_WAY.includes(order.status);
  const destLat = order.delivery_lat != null ? Number(order.delivery_lat) : NaN;
  const destLng = order.delivery_lng != null ? Number(order.delivery_lng) : NaN;
  const hasDest = Number.isFinite(destLat) && Number.isFinite(destLng) && !pickup;
  const showMap = isOpen && (hasDriver || hasDest);
  const away = hasDriver && hasDest ? distanceKm({ lat: driverLat, lng: driverLng }, { lat: destLat, lng: destLng }) : null;
  const steps = STEPS(order);
  const at = reached(order.status, pickup);
  const complete = order.status === 'delivered';
  const cancelled = order.status === 'cancelled';
  const itemCount = order.items?.reduce((sum, item) => sum + Number(item.qty || 0), 0) ?? 0;
  const mapsUrl = hasDest ? Platform.select({ ios: `http://maps.apple.com/?daddr=${destLat},${destLng}`, default: `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}` }) : '';
  const paid = order.payment_status === 'paid';
  const stamp = (index: number) => (index === 0 ? time12(order.created_at) : index === steps.length - 1 && order.delivered_at ? time12(order.delivered_at) : index === at && !complete && order.updated_at ? time12(order.updated_at) : '');

  return (
    <>
      <LinearGradient colors={[colors.primary, colors.deep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.codeCard}>
        <View style={s.codeTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="shield-checkmark" solid={false} size={19} color={colors.orange} /><Text style={s.codeEyebrow}>ORDER REFERENCE</Text></View>
          <View style={s.codePill}><Text style={s.codePillText}>{paid ? 'Paid' : 'Cash on delivery'}</Text></View>
        </View>
        <View style={s.codeInner}>
          <View style={{ flex: 1 }}>
            <Text style={s.codeLabel}>ORDER CODE</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={s.codeValue}>{order.code}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Share order code" onPress={() => void Share.share({ message: `My Sokoni Hub order code is ${order.code}` }).catch(() => {})} style={[s.codeShare, { backgroundColor: colors.lav2 }]}><Icon name="share" solid={false} size={20} color={colors.text} /></Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Icon name="information-circle" solid={false} size={15} color="#CFEBDC" /><Text style={s.codeNote}>Quote this code if you contact the store or support.</Text></View>
      </LinearGradient>

      <Panel>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={[s.eyebrowOrange, { color: colors.orange }]}>{ON_THE_WAY.includes(order.status) ? 'ON ITS WAY' : cancelled ? 'CANCELLED' : complete ? 'COMPLETED' : 'CURRENT STATUS'}</Text>
            <Text style={[s.headline, { color: colors.primary }]}>{info.title}</Text>
            <Text style={[s.sub, { color: colors.text2 }]}>{info.sub}</Text>
          </View>
          <View style={[s.bigIcon, { backgroundColor: cancelled ? colors.dangerSoft : colors.orangeSoft }]}><Icon name={info.icon} solid={false} size={30} color={cancelled ? colors.dangerText : colors.orange} /></View>
        </View>
        {isOpen && (away !== null || (!pickup && order.delivery_address)) ? (
          <View style={[s.dotRow, { borderTopColor: colors.border }]}>
            <View style={[s.pulse, { backgroundColor: colors.orange }]} />
            <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '800', color: colors.text, lineHeight: 20 }}>{away !== null ? `Your rider is about ${distanceLabel(away)} from your delivery point` : `Delivering to ${order.delivery_address}`}</Text>
          </View>
        ) : null}
        {updatedAt ? <Text style={{ fontSize: 12, color: colors.muted, marginTop: 10, fontWeight: '600' }}>{isOpen ? 'Updates automatically · ' : ''}Last checked {time12(updatedAt.toISOString())}</Text> : null}
      </Panel>

      {showMap ? (
        <View style={[s.mapCard, { backgroundColor: colors.surface, borderColor: colors.border }, softShadow(colors.shadow)]}>
          <TrackMap driver={hasDriver ? { lat: driverLat, lng: driverLng } : null} destination={hasDest ? { lat: destLat, lng: destLng } : null} live={hasDriver} />
          <View style={s.mapBar}>
            <Icon name="navigate" solid={false} size={18} color={colors.text2} />
            <Text numberOfLines={2} style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.text2 }}>{hasDriver ? (away !== null ? `${distanceLabel(away)} to your delivery point` : 'Following your rider live') : 'Your delivery point'}</Text>
            {hasDriver ? <Pill tone="mint" small>Live Route</Pill> : null}
            {mapsUrl ? <Pressable accessibilityRole="button" accessibilityLabel="Open in maps" onPress={() => void Linking.openURL(mapsUrl as string)}><Text style={{ color: colors.primary, fontSize: 13.5, fontWeight: '800' }}>Open map</Text></Pressable> : null}
          </View>
        </View>
      ) : null}

      <RiderPanel order={order} active={isOpen} />

      <Panel>
        <View style={s.progressHead}><Text style={[s.panelTitle, { color: colors.text }]}>Order Progress</Text><StatusPill look={look} small /></View>
        {cancelled ? (
          <View style={{ gap: 14, marginTop: 14 }}>
            <Step done title={steps[0].title} sub={steps[0].sub} time={time12(order.created_at)} last={false} />
            <Step cancelled title="Order cancelled" sub="No payment is due for this order" time="" last />
          </View>
        ) : (
          <View style={{ marginTop: 14 }}>
            {steps.map((step, index) => (
              <Step key={step.title} done={complete || index < at} active={!complete && index === at && isOpen} title={step.title} sub={step.sub} time={stamp(index)} last={index === steps.length - 1} />
            ))}
          </View>
        )}
      </Panel>

      <Panel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="location" solid={false} size={18} color={colors.text2} /><Text style={[s.eyebrow, { color: colors.text2 }]}>{pickup ? 'PICK UP FROM' : 'DELIVERY DESTINATION'}</Text></View>
        <Text style={[s.addr, { color: colors.text }]}>{pickup ? order.business_name || 'The store' : order.delivery_address}</Text>
        {!pickup ? <Text style={{ fontSize: 14, color: colors.text2, fontWeight: '600', marginTop: 4 }}>{[order.city, order.country].filter(Boolean).join(', ')}</Text> : null}
        {order.note ? (
          <View style={[s.noteBox, { backgroundColor: colors.orangeSoft }]}>
            <Icon name="document-text" solid={false} size={19} color={colors.orange} />
            <View style={{ flex: 1 }}><Text style={{ fontSize: 13.5, fontWeight: '800', color: colors.text }}>Your note to the seller</Text><Text style={{ fontSize: 14, color: colors.text2, marginTop: 2, fontStyle: 'italic' }}>“{order.note}”</Text></View>
          </View>
        ) : null}
      </Panel>

      <Panel>
        <Text style={[s.panelTitle, { color: colors.text }]}>{order.business_name || 'Sokoni Hub'}</Text>
        <Text style={{ fontSize: 13.5, color: colors.text2, fontWeight: '600', marginTop: 3 }}>
          Cash on delivery · {paid ? 'Paid' : cancelled ? 'Not charged' : pickup ? 'Pay at the store' : 'Pay the rider in cash'}
        </Text>
        {order.items?.length ? (
          <View style={{ marginTop: 14, gap: 10 }}>
            {order.items.map((item) => (
              <View key={item.id ?? item.title} style={s.itemRow}>
                <Text numberOfLines={2} style={{ flex: 1, fontSize: 14.5, color: colors.text, fontWeight: '600' }}>{item.qty} × {item.title}</Text>
                <Text style={{ fontSize: 14.5, fontWeight: '800', color: colors.text }}>{money(item.line_total, order.currency)}</Text>
              </View>
            ))}
            <View style={[s.rule, { backgroundColor: colors.border }]} />
            <View style={s.itemRow}><Text style={{ fontSize: 14, color: colors.text2 }}>Delivery</Text><Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{Number(order.delivery_fee) > 0 ? money(order.delivery_fee, order.currency) : 'Free'}</Text></View>
            <View style={s.itemRow}><Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{itemCount} item{itemCount === 1 ? '' : 's'} · Total</Text><Text style={{ fontSize: 18, fontWeight: '800', color: colors.primary }}>{money(order.total, order.currency)}</Text></View>
          </View>
        ) : null}
      </Panel>

      {order.status === 'delivered_pending_verification' ? <VerifyPanel order={order} phone={phone} onChanged={onChanged} /> : null}
      {['pending', 'confirmed'].includes(order.status) && !order.driver ? <CancelPanel order={order} phone={phone} onChanged={onChanged} /> : null}

      {order.delivery_proof_url ? (
        <Panel>
          <Text style={[s.panelTitle, { color: colors.text }]}>Proof of delivery</Text>
          <Image source={{ uri: order.delivery_proof_url }} style={{ width: '100%', height: 200, borderRadius: 16, marginTop: 12 }} contentFit="cover" />
        </Panel>
      ) : null}

      {isOpen && !order.delivery_lat && !pickup ? <Notice>This order was placed before delivery pins were added, so the map can only show your rider.</Notice> : null}

      <Pressable accessibilityRole="button" accessibilityLabel="Need help with this order" onPress={() => go('support')} style={({ pressed }) => [s.help, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.9 : 1 }, softShadow(colors.shadow)]}>
        <Icon name="help-buoy" solid={false} size={21} color={colors.primary} /><Text style={{ fontSize: 16, fontWeight: '800', color: colors.primary }}>Need Help with this Order?</Text>
      </Pressable>
      <Text style={{ textAlign: 'center', fontSize: 12.5, fontWeight: '700', color: colors.text2 }}>Sokoni Hub Support · we answer on WhatsApp and email</Text>
    </>
  );
}

function RiderPanel({ order, active }: { order: Order; active: boolean }) {
  const { colors } = useTheme();
  const driver = order.driver;
  if (!driver) {
    return (
      <Panel style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
        <View style={[s.riderAvatar, { backgroundColor: colors.surface2 }]}><Icon name="time" solid={false} size={22} color={colors.text2} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{order.fulfilment_mode === 'pickup' ? 'No rider needed' : 'Rider not assigned yet'}</Text>
          <Text style={{ fontSize: 13.5, color: colors.text2, marginTop: 2, lineHeight: 19 }}>{order.fulfilment_mode === 'pickup' ? 'You will collect this order from the store.' : active ? 'You will see your rider here once one accepts your order.' : 'No rider was needed for this order.'}</Text>
        </View>
      </Panel>
    );
  }
  const vehicle = [driver.vehicle_type, driver.license_plate && `Plate ${driver.license_plate}`].filter(Boolean).join(' • ');
  const call = telUrl(driver.phone);
  const chat = whatsappUrl(driver.phone, `Hi ${driver.name}, I'm waiting for my Sokoni Hub order ${order.code}.`);
  const first = driver.name.split(' ')[0];
  return (
    <Panel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
        <Avatar name={driver.name} size={56} tone="deep" />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text numberOfLines={1} style={{ fontSize: 18, fontWeight: '800', color: colors.text, flexShrink: 1 }}>{driver.name}</Text><Pill tone="orange" small>Courier</Pill></View>
          <Text numberOfLines={2} style={{ fontSize: 13.5, color: colors.text2, fontWeight: '600', marginTop: 3 }}>{vehicle || 'Sokoni Hub rider'}</Text>
        </View>
      </View>
      {call || chat ? (
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
          {call ? <Button variant="tonal" iconLeft="call" style={{ flex: 1 }} onPress={() => void Linking.openURL(call)}>{`Call ${first}`}</Button> : null}
          {chat ? <Button variant="mint" iconLeft="chat" style={{ flex: 1 }} onPress={() => void Linking.openURL(chat)}>WhatsApp</Button> : null}
        </View>
      ) : null}
    </Panel>
  );
}

function Step({ title, sub, time, done, active, cancelled, last }: { title: string; sub: string; time: string; done?: boolean; active?: boolean; cancelled?: boolean; last: boolean }) {
  const { colors } = useTheme();
  const color = cancelled ? colors.danger : done ? colors.primary : active ? colors.primary : colors.border;
  return (
    <View style={{ flexDirection: 'row', gap: 14 }}>
      <View style={{ width: 30, alignItems: 'center' }}>
        <View style={[s.stepDot, done || cancelled ? { backgroundColor: color } : active ? { backgroundColor: colors.deep, borderWidth: 4, borderColor: colors.primarySoft } : { backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: colors.border }]}>
          {cancelled ? <Icon name="close" size={14} color="#FFFFFF" /> : done ? <Icon name="check" size={14} color="#FFFFFF" /> : active ? <Icon name="car" solid={false} size={14} color="#FFFFFF" /> : <Icon name="lock-closed" solid={false} size={12} color={colors.muted} />}
        </View>
        {!last ? <View style={[s.stepLine, { backgroundColor: done ? colors.primary : colors.border }]} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 15.5, fontWeight: '800', color: done || active || cancelled ? colors.text : colors.muted }}>{title}</Text>
          {active ? <Pill tone="mint" small>Active</Pill> : time ? <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text2 }}>{time}</Text> : !done && !cancelled ? <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.muted }}>Pending</Text> : null}
        </View>
        <Text style={{ fontSize: 13.5, lineHeight: 19, color: done || active || cancelled ? colors.text2 : colors.muted, marginTop: 2 }}>{sub}</Text>
      </View>
    </View>
  );
}

/** Buyer can cancel until a rider has accepted the order. The server enforces the same rule. */
function CancelPanel({ order, phone, onChanged }: { order: Order; phone: string; onChanged: () => void | Promise<void> }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const cancel = () => Alert.alert('Cancel this order?', 'The store will be told, and the reserved items are released.', [
    { text: 'Keep order', style: 'cancel' },
    { text: 'Cancel order', style: 'destructive', onPress: async () => {
      setBusy(true);
      try { await api.post('/orders/track/cancel', { code: order.code, phone }); await onChanged(); }
      catch (e) { Alert.alert('Could not cancel', errorMessage(e)); }
      finally { setBusy(false); }
    } },
  ]);
  return (
    <Panel>
      <Text style={[s.panelTitle, { color: colors.text }]}>Changed your mind?</Text>
      <Text style={{ fontSize: 13.5, color: colors.text2, marginTop: 6, lineHeight: 19 }}>You can cancel until a rider accepts the order. After that, contact the store.</Text>
      <Button variant="secondary" loading={busy} disabled={busy} onPress={cancel} style={{ marginTop: 14 }}>Cancel order</Button>
    </Panel>
  );
}

/** Buyer's confirmation step: confirm receipt, or report a problem before the window closes. */
function VerifyPanel({ order, phone, onChanged }: { order: Order; phone: string; onChanged: () => void | Promise<void> }) {
  const { colors } = useTheme();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<null | 'confirm' | 'report'>(null);
  const due = order.verify_by ? `${longDate(order.verify_by)}, ${time12(order.verify_by)}` : null;

  if (order.disputed_at) {
    return (
      <Panel>
        <Text style={[s.panelTitle, { color: colors.text }]}>Problem reported</Text>
        {order.dispute_reason ? <Text style={{ fontSize: 13.5, color: colors.text2, marginTop: 6, lineHeight: 19 }}>“{order.dispute_reason}”</Text> : null}
        <View style={{ marginTop: 12 }}><Notice>Our team is reviewing this order. You will not be charged again for it.</Notice></View>
      </Panel>
    );
  }
  const confirm = async () => {
    setBusy('confirm');
    try { await api.post('/orders/track/confirm', { code: order.code, phone }); await onChanged(); }
    catch (e) { Alert.alert('Could not confirm', errorMessage(e)); }
    finally { setBusy(null); }
  };
  const report = async () => {
    if (reason.trim().length < 5) return Alert.alert('Tell us what happened', 'Add a few words so we can help.');
    setBusy('report');
    try { await api.post('/orders/track/report', { code: order.code, phone, reason: reason.trim() }); await onChanged(); }
    catch (e) { Alert.alert('Could not send your report', errorMessage(e)); }
    finally { setBusy(null); }
  };
  return (
    <Panel style={{ borderColor: colors.primary, borderWidth: 1.5 }}>
      <Text style={[s.panelTitle, { color: colors.text }]}>Did your order arrive?</Text>
      <Text style={{ fontSize: 13.5, color: colors.text2, marginTop: 6, lineHeight: 19 }}>{due ? `It will be marked complete automatically on ${due} unless you tell us there is a problem.` : 'It will be marked complete automatically unless you tell us there is a problem.'}</Text>
      <Button variant="deep" loading={busy === 'confirm'} disabled={!!busy} onPress={() => void confirm()} style={{ marginTop: 14 }}>Yes, I received it</Button>
      {reporting ? (
        <View style={{ marginTop: 8 }}>
          <Field label="What went wrong?" value={reason} onChangeText={setReason} multiline placeholder="e.g. Missing items, wrong order, not delivered" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="secondary" style={{ flex: 1 }} disabled={!!busy} onPress={() => setReporting(false)}>Cancel</Button>
            <Button style={{ flex: 1 }} loading={busy === 'report'} disabled={!!busy} onPress={() => void report()}>Send report</Button>
          </View>
        </View>
      ) : <Button variant="tonal" disabled={!!busy} onPress={() => setReporting(true)} style={{ marginTop: 10 }}>Report a problem</Button>}
    </Panel>
  );
}

/* ----------------------------------------------------------------------------- booking view */
function BookingView({ booking, phone, updatedAt }: { booking: Booking; phone: string; updatedAt: Date | null }) {
  const { colors } = useTheme();
  const look = bookingLook(booking.status);
  const start = booking.slot_starts_at || booking.scheduled_at || booking.preferred_at;
  const agreed = !!(booking.slot_starts_at || booking.scheduled_at);
  const live = ['new', 'contacted', 'confirmed'].includes(booking.status);
  const home = booking.location_type === 'home';
  const duration = durationLabel(booking.duration_mins);
  const wa = whatsappUrl(booking.vendor_whatsapp, `Hi, I'm writing about my booking #${booking.code}.`);
  const price = booking.quoted_price !== undefined && booking.quoted_price !== null && Number(booking.quoted_price) > 0 ? Number(booking.quoted_price) : null;
  return (
    <>
      <Panel>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={[s.eyebrowOrange, { color: colors.orange }]}>{live ? 'BOOKING STATUS' : 'BOOKING'}</Text>
            <Text style={[s.headline, { color: colors.primary }]}>{booking.status === 'completed' ? 'Service completed' : booking.status === 'confirmed' ? 'Booking confirmed' : booking.status === 'cancelled' ? 'Booking cancelled' : 'Booking received'}</Text>
            <Text style={[s.sub, { color: colors.text2 }]}>{booking.listing_title || 'Your booking'}{booking.business_name ? ` · ${booking.business_name}` : ''}</Text>
          </View>
          <StatusPill look={look} small />
        </View>
        {updatedAt ? <Text style={{ fontSize: 12, color: colors.muted, marginTop: 10, fontWeight: '600' }}>{live ? 'Updates automatically · ' : ''}Last checked {time12(updatedAt.toISOString())}</Text> : null}
      </Panel>
      <Panel style={{ gap: 14 }}>
        <InfoLine icon="calendar" title={start ? `${agreed ? '' : 'Requested: '}${longDate(start)} • ${time24(start)}${booking.slot_ends_at ? ` - ${time24(booking.slot_ends_at)}` : ''}` : 'Time to be arranged'} sub={!agreed && start ? 'The provider will confirm the exact time' : duration ? `${duration} estimated service duration` : undefined} />
        <InfoLine icon="location" tint={colors.brown} title={home ? 'Home visit appointment' : 'At the provider’s location'} sub={home ? booking.address || undefined : booking.vendor_address || booking.vendor_city || undefined} />
        <InfoLine icon="shield-checkmark" title={price !== null ? `${booking.quoted_price_type === 'from' ? 'From ' : 'Total: '}${money(price, booking.currency || 'QAR')}` : 'Price agreed with the provider'} sub="Pay the provider directly" />
      </Panel>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {wa ? <Button variant="deep" iconLeft="chat" style={{ flex: 1 }} onPress={() => void Linking.openURL(wa)}>Message Provider</Button> : null}
        {live && agreed ? <Button variant="tonal" iconLeft="calendar" style={{ flex: 1 }} onPress={() => void Linking.openURL(`${API_URL}/api/bookings/ics${query({ code: booking.code, phone })}`)}>Add to calendar</Button> : null}
      </View>
      <Text style={{ textAlign: 'center', fontSize: 12.5, color: colors.muted, fontWeight: '600' }}>{placedLabel(booking.created_at, 'Requested')}</Text>
    </>
  );
}

const s = StyleSheet.create({
  formTitle: { fontSize: 19, fontWeight: '800' },
  formHint: { fontSize: 13.5, lineHeight: 19, marginTop: 4, marginBottom: 14 },
  codeCard: { borderRadius: 24, padding: 16, gap: 14, overflow: 'hidden' },
  codeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  codeEyebrow: { color: '#CFEBDC', fontSize: 12, fontWeight: '800', letterSpacing: 1.1 },
  codePill: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 11, paddingHorizontal: 11, height: 24, justifyContent: 'center' },
  codePillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  codeInner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14 },
  codeLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1, color: '#5B6674' },
  codeValue: { fontSize: 25, fontWeight: '800', color: '#004C2D', letterSpacing: 1.2, marginTop: 3 },
  codeShare: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  codeNote: { color: '#CFEBDC', fontSize: 12.5, fontWeight: '600', flex: 1 },
  eyebrowOrange: { fontSize: 12, fontWeight: '800', letterSpacing: 1.1 },
  headline: { fontSize: 27, fontWeight: '800', letterSpacing: -0.6, marginTop: 6, lineHeight: 32 },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 5, fontWeight: '500' },
  bigIcon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  pulse: { width: 12, height: 12, borderRadius: 6 },
  mapCard: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  mapBar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  panelTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  progressHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepLine: { flex: 1, width: 2, marginVertical: 3, minHeight: 20 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.1 },
  addr: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginTop: 10, lineHeight: 24 },
  noteBox: { flexDirection: 'row', gap: 11, borderRadius: 16, padding: 14, marginTop: 14 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rule: { height: StyleSheet.hairlineWidth },
  riderAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  help: { height: 58, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 4 },
});
