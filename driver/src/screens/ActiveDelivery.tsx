import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import {
  ArrowPathIcon,
  BuildingStorefrontIcon,
  CameraIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  MapPinIcon,
  PhoneIcon,
  ShieldCheckIcon,
} from 'react-native-heroicons/outline';
import { api } from '../api';
import { pendingDelivery, sendDelivery, isOffline, type PendingDelivery } from '../pendingDelivery';
import { Badge, Button, Card, Notice, ScreenHeader } from '../components/UI';
import { errorText, mapsLink, mapsPointLink, money, statusLabel } from '../format';
import { C } from '../theme';
import type { Order } from './types';

const LIVE_STATUSES = ['dispatched_to_driver', 'out_for_delivery', 'driver_arrived'];

/** Proof photo is kept on the device per order, so it survives an app restart at the door. */
const proofPath = (orderId: string) => `${FileSystem.documentDirectory ?? ''}proof-${orderId}.jpg`;

export function ActiveDelivery({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Cash-on-delivery: the rider must say they collected the money before they can finish.
  const [cashConfirmed, setCashConfirmed] = useState(false);
  // A delivery saved on the phone that is still waiting for signal.
  const [queued, setQueued] = useState<PendingDelivery | null>(null);
  const [finishError, setFinishError] = useState('');

  const reload = useCallback(async () => {
    try {
      const res = await api.get<{ order: Order }>(`/drivers/orders/${orderId}`);
      setOrder(res.order);
      setError('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    FileSystem.getInfoAsync(proofPath(orderId))
      .then((info) => { if (!cancelled && info.exists) setPhoto(info.uri); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [orderId]);

  // Share the rider's position with the buyer while the delivery is live.
  const status = order?.status;
  useEffect(() => {
    if (!status || !LIVE_STATUSES.includes(status)) return;
    let stopped = false;
    const send = async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!stopped) {
          await api.post(`/drivers/orders/${orderId}/location`, { lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch {
        // A missed ping is harmless; the next one will retry.
      }
    };
    send();
    const timer = setInterval(send, 15000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [status, orderId]);

  const releaseJob = () => {
    Alert.alert(
      'Give this job back?',
      'It goes back to the pool for another driver. Only do this if you cannot complete the pickup.',
      [
        { text: 'Keep job', style: 'cancel' },
        {
          text: 'Give back',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await api.post(`/drivers/orders/${orderId}/release`, {});
              onDone();
            } catch (e) {
              Alert.alert('Could not give the job back', errorText(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  /** Reads the rider's GPS now. Returns null when location is off, so the caller can stop. */
  const currentPosition = async (): Promise<{ lat: number; lng: number } | null> => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return null;
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: fix.coords.latitude, lng: fix.coords.longitude };
  };

  const confirmPickup = async () => {
    setBusy(true);
    try {
      // The server checks you are at the store, so pickup needs your location.
      const here = await currentPosition();
      if (!here) {
        Alert.alert('Location needed', 'Turn on location so we can confirm you are at the store.');
        return;
      }
      await api.post(`/drivers/orders/${orderId}/pickup`, here);
      await reload();
    } catch (e) {
      Alert.alert('Could not confirm pickup', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmArrival = async () => {
    setBusy(true);
    try {
      // The server checks you are at the store, so arrival needs your location.
      const here = await currentPosition();
      if (!here) {
        Alert.alert('Location needed', 'Turn on location so we can confirm you are at the store.');
        return;
      }
      await api.post(`/drivers/orders/${orderId}/arrive`, here);
      await reload();
    } catch (e) {
      Alert.alert('Could not confirm arrival', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera needed', 'Allow camera access to take a photo of the delivery.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
    if (res.canceled || !res.assets?.[0]) return;
    const dest = proofPath(orderId);
    try {
      await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
      await FileSystem.copyAsync({ from: res.assets[0].uri, to: dest });
      setPhoto(dest);
    } catch {
      setPhoto(res.assets[0].uri);
    }
  };

  const finishedOk = useCallback(async () => {
    await pendingDelivery.clear(orderId);
    await FileSystem.deleteAsync(proofPath(orderId), { idempotent: true }).catch(() => {});
    setQueued(null);
    Alert.alert('Delivery recorded', 'The customer will confirm receipt. If they do not respond, the order completes automatically.', [{ text: 'Done', onPress: onDone }]);
  }, [orderId, onDone]);

  /** One attempt to send a saved delivery. Network failures keep it queued; other errors stop the queue. */
  const attemptSend = useCallback(async (p: PendingDelivery) => {
    setBusy(true);
    try {
      await sendDelivery(p);
      await finishedOk();
    } catch (e) {
      if (isOffline(e)) {
        setQueued(p);
        setFinishError('No signal. Your delivery is saved on this phone and will be sent automatically when you are back online.');
      } else {
        // The server may already have it (reply lost on a weak connection). Check before showing an error.
        try {
          const res = await api.get<{ order: Order }>(`/drivers/orders/${orderId}`);
          if (!LIVE_STATUSES.includes(res.order.status)) { await finishedOk(); return; }
        } catch { /* fall through to the error */ }
        await pendingDelivery.clear(orderId);
        setQueued(null);
        setFinishError(errorText(e));
      }
    } finally {
      setBusy(false);
    }
  }, [orderId, finishedOk]);

  // Pick up a delivery that was saved before the app closed.
  useEffect(() => {
    let cancelled = false;
    pendingDelivery.load(orderId).then((p) => {
      if (p && !cancelled) {
        setQueued(p);
        setCashConfirmed(p.cashCollected);
        setPhoto(p.proofUri);
      }
    });
    return () => { cancelled = true; };
  }, [orderId]);

  // While a delivery is queued, keep retrying quietly.
  useEffect(() => {
    if (!queued) return;
    const timer = setInterval(() => { if (!busy) void attemptSend(queued); }, 10000);
    return () => clearInterval(timer);
  }, [queued, busy, attemptSend]);

  const submitDelivery = async () => {
    if (!photo) return;
    setFinishError('');
    if (queued) return attemptSend(queued);
    setBusy(true);
    let pending: PendingDelivery;
    try {
      // The server checks that you are at the confirmed drop-off point, so read GPS first.
      const here = await currentPosition();
      if (!here) {
        setFinishError('Turn on location so we can confirm you are at the delivery point.');
        setBusy(false);
        return;
      }
      pending = { orderId, proofUri: photo, lat: here.lat, lng: here.lng, cashCollected: cashConfirmed };
      await pendingDelivery.save(pending); // saved first, so nothing is lost if the signal drops
    } catch (e) {
      setFinishError(errorText(e));
      setBusy(false);
      return;
    }
    setBusy(false);
    await attemptSend(pending);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.loadingText}>Loading order navigation…</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.page}>
        <ScreenHeader title="Order Navigation" onBack={onDone} />
        <View style={styles.pad}><Notice tone="error">{error || 'This delivery could not be found.'}</Notice></View>
      </View>
    );
  }

  // Pickup covers both: heading to the store, and arrived at the store (waiting for the goods).
  const pickupStep = order.status === 'dispatched_to_driver' || order.status === 'driver_arrived';
  const dropStep = order.status === 'out_for_delivery';
  const finished = !LIVE_STATUSES.includes(order.status);
  const cancelled = order.status === 'cancelled';
  const stepIndex = pickupStep ? 0 : dropStep ? 1 : 2;
  const needsCash = order.payment_method === 'cash_on_delivery' && order.payment_status !== 'paid';

  const openRoute = () => {
    if (pickupStep && order.store_lat != null && order.store_lng != null) {
      return Linking.openURL(mapsPointLink(order.store_lat, order.store_lng));
    }
    const address = pickupStep ? order.pickup_address : order.delivery_address;
    if (address) return Linking.openURL(mapsLink(address));
    return undefined;
  };

  const whatsapp = order.contact_phone ? `https://wa.me/${order.contact_phone.replace(/\D/g, '')}` : null;
  const canNavigate = pickupStep
    ? !!(order.pickup_address || (order.store_lat != null && order.store_lng != null))
    : !!order.delivery_address;

  return (
    <View style={styles.page}>
      <ScreenHeader
        title="Order Navigation"
        subtitle={order.code}
        onBack={onDone}
        right={<Badge label={finished ? statusLabel(order.status) : `Step ${Math.min(stepIndex + 1, 3)} of 3`} tone={finished ? 'grey' : 'green'} />}
      />
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.statusStrip}>
          <View style={[styles.statusDot, dropStep && { backgroundColor: C.primary }]} />
          <Text style={styles.statusText} numberOfLines={1}>{statusLabel(order.status).toUpperCase()} · ORDER {order.code}</Text>
          {queued ? <Badge label="Offline queue" tone="gold" /> : null}
        </View>

        {!finished ? <DeliverySteps index={stepIndex} /> : null}
        {error ? <View style={{ marginBottom: 12 }}><Notice tone="error">{error}</Notice></View> : null}

        {!finished ? (
          <Card style={styles.routeCard}>
            <View style={styles.routeRow}>
              <View style={styles.routeIcon}><MapPinIcon size={24} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.routeEyebrow}>{pickupStep ? 'PICKUP NAVIGATION' : 'DROP-OFF NAVIGATION'}</Text>
                <Text style={styles.routeTitle}>{pickupStep ? `Head to ${order.business_name}` : `Deliver to ${order.contact_name || 'the buyer'}`}</Text>
                <Text style={styles.routeAddress} numberOfLines={2}>{pickupStep ? order.pickup_address || 'Pickup address unavailable' : `${order.delivery_address}, ${order.city}`}</Text>
              </View>
            </View>
            {canNavigate ? (
              <Button title={pickupStep ? 'Navigate to pickup' : 'Navigate to drop-off'} tone="gold" onPress={openRoute} icon={<MapPinIcon size={19} color="#201B14" />} style={{ marginTop: 14 }} />
            ) : (
              <Text style={styles.routeMissing}>{pickupStep ? 'Navigation is unavailable until the store adds a pickup address or map pin.' : 'Drop-off navigation is unavailable because no delivery address was supplied.'}</Text>
            )}
          </Card>
        ) : null}

        {pickupStep ? (
          <>
            <Card style={styles.block}>
              <View style={styles.partyHead}>
                <View style={styles.partyAvatar}><BuildingStorefrontIcon size={25} color={C.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eyebrow}>PICK UP FROM</Text>
                  <Text style={styles.name}>{order.business_name}</Text>
                </View>
                <Badge label={order.status === 'driver_arrived' ? 'At store' : 'Pickup'} tone={order.status === 'driver_arrived' ? 'green' : 'gold'} />
              </View>
              {order.pickup_address ? (
                <View style={styles.addressBox}>
                  <MapPinIcon size={18} color={C.gold} />
                  <Text style={styles.addressText}>{order.pickup_address}</Text>
                </View>
              ) : null}
              <View style={styles.actions}>
                {order.vendor_phone ? <ActionChip label="Call merchant" icon={<PhoneIcon size={18} color={C.text} />} onPress={() => Linking.openURL(`tel:${order.vendor_phone}`)} /> : null}
                {canNavigate ? <ActionChip label="Open map" icon={<MapPinIcon size={18} color={C.text} />} onPress={openRoute} /> : null}
              </View>
            </Card>

            <Manifest items={order.items} />

            {order.status === 'driver_arrived' ? (
              <View style={{ marginBottom: 12 }}><Notice>You are at the store. Collect the order, check the items, then confirm pickup.</Notice></View>
            ) : null}

            {order.status === 'dispatched_to_driver' ? (
              <Button title="I have arrived at the store" onPress={confirmArrival} loading={busy} icon={<MapPinIcon size={20} color="#fff" />} />
            ) : (
              <Button title="Confirm package pickup" onPress={confirmPickup} loading={busy} icon={<CheckCircleIcon size={20} color="#fff" />} />
            )}
            <Pressable accessibilityRole="button" onPress={releaseJob} disabled={busy} style={({ pressed }) => [styles.issueButton, pressed && { opacity: 0.6 }]}>
              <ExclamationTriangleIcon size={17} color={C.text2} />
              <Text style={styles.issueText}>Unable to collect? Give this job back</Text>
            </Pressable>
          </>
        ) : null}

        {dropStep ? (
          <>
            <Card style={styles.block}>
              <View style={styles.partyHead}>
                <View style={styles.partyAvatar}><ShieldCheckIcon size={25} color={C.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eyebrow}>DELIVER TO</Text>
                  <Text style={styles.name}>{order.contact_name || 'Buyer'}</Text>
                </View>
                <Badge label="Drop-off" />
              </View>
              <View style={styles.addressBox}>
                <MapPinIcon size={18} color={C.gold} />
                <Text style={styles.addressText}>{order.delivery_address}, {order.city}</Text>
              </View>
              {order.note ? (
                <View style={styles.noteBox}>
                  <Text style={styles.noteText}><Text style={{ fontWeight: '900' }}>Delivery note: </Text>{order.note}</Text>
                </View>
              ) : null}
              <View style={styles.actions}>
                {order.contact_phone ? <ActionChip label={`Call ${order.contact_name?.split(' ')[0] || 'buyer'}`} icon={<PhoneIcon size={18} color={C.text} />} onPress={() => Linking.openURL(`tel:${order.contact_phone}`)} /> : null}
                {whatsapp ? <ActionChip label="WhatsApp" tone="green" icon={<ChatBubbleLeftRightIcon size={18} color={C.primary} />} onPress={() => Linking.openURL(whatsapp)} /> : null}
              </View>
            </Card>

            <Manifest items={order.items} />

            <Card style={styles.block}>
              <View style={styles.paymentRow}>
                <View style={[styles.paymentIcon, needsCash && { backgroundColor: C.goldSoft }]}><LockClosedIcon size={21} color={needsCash ? C.gold : C.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.paymentTitle}>{needsCash ? 'Cash on delivery' : (order.payment_method || 'Payment').replace(/_/g, ' ')}</Text>
                  <Text style={styles.paymentSub}>{needsCash ? `Collect ${money(order.total)} before handoff` : order.payment_status === 'paid' ? 'Payment confirmed · no cash to collect' : 'Check payment status before handoff'}</Text>
                </View>
                <Badge label={order.payment_status === 'paid' ? 'Paid' : needsCash ? 'Collect cash' : 'Unpaid'} tone={order.payment_status === 'paid' ? 'green' : 'gold'} />
              </View>
              {needsCash ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: cashConfirmed, disabled: !!queued }}
                  accessibilityLabel={`I collected ${money(order.total)} in cash`}
                  disabled={!!queued}
                  onPress={() => setCashConfirmed((v) => !v)}
                  style={[styles.cashRow, cashConfirmed && styles.cashRowOn]}
                >
                  <View style={[styles.box, cashConfirmed && styles.boxOn]}>{cashConfirmed ? <CheckCircleIcon size={20} color="#fff" /> : null}</View>
                  <Text style={styles.cashText}>I collected {money(order.total)} in cash</Text>
                </Pressable>
              ) : null}
            </Card>

            <Card style={styles.block}>
              <View style={styles.proofHeading}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eyebrow}>HANDOFF VERIFICATION</Text>
                  <Text style={styles.proofTitle}>Photo proof of delivery</Text>
                </View>
                <View style={styles.proofIcon}><CameraIcon size={19} color={C.primary} /></View>
              </View>
              <Text style={styles.proofIntro}>Take a clear photo of the delivered order at the handoff point. Your GPS position is verified when you submit.</Text>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.preview} resizeMode="cover" />
              ) : (
                <View style={styles.previewEmpty}>
                  <CameraIcon size={30} color={C.muted} />
                  <Text style={styles.previewText}>No delivery photo yet</Text>
                </View>
              )}
              <Button
                title={photo ? 'Retake photo' : 'Take delivery photo'}
                tone="secondary"
                onPress={takePhoto}
                disabled={busy}
                icon={photo ? <ArrowPathIcon size={18} color={C.text} /> : <CameraIcon size={18} color={C.text} />}
                style={{ marginTop: 12 }}
              />
              {finishError ? <View style={{ marginTop: 12 }}><Notice tone={queued ? 'info' : 'error'}>{finishError}</Notice></View> : null}
              <Button
                title={queued ? 'Send saved delivery now' : 'Confirm & complete delivery'}
                onPress={submitDelivery}
                loading={busy}
                disabled={!photo || (needsCash && !cashConfirmed)}
                icon={<CheckCircleIcon size={20} color="#fff" />}
                style={{ marginTop: 10 }}
              />
              {needsCash && !cashConfirmed && !queued ? <Text style={styles.helper}>Confirm the cash collection above to enable completion.</Text> : null}
              {!photo ? <Text style={styles.helper}>A delivery photo is required to complete this order.</Text> : null}
            </Card>
          </>
        ) : null}

        {finished ? (
          <Card style={styles.finishedCard}>
            <View style={[styles.finishedIcon, cancelled && { backgroundColor: C.dangerSoft }]}>
              {cancelled ? <ExclamationTriangleIcon size={34} color={C.danger} /> : <CheckCircleIcon size={36} color={C.primary} />}
            </View>
            <Text style={styles.finishedTitle}>{cancelled ? 'Delivery cancelled' : order.status === 'delivered' ? 'Delivery complete' : 'Handoff recorded'}</Text>
            <Text style={styles.finishedText}>
              {cancelled
                ? 'This order is no longer active. Return to the queue for your next delivery.'
                : order.status === 'delivered'
                  ? 'The delivery is complete and its fee is included in your earnings.'
                  : 'The customer will confirm receipt, or the order will complete automatically. The fee then appears in your earnings.'}
            </Text>
            <Button title="Back to delivery queue" onPress={onDone} style={{ alignSelf: 'stretch', marginTop: 10 }} />
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

function DeliverySteps({ index }: { index: number }) {
  return (
    <View style={styles.steps}>
      {['Pick up', 'On the way', 'Handoff'].map((label, i) => (
        <React.Fragment key={label}>
          {i > 0 ? <View style={[styles.stepLine, i <= index && styles.stepLineOn]} /> : null}
          <View style={styles.stepItem}>
            <View style={[styles.stepDot, i <= index && styles.stepDotOn]}>{i < index ? <CheckCircleIcon size={13} color="#fff" /> : null}</View>
            <Text style={[styles.stepLabel, i <= index && styles.stepLabelOn]}>{label}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function ActionChip({ label, icon, onPress, tone = 'grey' }: { label: string; icon: React.ReactNode; onPress: () => void; tone?: 'grey' | 'green' }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.chip, tone === 'green' && { backgroundColor: C.primarySoft }, pressed && { opacity: 0.65 }]}>
      {icon}
      <Text style={[styles.chipText, tone === 'green' && { color: C.primary }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function Manifest({ items }: { items: Order['items'] }) {
  const count = (items ?? []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
  return (
    <Card style={styles.block}>
      <View style={styles.manifestHead}>
        <View style={styles.manifestTitleRow}><CubeIcon size={20} color={C.text} /><Text style={styles.manifestTitle}>Package Manifest</Text></View>
        <Text style={styles.manifestCount}>{count} {count === 1 ? 'item' : 'items'}</Text>
      </View>
      {items?.length ? items.map((item, idx) => (
        <View key={`${item.title}-${idx}`} style={styles.itemRow}>
          <View style={styles.itemIcon}><CubeIcon size={19} color={C.primary} /></View>
          <Text style={styles.itemText}>{item.title}</Text>
          <View style={styles.qtyBadge}><Text style={styles.qtyText}>{item.qty}×</Text></View>
        </View>
      )) : <Text style={styles.emptyItems}>No package items were supplied for this order.</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  loadingText: { marginTop: 14, fontSize: 13, color: C.text2 },
  pad: { padding: 16, paddingBottom: 34 },
  statusStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, paddingHorizontal: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.gold },
  statusText: { flex: 1, color: '#B65C00', fontSize: 10, fontWeight: '900', letterSpacing: 0.55 },
  steps: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, paddingHorizontal: 6 },
  stepItem: { alignItems: 'center', gap: 5, minWidth: 58 },
  stepDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#DDE1E7', alignItems: 'center', justifyContent: 'center' },
  stepDotOn: { backgroundColor: C.primary },
  stepLine: { flex: 1, height: 2, backgroundColor: '#DDE1E7', marginTop: 7 },
  stepLineOn: { backgroundColor: C.primary },
  stepLabel: { fontSize: 10, color: C.muted, fontWeight: '700' },
  stepLabelOn: { color: C.primary },
  routeCard: { backgroundColor: C.primary, borderColor: C.primary, marginBottom: 12 },
  routeRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  routeIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  routeEyebrow: { color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  routeTitle: { color: '#fff', fontSize: 17, lineHeight: 22, fontWeight: '900', marginTop: 3 },
  routeAddress: { color: 'rgba(255,255,255,0.78)', fontSize: 12, lineHeight: 17, marginTop: 4 },
  routeMissing: { color: 'rgba(255,255,255,0.78)', fontSize: 11, lineHeight: 17, marginTop: 14 },
  block: { marginBottom: 12 },
  partyHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  partyAvatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 9, fontWeight: '900', color: C.text2, letterSpacing: 0.85 },
  name: { fontSize: 18, fontWeight: '900', color: C.text, marginTop: 3, letterSpacing: -0.25 },
  addressBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: C.infoSoft, padding: 13, borderRadius: 15, marginTop: 14 },
  addressText: { flex: 1, color: C.text, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  noteBox: { backgroundColor: C.goldSoft, borderRadius: 15, padding: 13, marginTop: 10 },
  noteText: { color: '#7F4B16', fontSize: 12, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 12 },
  chip: { minHeight: 46, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11, paddingHorizontal: 9, borderRadius: 14, backgroundColor: C.surface2 },
  chipText: { flexShrink: 1, fontSize: 12, fontWeight: '800', color: C.text },
  manifestHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  manifestTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  manifestTitle: { color: C.text, fontSize: 16, fontWeight: '900', letterSpacing: -0.2 },
  manifestCount: { color: C.text2, fontSize: 11, fontWeight: '700' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 14, backgroundColor: C.infoSoft, marginTop: 8 },
  itemIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, color: C.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  qtyBadge: { backgroundColor: C.surface, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  qtyText: { color: C.primary, fontSize: 12, fontWeight: '900' },
  emptyItems: { color: C.text2, fontSize: 12, lineHeight: 18, backgroundColor: C.surface2, borderRadius: 12, padding: 12 },
  issueButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 18, paddingHorizontal: 12 },
  issueText: { color: C.text2, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  paymentIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  paymentTitle: { color: C.text, fontSize: 14, fontWeight: '900', textTransform: 'capitalize' },
  paymentSub: { color: C.text2, fontSize: 11, lineHeight: 16, marginTop: 3 },
  cashRow: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 56, paddingHorizontal: 13, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface2, marginTop: 14 },
  cashRowOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  box: { width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.primary, borderColor: C.primary },
  cashText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '800', color: C.text },
  proofHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  proofTitle: { color: C.text, fontSize: 18, fontWeight: '900', marginTop: 4, letterSpacing: -0.25 },
  proofIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  proofIntro: { color: C.text2, fontSize: 12, lineHeight: 19, marginTop: 12 },
  preview: { width: '100%', height: 190, borderRadius: 15, marginTop: 13, backgroundColor: C.surface2 },
  previewEmpty: { height: 126, borderRadius: 15, marginTop: 13, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
  previewText: { color: C.text2, fontSize: 12, fontWeight: '600' },
  helper: { color: C.text2, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 9 },
  finishedCard: { alignItems: 'center', padding: 24, marginTop: 4 },
  finishedIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  finishedTitle: { color: C.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.4, textAlign: 'center' },
  finishedText: { color: C.text2, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 9, marginBottom: 8 },
});
