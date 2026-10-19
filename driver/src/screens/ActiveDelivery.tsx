import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { CameraIcon, CheckCircleIcon, MapPinIcon, PhoneIcon, ArrowPathIcon } from 'react-native-heroicons/outline';
import { api } from '../api';
import { Badge, Button, Card, Notice, ScreenHeader } from '../components/UI';
import { errorText, mapsLink, money, statusLabel } from '../format';
import { C } from '../theme';
import type { Order } from './types';

const LIVE_STATUSES = ['dispatched_to_driver', 'out_for_delivery', 'driver_arrived'];

export function ActiveDelivery({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState('');

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
      'It goes back to the pool for another rider. Only do this if you cannot complete the pickup.',
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

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera needed', 'Allow camera access to take a photo of the delivery.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
    if (!res.canceled && res.assets?.[0]) setPhoto(res.assets[0].uri);
  };

  const submitDelivery = async () => {
    if (!photo) return;
    setBusy(true);
    try {
      // The server checks that you are at the confirmed drop-off point, so read GPS first.
      const here = await currentPosition();
      if (!here) {
        Alert.alert('Location needed', 'Turn on location so we can confirm you are at the delivery point.');
        return;
      }
      const form = new FormData();
      form.append('files', { uri: photo, name: 'proof.jpg', type: 'image/jpeg' } as any);
      const upload = await api.post<{ urls: string[] }>('/uploads', form);
      const proofUrl = upload.urls?.[0];
      if (!proofUrl) throw new Error('The photo could not be uploaded. Please try again.');
      await api.post(`/drivers/orders/${orderId}/complete`, { proof_url: proofUrl, lat: here.lat, lng: here.lng });
      Alert.alert('Delivery recorded', 'The customer will confirm receipt. If they do not respond, the order completes automatically.', [{ text: 'Done', onPress: onDone }]);
    } catch (e) {
      Alert.alert('Could not complete delivery', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScreenHeader title="Delivery" onBack={onDone} />
        <View style={styles.pad}>
          <Notice tone="error">{error || 'This delivery could not be found.'}</Notice>
        </View>
      </View>
    );
  }

  const pickupStep = order.status === 'dispatched_to_driver';
  const dropStep = order.status === 'out_for_delivery' || order.status === 'driver_arrived';
  const finished = !LIVE_STATUSES.includes(order.status);
  const stepIndex = pickupStep ? 0 : dropStep ? 1 : 2;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader
        title={order.code}
        subtitle={statusLabel(order.status)}
        onBack={finished ? onDone : undefined}
        right={<Badge label={`Step ${Math.min(stepIndex + 1, 3)} of 3`} />}
      />
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.steps}>
          {['Pick up', 'On the way', 'Delivered'].map((label, i) => (
            <View key={label} style={styles.stepItem}>
              <View style={[styles.stepDot, i <= stepIndex && styles.stepDotOn]} />
              <Text style={[styles.stepLabel, i <= stepIndex && styles.stepLabelOn]}>{label}</Text>
            </View>
          ))}
        </View>

        {error ? <View style={{ marginBottom: 12 }}><Notice tone="error">{error}</Notice></View> : null}

        {pickupStep ? (
          <Card>
            <Text style={styles.eyebrow}>PICK UP FROM</Text>
            <Text style={styles.name}>{order.business_name}</Text>
            {order.pickup_address ? <Text style={styles.muted}>{order.pickup_address}</Text> : null}
            <View style={styles.actions}>
              {order.vendor_phone ? <ActionChip label="Call" icon={<PhoneIcon size={18} color={C.primary} />} onPress={() => Linking.openURL(`tel:${order.vendor_phone}`)} /> : null}
              {order.pickup_address ? <ActionChip label="Navigate" icon={<MapPinIcon size={18} color={C.primary} />} onPress={() => Linking.openURL(mapsLink(order.pickup_address!))} /> : null}
            </View>
            <Items items={order.items} />
            <View style={{ marginTop: 16 }}>
              <Button title="I have picked up the order" onPress={confirmPickup} loading={busy} icon={<CheckCircleIcon size={20} color="#fff" />} />
              <Button title="Give this job back" tone="secondary" onPress={releaseJob} disabled={busy} style={{ marginTop: 8 }} />
            </View>
          </Card>
        ) : null}

        {dropStep ? (
          <>
            {order.payment_method === 'cash_on_delivery' && order.payment_status !== 'paid' ? (
              <View style={{ marginBottom: 14 }}>
                <Notice>Collect {money(order.total)} in cash from the buyer before you hand over the order.</Notice>
              </View>
            ) : null}

            <Card>
              <Text style={styles.eyebrow}>DELIVER TO</Text>
              <Text style={styles.name}>{order.contact_name || 'Buyer'}</Text>
              <Text style={styles.muted}>{order.delivery_address}, {order.city}</Text>
              {order.note ? <Text style={[styles.muted, { marginTop: 8 }]}>Note: {order.note}</Text> : null}
              <View style={styles.actions}>
                {order.contact_phone ? <ActionChip label="Call buyer" icon={<PhoneIcon size={18} color={C.primary} />} onPress={() => Linking.openURL(`tel:${order.contact_phone}`)} /> : null}
                <ActionChip label="Navigate" icon={<MapPinIcon size={18} color={C.primary} />} onPress={() => Linking.openURL(mapsLink(order.delivery_address))} />
              </View>
            </Card>

            <Card style={{ marginTop: 14 }}>
              <Text style={styles.eyebrow}>PROOF OF DELIVERY</Text>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.preview} resizeMode="cover" />
              ) : (
                <View style={styles.previewEmpty}>
                  <CameraIcon size={30} color={C.muted} />
                  <Text style={styles.muted}>Take a clear photo of the delivered order at the door.</Text>
                </View>
              )}
              <View style={{ marginTop: 12, gap: 10 }}>
                <Button
                  title={photo ? 'Retake photo' : 'Take photo'}
                  tone="secondary"
                  onPress={takePhoto}
                  disabled={busy}
                  icon={photo ? <ArrowPathIcon size={18} color={C.primary} /> : <CameraIcon size={18} color={C.primary} />}
                />
                <Button title="Confirm delivery" onPress={submitDelivery} loading={busy} disabled={!photo} icon={<CheckCircleIcon size={20} color="#fff" />} />
              </View>
            </Card>
          </>
        ) : null}

        {finished ? (
          <Card>
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 10 }}>
              <CheckCircleIcon size={44} color={C.primary} />
              <Text style={styles.name}>Delivery complete</Text>
              <Text style={styles.muted}>Handed over. The customer confirms receipt, or the order completes automatically. Your earnings show on the Earnings tab once it is complete.</Text>
              <Button title="Back to home" onPress={onDone} style={{ alignSelf: 'stretch', marginTop: 8 }} />
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ActionChip({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.chip}>
      {icon}
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

function Items({ items }: { items: Order['items'] }) {
  if (!items?.length) return null;
  return (
    <View style={styles.items}>
      <Text style={styles.eyebrow}>ITEMS</Text>
      {items.map((i, idx) => (
        <Text key={idx} style={styles.itemText}>{i.qty} × {i.title}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  pad: { padding: 18, paddingBottom: 32 },
  steps: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 6 },
  stepItem: { alignItems: 'center', flex: 1, gap: 6 },
  stepDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.border },
  stepDotOn: { backgroundColor: C.primary },
  stepLabel: { fontSize: 12, color: C.muted, fontWeight: '700' },
  stepLabelOn: { color: C.primary },
  eyebrow: { fontSize: 11, fontWeight: '900', color: C.muted, letterSpacing: 0.7 },
  name: { fontSize: 19, fontWeight: '900', color: C.text, marginTop: 4 },
  muted: { fontSize: 14, color: C.text2, marginTop: 4, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  chip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 14, backgroundColor: C.primarySoft },
  chipText: { fontSize: 14, fontWeight: '800', color: C.primary },
  items: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, gap: 4 },
  itemText: { fontSize: 14, color: C.text },
  preview: { width: '100%', height: 200, borderRadius: 14, marginTop: 12, backgroundColor: C.surface2 },
  previewEmpty: { height: 140, borderRadius: 14, marginTop: 12, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
});
