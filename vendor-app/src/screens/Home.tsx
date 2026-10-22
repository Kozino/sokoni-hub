import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api';
import { Icon } from '../ui/kit';
import { IconName } from '../ui/heroicons';
import { Orders } from './Orders';
import { Bookings } from './Bookings';
import { Availability } from './Availability';
import { Account } from './Account';
import { VendorProvider, VendorTab, useVendor } from '../providers/VendorContext';
import { C } from '../theme';
import { fw } from '../ui/type';
import { useAuth } from '../providers/AuthContext';

const REFRESH_MS = 30000;

const TABS: { key: VendorTab; label: string; icon: IconName }[] = [
  { key: 'orders', label: 'Orders', icon: 'shopping-bag' },
  { key: 'bookings', label: 'Bookings', icon: 'calendar-days' },
  { key: 'availability', label: 'Availability', icon: 'clock' },
  { key: 'account', label: 'Account', icon: 'user-circle' },
];

export function Home() {
  return (
    <VendorProvider>
      <HomeInner />
    </VendorProvider>
  );
}

function HomeInner() {
  const { logout } = useAuth();
  const { setTabHandler, setAttention, attention } = useVendor();
  const [tab, setTab] = useState<VendorTab>('orders');
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setTabHandler(setTab);
    return () => setTabHandler(null);
  }, [setTabHandler]);

  // Badge counts for the tab bar. Each screen still loads its own full list.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [o, b] = await Promise.all([
          api.get<{ orders: { status: string }[] }>('/orders/vendor'),
          api.get<{ bookings: { status: string }[] }>('/bookings/vendor'),
        ]);
        if (!alive) return;
        setAttention({
          orders: o.orders.filter((x) => x.status === 'pending').length,
          bookings: b.bookings.filter((x) => x.status === 'new').length,
        });
      } catch {
        // Keep the last known counts. The screens show their own errors.
      }
    };
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [setAttention]);

  const badgeFor = (key: VendorTab) => (key === 'orders' ? attention.orders : key === 'bookings' ? attention.bookings : 0);

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        {/* Caps the width on tablets and landscape so rows do not stretch edge to edge. */}
        {tab === 'orders' ? <Orders /> : null}
        {tab === 'bookings' ? <Bookings /> : null}
        {tab === 'availability' ? <Availability /> : null}
        {tab === 'account' ? <Account onSignOut={() => void logout()} /> : null}
      </View>

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {TABS.map((t) => {
          const on = tab === t.key;
          const badge = badgeFor(t.key);
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityLabel={badge ? `${t.label}, ${badge} waiting` : t.label}
              accessibilityState={{ selected: on }}
              onPress={() => setTab(t.key)}
              style={styles.tab}
            >
              <View style={[styles.iconWrap, on && styles.iconWrapOn]}>
                <Icon name={t.icon} size={22} color={on ? C.primary : C.muted} solid={on} />
                {badge > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
  tabBar: { flexDirection: 'row', backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.borderSoft, paddingTop: 8, shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: -2 }, elevation: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 4, minHeight: 56 },
  iconWrap: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  iconWrapOn: { backgroundColor: C.primarySoft },
  badge: { position: 'absolute', top: -4, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: C.surface },
  badgeText: { color: '#FFFFFF', fontSize: 10, ...fw('800') },
  label: { fontSize: 12, ...fw('600'), color: C.muted },
  labelOn: { color: C.primary, ...fw('700') },
});
