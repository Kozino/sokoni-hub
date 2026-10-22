/**
 * Notifications. There is no separate inbox on the server, so updates are the buyer's own orders and
 * bookings, newest first, each opening its tracking page. Reads the same cached lists as Orders and Bookings.
 */
import { useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { errorMessage, useMyBookings, useMyOrders } from '../data';
import { dayTime, timeAgo } from '../format';
import { Icon, type IconName } from '../icons';
import { AppBar, PageTitle, Panel, Screen, Tabs, bookingLook, orderLook, toneColors, type Tone } from '../kit';
import type { NavProps } from '../nav';
import { useAuth, useTheme } from '../providers';
import { Button, EmptyState, Spinner, Text } from '../ui';
import { GuestGate } from './GuestGate';

type Note = { id: string; icon: IconName; tone: Tone; title: string; text: string; at: string; open: () => void };

export function Notifications({ go, back, tab }: NavProps) {
  const { colors } = useTheme();
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

  return (
    <Screen>
      <AppBar go={go} tab={tab} />
      {loading ? (
        <View style={{ flex: 1 }}><PageTitle title="Notifications" back={back} /><Spinner label="Checking for updates…" /></View>
      ) : (
        <FlatList
          data={notes} keyExtractor={(n) => n.id} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 56 }} ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListHeaderComponent={<View style={{ marginBottom: 16 }}><PageTitle title="Notifications" back={back} subtitle={notes.length ? 'The latest on your orders and bookings.' : undefined} /></View>}
          refreshControl={<RefreshControl refreshing={orders.isRefetching || bookings.isRefetching} onRefresh={refresh} tintColor={colors.primary} />}
          renderItem={({ item }) => {
            const tone = toneColors(colors, item.tone);
            return (
              <View style={{ paddingHorizontal: 16 }}>
                <Panel onPress={item.open} label={`${item.title}. ${item.text}`} style={s.row}>
                  <View style={[s.icon, { backgroundColor: tone.bg }]}><Icon name={item.icon} solid={false} size={22} color={tone.fg} /></View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: 15.5, fontWeight: '800', color: colors.text }}>{item.title}</Text>
                    <Text numberOfLines={2} style={{ fontSize: 13.5, lineHeight: 19, color: colors.text2, marginTop: 2, fontWeight: '500' }}>{item.text}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>{timeAgo(item.at)}</Text>
                    <Icon name="chevron-forward" size={16} color={colors.muted} />
                  </View>
                </Panel>
              </View>
            );
          }}
          ListEmptyComponent={error ? (
            <EmptyState icon="cloud-offline-outline" title="Could not load updates" text={errorMessage(error)} action={<Button style={{ marginTop: 8 }} onPress={refresh}>Try again</Button>} />
          ) : (
            <EmptyState icon="notifications-outline" title="You're all caught up" text="When you order or book, every status change will show up here." action={<Button style={{ marginTop: 10 }} onPress={() => tab('browse')}>Explore the market</Button>} />
          )}
        />
      )}
      <Tabs active="none" tab={tab} />
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
