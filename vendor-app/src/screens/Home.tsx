import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Switch, Text, View } from 'react-native';
import { api, ApiError } from '../api';
import { useAuth } from '../providers/AuthContext';
import { Button, Notice } from '../components/AuthUI';
import { Orders } from './Orders';
import { Bookings } from './Bookings';
import { Availability } from './Availability';
import { C } from '../theme';

type Tab = 'orders' | 'bookings' | 'availability' | 'account';
const TITLES: Record<Tab, string> = { orders: 'Orders', bookings: 'Bookings', availability: 'Availability', account: 'Account' };

export function Home() {
  const { logout } = useAuth();
  const [tab, setTab] = useState<Tab>('orders');

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.heading}>{TITLES[tab]}</Text>
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'orders' ? <Orders /> : null}
        {tab === 'bookings' ? <Bookings /> : null}
        {tab === 'availability' ? <Availability /> : null}
        {tab === 'account' ? <Account onSignOut={() => void logout()} /> : null}
      </View>

      <View style={styles.tabs}>
        {(Object.keys(TITLES) as Tab[]).map((key) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            onPress={() => setTab(key)}
            style={styles.tab}
          >
            <Text numberOfLines={1} style={[styles.tabText, tab === key && styles.tabTextOn]}>{TITLES[key]}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

/** Alerts on/off for this store, plus store name and sign-out. Listings and the rest stay on the website. */
function Account({ onSignOut }: { onSignOut: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [alerts, setAlerts] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ vendor: { business_name: string; alerts_enabled: boolean } }>('/vendors/me')
      .then((r) => {
        setName(r.vendor.business_name);
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
      setAlerts(previous); // put the switch back if the change did not save
      setError(e instanceof ApiError ? e.message : 'Could not change alerts. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator color={C.primary} style={{ marginTop: 32 }} />;

  return (
    <View style={styles.account}>
      {name ? <Text style={styles.store}>{name}</Text> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <View style={styles.toggleRow}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={styles.toggleTitle}>Order and booking alerts</Text>
          <Text style={styles.muted}>
            {alerts ? 'You will get a sound alert for new orders, new bookings and cancellations.' : 'Alerts are off. You will not hear about new orders or bookings on this phone.'}
          </Text>
        </View>
        <Switch accessibilityLabel="Order and booking alerts" value={alerts} disabled={saving} onValueChange={toggleAlerts} trackColor={{ true: C.primary }} />
      </View>

      <Text style={styles.muted}>Listings, store profile, statements, wallet and plans are on the Sokoni Hub website.</Text>
      <Button variant="secondary" onPress={onSignOut}>Sign out</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface2 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  heading: { fontSize: 26, fontWeight: '800', color: C.text },
  account: { padding: 20, gap: 16 },
  store: { fontSize: 20, fontWeight: '700', color: C.text },
  toggleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
  toggleTitle: { color: C.text, fontWeight: '700', fontSize: 15, marginBottom: 4 },
  muted: { color: C.muted, fontSize: 14 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabText: { color: C.muted, fontWeight: '600', fontSize: 13 },
  tabTextOn: { color: C.primary },
});
