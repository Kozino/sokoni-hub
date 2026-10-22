/**
 * My Bookings. `GET /bookings/mine` gives the list; each card is completed from `GET /bookings/track`
 * (price, address, duration, provider WhatsApp, cancel rules) and the public store directory (logo, rating).
 * The API has no reschedule call, so "Reschedule" hands off to the provider on WhatsApp, or cancels to rebook.
 */
import { useMemo, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { api, query } from '../api';
import { API_URL } from '../config';
import { bookingTime, errorMessage, LIVE_BOOKING_STATES, useBookingDetail, useMyBookings, usePromoSet, useRememberedImage, useStats, useVendorDirectory } from '../data';
import { durationLabel, longDate, minutesBetween, money, plural, shortDate, time24, whatsappUrl } from '../format';
import { Icon } from '../icons';
import { AppBar, Avatar, InfoLine, PageTitle, Panel, Pill, RoundButton, Screen, SegTabs, SectionHead, StatusPill, Tabs, Thumb, bookingLook, toneColors, useColumnWidth } from '../kit';
import type { NavProps } from '../nav';
import { useAuth, useTheme } from '../providers';
import { useToast } from '../toast';
import type { Booking } from '../types';
import { Button, EmptyState, Sheet, Spinner, Text } from '../ui';
import { GuestGate } from './GuestGate';

type TabKey = 'upcoming' | 'completed' | 'cancelled';
const PHONE_FOR = (b: Booking, fallback?: string) => b.contact_phone || fallback || '';

export function Bookings({ go, back, tab }: NavProps) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const bookings = useMyBookings();
  const stats = useStats();
  const [active, setActive] = useState<TabKey>('upcoming');
  const [reschedule, setReschedule] = useState<Booking | null>(null);

  const all = useMemo(() => bookings.data ?? [], [bookings.data]);
  const groups = useMemo(() => {
    const byTime = (a: Booking, b: Booking) => (new Date(bookingTime(a) || a.created_at).getTime()) - (new Date(bookingTime(b) || b.created_at).getTime());
    return {
      upcoming: all.filter((b) => LIVE_BOOKING_STATES.includes(b.status)).sort(byTime),
      completed: all.filter((b) => b.status === 'completed').sort((a, b) => byTime(b, a)),
      cancelled: all.filter((b) => b.status === 'cancelled' || b.status === 'no_show').sort((a, b) => byTime(b, a)),
    };
  }, [all]);

  if (!user) return <GuestGate heading="My bookings" title="Sign in to see your bookings" text="Your upcoming appointments and booking history are tied to your buyer account." go={go} back={back} />;

  const list = groups[active];
  const openListing = (_b: Booking, id?: string) => (id ? go('listing', { id }) : tab('services'));

  const header = (
    <View>
      <PageTitle title="My Bookings" subtitle="Follow your appointments with local service providers, from request to completion." right={<RoundButton icon="calendar" tone="lav" label="Book a service" onPress={() => tab('services')} size={46} />} />
      <View style={{ paddingHorizontal: 12, marginTop: 14 }}>
        <SegTabs active={active} onChange={(k) => setActive(k as TabKey)} items={[
          { key: 'upcoming', label: 'Upcoming', count: groups.upcoming.length },
          { key: 'completed', label: 'Completed', count: groups.completed.length },
          { key: 'cancelled', label: 'Cancelled', count: groups.cancelled.length },
        ]} />
      </View>
    </View>
  );

  const footer = (
    <View>
      {active === 'upcoming' && groups.completed.length ? (
        <>
          <SectionHead title="Past Services" right={<Text style={{ color: colors.text2, fontSize: 11.5, fontWeight: '700' }}>Showing {Math.min(3, groups.completed.length)} recent</Text>} />
          <View style={{ gap: 9, paddingHorizontal: 12 }}>{groups.completed.slice(0, 3).map((b) => <PastRow key={b.id} booking={b} onAgain={openListing} />)}</View>
        </>
      ) : null}
      <Panel style={[s.promo, { backgroundColor: colors.surface2 }]}>
        <View style={{ flexDirection: 'row', gap: 11 }}>
          <View style={[s.promoIcon, { backgroundColor: colors.orangeSoft }]}><Icon name="compass" solid={false} size={26} color={colors.orange} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>Looking for a specialist?</Text>
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.text2, marginTop: 4 }}>{stats.data?.services ? `Browse ${plural(stats.data.services, 'service')} from verified providers across Qatar.` : 'Browse services from verified providers across Qatar.'}</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => tab('services')} style={({ pressed }) => [s.promoBtn, { backgroundColor: colors.brown, opacity: pressed ? 0.9 : 1 }]}>
          <Icon name="compass" solid={false} size={19} color="#FFFFFF" /><Text style={{ color: '#FFFFFF', fontSize: 13.5, fontWeight: '700' }}>Explore Services</Text>
        </Pressable>
      </Panel>
    </View>
  );

  return (
    <Screen>
      <AppBar go={go} tab={tab} />
      {bookings.isLoading ? (
        <FlatList data={[]} renderItem={null} ListHeaderComponent={header} ListFooterComponent={<Spinner label="Loading your bookings…" />} />
      ) : (
        <FlatList
          data={list} keyExtractor={(b) => b.id} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}
          ListHeaderComponent={<>{header}<View style={{ height: 16 }} /></>} ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          refreshControl={<RefreshControl refreshing={bookings.isRefetching} onRefresh={() => void bookings.refetch()} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: 12 }}>
              {active === 'upcoming'
                ? <BookingCard booking={item} go={go} onReschedule={() => setReschedule(item)} />
                : <PastRow booking={item} onAgain={openListing} />}
            </View>
          )}
          ListEmptyComponent={bookings.error ? (
            <EmptyState icon="cloud-offline-outline" title="Could not load your bookings" text={errorMessage(bookings.error)} action={<Button style={{ marginTop: 8 }} onPress={() => void bookings.refetch()}>Try again</Button>} />
          ) : (
            <EmptyState icon="calendar-outline" title={active === 'upcoming' ? 'No upcoming bookings' : active === 'completed' ? 'No completed services yet' : 'Nothing cancelled'} text={active === 'upcoming' ? 'Book a verified provider and your appointment will be tracked here.' : 'Services you complete will be listed here so you can book them again.'} action={active === 'upcoming' ? <Button style={{ marginTop: 8 }} onPress={() => tab('services')}>Browse services</Button> : undefined} />
          )}
          ListFooterComponent={footer}
        />
      )}
      <Tabs active="none" tab={tab} />
      <RescheduleSheet booking={reschedule} onClose={() => setReschedule(null)} onRebook={(id) => { setReschedule(null); openListing(reschedule as Booking, id); }} />
    </Screen>
  );
}

/* --------------------------------------------------------------------------- upcoming card */
function BookingCard({ booking, go, onReschedule }: { booking: Booking; go: NavProps['go']; onReschedule: () => void }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const detail = useBookingDetail(booking);
  const d = { ...booking, ...(detail.data ?? {}) } as Booking;
  const directory = useVendorDirectory();
  const promo = usePromoSet();
  const vendor = directory.byName.get((d.business_name || '').trim().toLowerCase());
  const look = bookingLook(d.status);
  const start = bookingTime(d);
  const end = d.slot_ends_at;
  const agreed = !!(d.slot_starts_at || d.scheduled_at);
  const mins = Number(d.duration_mins) || minutesBetween(d.slot_starts_at, d.slot_ends_at);
  const duration = durationLabel(mins);
  const home = d.location_type === 'home';
  const phone = PHONE_FOR(booking, user?.phone);
  const wa = whatsappUrl(d.vendor_whatsapp, `Hi ${d.business_name || ''}, I'm writing about my booking #${d.code} for ${d.listing_title || 'your service'}${start ? ` on ${longDate(start)} at ${time24(start)}` : ''}.`);
  const live = LIVE_BOOKING_STATES.includes(d.status);
  const price = d.quoted_price !== undefined && d.quoted_price !== null && Number(d.quoted_price) > 0 ? Number(d.quoted_price) : null;
  const rating = vendor && Number(vendor.rating_count) > 0 ? { avg: Number(vendor.rating_avg), count: Number(vendor.rating_count) } : null;
  const remembered = useRememberedImage(d.listing_id);
  const [cancelling, setCancelling] = useState(false);
  const narrow = useColumnWidth() < 380; // small phones: compact status pill, price panel may wrap

  const cancel = () => Alert.alert('Cancel this booking?', 'The provider will be told. You can book again at any time.', [
    { text: 'Keep booking', style: 'cancel' },
    { text: 'Cancel booking', style: 'destructive', onPress: async () => {
      setCancelling(true);
      try {
        await api.post(`/bookings/${booking.id}/cancel`, {});
        toast.show('Booking cancelled');
        await Promise.all([queryClient.invalidateQueries({ queryKey: ['bookings-mine'] }), queryClient.invalidateQueries({ queryKey: ['booking-detail', booking.code] })]);
      } catch (e) { Alert.alert('Could not cancel', errorMessage(e)); }
      finally { setCancelling(false); }
    } },
  ]);

  return (
    <Panel accent={toneColors(colors, look.tone).fg} style={{ padding: 12, paddingLeft: 15 }}>
      <View style={s.cardTop}>
        <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 136 }}>
          <Text numberOfLines={1} style={[s.ref, { color: colors.text2 }]}>REF: #{booking.code}</Text>
          <Text style={[s.booked, { color: colors.text2 }]}>Booked on {shortDate(booking.created_at)}</Text>
        </View>
        <StatusPill look={look} compact={narrow} />
      </View>

      <View style={s.who}>
        <View>
          {vendor?.logo_url || remembered ? <Thumb uri={vendor?.logo_url || remembered} style={s.logo} icon="service-bell" /> : <Avatar name={d.business_name} size={72} square tone="mint" />}
          <View style={[s.statusDot, { backgroundColor: d.status === 'confirmed' ? colors.success : colors.orange, borderColor: colors.surface }]} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text numberOfLines={1} style={[s.vendor, { color: colors.text }]}>{d.business_name || 'Provider'}</Text>
            {vendor && promo.vip.has(vendor.id) ? <Pill tone="orange" small>VIP</Pill> : null}
          </View>
          <Text numberOfLines={2} style={[s.service, { color: colors.primary }]}>{d.listing_title || 'Service booking'}</Text>
          {rating ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name="star" size={14} color={colors.orange} /><Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{rating.avg.toFixed(1)}</Text><Text style={{ fontSize: 12, color: colors.text2, fontWeight: '600' }}>({plural(rating.count, 'review')})</Text></View> : null}
        </View>
      </View>

      <View style={[s.block, { backgroundColor: colors.surface2 }]}>
        <InfoLine
          icon="calendar"
          title={start ? `${agreed ? '' : 'Requested: '}${longDate(start)} • ${time24(start)}${end ? ` - ${time24(end)}` : ''}` : 'Time to be arranged'}
          sub={!agreed && start ? 'The provider will confirm the exact time' : duration ? `${duration} estimated service duration` : undefined}
        />
        <InfoLine
          icon="location" tint={colors.brown}
          title={home ? 'Home visit appointment' : 'At the provider’s location'}
          sub={home ? d.address || undefined : d.vendor_address || d.vendor_city || undefined}
        />
      </View>

      <View style={[s.total, { backgroundColor: colors.surface2 }]}>
        <Icon name="shield-checkmark" solid={false} size={24} color={colors.primary} />
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 150 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{price !== null ? `${d.quoted_price_type === 'from' ? 'From ' : 'Total: '}${money(price, d.currency || 'QAR')}` : 'Price agreed with the provider'}</Text>
          <Text style={{ fontSize: 11.5, lineHeight: 16, color: colors.text2, fontWeight: '600', marginTop: 1 }}>{d.quoted_price_type === 'from' ? 'Final price confirmed by the provider • ' : ''}Pay the provider directly</Text>
        </View>
        {live && agreed ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Add to calendar" onPress={() => void Linking.openURL(`${API_URL}/api/bookings/ics${query({ code: booking.code, phone })}`)} style={[s.calBtn, { backgroundColor: colors.lav2, marginLeft: 'auto' }]}>
            <Icon name="calendar" solid={false} size={16} color={colors.text2} /><Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.text2 }}>Calendar</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={s.actions}>
        <Button variant="deep" iconLeft="chat" style={{ flex: 1 }} onPress={() => (wa ? void Linking.openURL(wa) : vendor ? go('store', { slug: vendor.slug }) : Alert.alert('Provider contact', 'The provider’s WhatsApp number is not available yet. You will be contacted on the phone number you booked with.'))}>{wa ? 'Message' : 'View Provider'}</Button>
        {live ? <Button variant="tonal" iconLeft="calendar" style={{ flex: 1 }} onPress={onReschedule}>Reschedule</Button> : null}
      </View>
      {live && detail.data?.can_cancel ? (
        <Pressable accessibilityRole="button" disabled={cancelling} onPress={cancel} style={{ alignSelf: 'center', paddingVertical: 9 }}>
          <Text style={{ color: colors.dangerText, fontSize: 12.5, fontWeight: '700' }}>{cancelling ? 'Cancelling…' : 'Cancel booking'}</Text>
        </Pressable>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------------------ past rows */
function PastRow({ booking, onAgain }: { booking: Booking; onAgain: (b: Booking, listingId?: string) => void }) {
  const { colors } = useTheme();
  const detail = useBookingDetail(booking);
  const d = { ...booking, ...(detail.data ?? {}) } as Booking;
  const directory = useVendorDirectory();
  const vendor = directory.byName.get((d.business_name || '').trim().toLowerCase());
  const remembered = useRememberedImage(d.listing_id);
  const look = bookingLook(d.status);
  const when = shortDate(bookingTime(d) || d.created_at);
  const price = d.quoted_price !== undefined && d.quoted_price !== null && Number(d.quoted_price) > 0 ? ` • ${money(d.quoted_price, d.currency || 'QAR')}` : '';
  return (
    <Panel style={{ padding: 11 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Thumb uri={remembered || vendor?.logo_url} style={s.pastThumb} icon="service-bell" iconSize={22} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={[s.pastTitle, { color: colors.text }]}>{d.listing_title || 'Service booking'}</Text>
          <Text numberOfLines={1} style={[s.pastMeta, { color: colors.text2 }]}>{d.business_name}</Text>
          <Text numberOfLines={1} style={[s.pastMeta, { color: colors.text2 }]}>{d.status === 'completed' ? 'Completed' : look.label} {when}{price}</Text>
        </View>
      </View>
      <View style={s.pastFoot}>
        <StatusPill look={look} small />
        <Button variant="mint" iconLeft="refresh" style={s.againBtn} textStyle={{ fontSize: 13 }} onPress={() => onAgain(booking, d.listing_id)}>Book Again</Button>
      </View>
    </Panel>
  );
}

/* ----------------------------------------------------------------------------- reschedule */
function RescheduleSheet({ booking, onClose, onRebook }: { booking: Booking | null; onClose: () => void; onRebook: (listingId?: string) => void }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const detail = useBookingDetail(booking, !!booking);
  const [busy, setBusy] = useState(false);
  if (!booking) return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;
  const d = { ...booking, ...(detail.data ?? {}) } as Booking;
  const wa = whatsappUrl(d.vendor_whatsapp, `Hi ${d.business_name || ''}, I'd like to reschedule my booking #${d.code} for ${d.listing_title || 'your service'}. Could we find a new time?`);
  const cancelAndRebook = async () => {
    setBusy(true);
    try {
      await api.post(`/bookings/${booking.id}/cancel`, {});
      toast.show('Booking cancelled. Choose a new time.');
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['bookings-mine'] }), queryClient.invalidateQueries({ queryKey: ['booking-detail', booking.code] })]);
      onRebook(d.listing_id);
    } catch (e) { Alert.alert('Could not cancel', errorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <Sheet visible title="Need a different time?" onClose={onClose}>
      <Text style={{ fontSize: 13, lineHeight: 19, color: colors.text2 }}>Your provider confirms every appointment, so changes are agreed with them directly. Message them with the new time you prefer{user ? '' : ''} — they will confirm it.</Text>
      <View style={{ gap: 8, marginTop: 14 }}>
        {wa ? <Button variant="deep" iconLeft="chat" onPress={() => { onClose(); void Linking.openURL(wa); }}>Message the provider</Button> : <Text style={{ fontSize: 12, color: colors.text2 }}>The provider’s WhatsApp number is not available for this booking yet.</Text>}
        {detail.data?.can_cancel ? <Button variant="tonal" loading={busy} onPress={() => Alert.alert('Cancel and rebook?', 'This cancels your current booking so you can pick a new time.', [{ text: 'Keep booking', style: 'cancel' }, { text: 'Cancel and rebook', style: 'destructive', onPress: () => void cancelAndRebook() }])}>Cancel and book a new time</Button> : null}
        <Button variant="ghost" onPress={onClose}>Keep this booking</Button>
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  cardTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', columnGap: 8, rowGap: 8 },
  ref: { fontSize: 11.5, fontWeight: '700' },
  booked: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  who: { flexDirection: 'row', gap: 11, marginTop: 12 },
  logo: { width: 59, height: 59, borderRadius: 16 },
  statusDot: { position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9, borderWidth: 3 },
  vendor: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3, flexShrink: 1 },
  service: { fontSize: 13.5, fontWeight: '700', lineHeight: 17 },
  block: { borderRadius: 16, padding: 11, gap: 11, marginTop: 12 },
  total: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 9, rowGap: 8, borderRadius: 14, padding: 11, marginTop: 9 },
  calBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: 12, paddingHorizontal: 9 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 11 },
  pastThumb: { width: 51, height: 51, borderRadius: 13 },
  pastTitle: { fontSize: 14.5, fontWeight: '700', letterSpacing: -0.2, lineHeight: 19 },
  pastMeta: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  pastFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 11 },
  againBtn: { minHeight: 39, borderRadius: 13, paddingHorizontal: 14 },
  promo: { marginHorizontal: 12, marginTop: 20, padding: 14 },
  promoIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  promoBtn: { height: 45, borderRadius: 13, marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
});
