import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { api, ApiError } from '../api';
import { WEB_URL } from '../config';
import { checkPush, enablePush, openNotificationSettings, PushState } from '../usePushToken';
import { Avatar, Banner, Btn, Card, Group, Icon, Row, ScreenHeader, Pill } from '../ui/kit';
import { C } from '../theme';
import { fw } from '../ui/type';

type Vendor = { business_name: string; city?: string | null; alerts_enabled: boolean };

export function Account({ onGo, onSignOut }: { onGo: (tab: 'availability') => void; onSignOut: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [alerts, setAlerts] = useState(true);
  const [error, setError] = useState('');
  const [push, setPush] = useState<PushState | null>(null);

  useEffect(() => {
    void checkPush().then(setPush).catch(() => {});
  }, []);

  const fixPush = async () => {
    if (push?.canOpenSettings) return openNotificationSettings();
    setPush(await enablePush());
  };

  useEffect(() => {
    api
      .get<{ vendor: Vendor }>('/vendors/me')
      .then((r) => {
        setVendor(r.vendor);
        setAlerts(r.vendor.alerts_enabled);
      })
      .catch((e: any) => setError(e?.message || 'Could not load your store.'))
      .finally(() => setLoading(false));
  }, []);

  const toggleAlerts = async (enabled: boolean) => {
    const previous = alerts;
    setAlerts(enabled);
    setSaving(true);
    setError('');
    try {
      await api.put('/vendors/me/alerts', { enabled });
    } catch (e: any) {
      setAlerts(previous); // Put the switch back if the change did not save.
      setError(e instanceof ApiError ? e.message : 'Could not change alerts. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You will need your password or PIN to sign in again.', [
      { text: 'Stay signed in', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: onSignOut },
    ]);
  };

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const name = vendor?.business_name || 'Your store';

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Account" subtitle="Your store" />
      {loading ? (
        <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.frame} contentContainerStyle={styles.body}>
          {error ? <Banner tone="error">{error}</Banner> : null}

          <Card style={styles.profile}>
            <Avatar text={name} size={60} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.name} numberOfLines={2}>{name}</Text>
              {vendor?.city ? (
                <View style={styles.cityRow}>
                  <Icon name="map-pin" size={15} color={C.muted} />
                  <Text style={styles.city}>{vendor.city}</Text>
                </View>
              ) : null}
              <Pill label="Store account" tone="brand" icon="check-badge" />
            </View>
          </Card>

          <Group label="Alerts">
            <Row
              icon="bell"
              tone="brand"
              title="Order and booking alerts"
              subtitle={alerts ? 'Sound alerts for new orders, bookings and cancellations' : 'Off. You will not hear about new orders or bookings on this phone.'}
              right={<Switch accessibilityLabel="Order and booking alerts" value={alerts} disabled={saving} onValueChange={toggleAlerts} trackColor={{ true: C.primary }} />}
            />
            <Row
              icon="bell-alert"
              tone="slate"
              title="Phone notifications"
              subtitle={push ? push.message : 'Checking this phone…'}
              onPress={push && push.state !== 'ready' ? fixPush : undefined}
              right={push && push.state !== 'ready' ? <Text style={styles.fix}>{push.canOpenSettings ? 'Open settings' : 'Turn on'}</Text> : undefined}
            />
          </Group>

          <Group label="Store">
            <Row icon="calendar-days" tone="violet" title="Availability" subtitle="Opening hours, closures and booking rules" onPress={() => onGo('availability')} />
            <Row icon="building-storefront" tone="amber" title="Listings and store profile" subtitle="Edit on the Sokoni Hub website" onPress={() => Linking.openURL(WEB_URL)} />
            <Row icon="banknotes" tone="green" title="Statements, wallet, platform bill and plans" subtitle="Pay or view your monthly service fee bill on the Sokoni Hub website" onPress={() => Linking.openURL(WEB_URL)} />
          </Group>

          <Group label="About">
            <Row icon="information-circle" tone="slate" title="App version" right={<Text style={styles.version}>{version}</Text>} />
          </Group>

          <Btn label="Sign out" variant="danger" icon="arrow-right-on-rectangle" onPress={confirmSignOut} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  frame: { width: '100%', maxWidth: 760, alignSelf: 'center', flex: 1 },
  body: { padding: 16, gap: 22, paddingBottom: 40 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  name: { fontSize: 19, ...fw('800'), color: C.text },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  city: { fontSize: 14, color: C.muted, ...fw('600') },
  version: { fontSize: 14, color: C.muted, ...fw('600') },
  fix: { fontSize: 14, color: C.primary, ...fw('800') },
});
