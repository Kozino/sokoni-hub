/**
 * Notifications. There is no separate inbox on the server, so updates are the buyer's own orders and
 * bookings, newest first, each opening its tracking page. Reads the same cached lists as Orders and Bookings.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { errorMessage, isActiveOrder, isUpcomingBooking, useMyBookings, useMyOrders } from '../data';
import { dayTime, timeAgo } from '../format';
import { Icon, type IconName } from '../icons';
import { AppBar, Panel, Screen, Tabs, bookingLook, orderLook, toneColors, type Tone } from '../kit';
import type { NavProps } from '../nav';
import { useAuth, useTheme } from '../providers';
import { Button, EmptyState, Spinner, Text } from '../ui';
import { plural } from '../format';
import { GuestGate } from './GuestGate';

type Note = { id: string; icon: IconName; tone: Tone; title: string; text: string; at: string; open: () => void };

export function Notifications({ go, back, tab }: NavProps) {
  const { colors, theme } = useTheme();
  const { user } = useAuth();
  const orders = useMyOrders();
  const bookings = useMyBookings();

  const notes = useMemo<Note[]>(() => {
    const list: Note[] = [
      ...(orders.data ?? []).map((o): Note => {
        const look = orderLook(o.status, { pickup: o.fulfilment_mode === 'pickup', disputed: !!o.disputed_at });
        return { id: `o-${o.id}`, icon: look.icon, tone: look.tone, title: `Order #${o.code}`, text: `${look.label} · ${o.business_name || 'Seller'}`, at: o.updated_at || o.created_at, open: () => go('track', { code: o.code, phone: o.contact_phone }) };
      }),
      ...(bookings.data ?? []).map((b): Note => {
        const look = bookingLook(b.status);
        const when = b.slot_starts_at || b.scheduled_at || b.preferred_at;
        return { id: `b-${b.id}`, icon: 'calendar', tone: look.tone, title: b.listing_title || `Booking #${b.code}`, text: `${look.label}${when ? ` · ${dayTime(when)}` : ''}`, at: b.created_at, open: () => go('track', { bookingCode: b.code, phone: user?.phone }) };
      }),
    ];
    return list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [orders.data, bookings.data, go, user?.phone]);

  if (!user) return <GuestGate heading="Notifications" title="Sign in for updates" text="Order and booking updates appear here once you have a buyer account." go={go} back={back} />;
  const loading = orders.isLoading || bookings.isLoading;
  const error = orders.error || bookings.error;
  const refresh = () => { void orders.refetch(); void bookings.refetch(); };
  const activeOrders = (orders.data ?? []).filter((o) => isActiveOrder(o.status)).length;
  const upcoming = (bookings.data ?? []).filter(isUpcomingBooking).length;
  const summary = activeOrders || upcoming ? [activeOrders ? `${plural(activeOrders, 'active order')}` : '', upcoming ? `${plural(upcoming, 'upcoming booking')}` : ''].filter(Boolean).join(' · ') : notes.length ? 'You are all caught up.' : 'Updates will appear here.';

  const header = (
    <LinearGradient colors={[colors.heroA, colors.heroB]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
      <View style={s.heroCircle} />
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={back} style={s.heroBack}><Icon name="arrow-back" size={18} color="#FFFFFF" /></Pressable>
      <View style={{ flex: 1 }}>
        <Text style={s.heroTitle}>Notifications</Text>
        <Text numberOfLines={1} style={s.heroText}>{summary}</Text>
      </View>
      <View style={s.heroBell}><Icon name="bell-alert" solid={false} size={20} color={colors.orange} />{notes.length ? <View style={[s.heroCount, { backgroundColor: colors.orange }]}><Text style={{ color: colors.onOrange, fontSize: 9, fontWeight: '700' }}>{notes.length > 99 ? '99+' : notes.length}</Text></View> : null}</View>
    </LinearGradient>
  );

  return (
    <Screen
      background={(
        <View style={{ flex: 1 }}>
          <LinearGradient colors={theme === 'dark' ? [colors.violetSoft, colors.primarySoft, colors.orangeSoft] : ['#DCD6FF', '#C9EDD8', '#FFDDBC']} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
          <View style={[s.blob, { top: 90, right: -70, backgroundColor: colors.violet, opacity: theme === 'dark' ? 0.18 : 0.16 }]} />
          <View style={[s.blob, { top: 380, left: -90, backgroundColor: colors.primary, opacity: theme === 'dark' ? 0.14 : 0.12 }]} />
          <View style={[s.blob, { bottom: 60, right: -60, backgroundColor: colors.orange, opacity: theme === 'dark' ? 0.16 : 0.18 }]} />
        </View>
      )}
    >
      <AppBar go={go} tab={tab} />
      {loading ? (
        <View style={{ flex: 1 }}>{header}<Spinner label="Checking for updates…" /></View>
      ) : (
        <FlatList
          data={notes} keyExtractor={(n) => n.id} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }} ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListHeaderComponent={<View style={{ marginBottom: 10 }}>{header}</View>}
          refreshControl={<RefreshControl refreshing={orders.isRefetching || bookings.isRefetching} onRefresh={refresh} tintColor={colors.primary} />}
          renderItem={({ item }) => {
            const tone = toneColors(colors, item.tone);
            return (
              <View style={{ paddingHorizontal: 12 }}>
                <Panel onPress={item.open} label={`${item.title}. ${item.text}`} accent={tone.fg} style={s.row}>
                  <View style={[s.icon, { backgroundColor: tone.bg }]}><Icon name={item.icon} solid={false} size={18} color={tone.fg} /></View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '700', color: colors.text }}>{item.title}</Text>
                    <Text numberOfLines={2} style={{ fontSize: 11, lineHeight: 15, color: colors.text2, marginTop: 1, fontWeight: '500' }}>{item.text}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: colors.muted }}>{timeAgo(item.at)}</Text>
                    <Icon name="chevron-forward" size={14} color={colors.muted} />
                  </View>
                </Panel>
              </View>
            );
          }}
          ListEmptyComponent={error ? (
            <EmptyState icon="cloud-offline-outline" title="Could not load updates" text={errorMessage(error)} action={<Button style={{ marginTop: 8 }} onPress={refresh}>Try again</Button>} />
          ) : (
            <EmptyState icon="notifications-outline" title="You're all caught up" text="When you order or book, every status change will show up here." action={<Button style={{ marginTop: 8 }} onPress={() => tab('browse')}>Explore the market</Button>} />
          )}
        />
      )}
      <Tabs active="none" tab={tab} />
    </Screen>
  );
}

const s = StyleSheet.create({
  blob: { position: 'absolute', width: 240, height: 240, borderRadius: 120 },
  hero: { marginHorizontal: 12, marginTop: 10, borderRadius: 16, paddingVertical: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10, overflow: 'hidden' },
  heroCircle: { position: 'absolute', right: -30, top: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroBack: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
  heroText: { color: '#CFEBDC', fontSize: 11, fontWeight: '500', marginTop: 1 },
  heroBell: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  heroCount: { position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 9, paddingLeft: 12 },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
