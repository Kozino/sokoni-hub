import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../providers/AuthContext';
import { Icon } from '../ui/kit';
import { IconName } from '../ui/heroicons';
import { Orders } from './Orders';
import { Bookings } from './Bookings';
import { Availability } from './Availability';
import { Account } from './Account';
import { C } from '../theme';
import { fw } from '../ui/type';

type Tab = 'orders' | 'bookings' | 'availability' | 'account';

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'orders', label: 'Orders', icon: 'shopping-bag' },
  { key: 'bookings', label: 'Bookings', icon: 'calendar-days' },
  { key: 'availability', label: 'Availability', icon: 'clock' },
  { key: 'account', label: 'Account', icon: 'user-circle' },
];

export function Home() {
  const { logout } = useAuth();
  const [tab, setTab] = useState<Tab>('orders');
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        {tab === 'orders' ? <Orders /> : null}
        {tab === 'bookings' ? <Bookings /> : null}
        {tab === 'availability' ? <Availability /> : null}
        {tab === 'account' ? <Account onGo={setTab} onSignOut={() => void logout()} /> : null}
      </View>

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: on }}
              onPress={() => setTab(t.key)}
              style={styles.tab}
            >
              <View style={[styles.iconWrap, on && styles.iconWrapOn]}>
                <Icon name={t.icon} size={22} color={on ? C.primary : C.muted} solid={on} />
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
  content: { flex: 1 },
  tabBar: { flexDirection: 'row', backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.borderSoft, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 4, minHeight: 56 },
  iconWrap: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  iconWrapOn: { backgroundColor: C.primarySoft },
  label: { fontSize: 12, ...fw('600'), color: C.muted },
  labelOn: { color: C.primary, ...fw('700') },
});
