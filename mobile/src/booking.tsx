import { Icon, type IconName } from './icons';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { api, ApiError, query } from './api';
import { durationLabel, whatsappUrl } from './format';
import { Panel, Price, Screen, Thumb, softShadow } from './kit';
import { useAuth, useTheme } from './providers';
import type { Booking, Listing } from './types';
import { BottomBar, Button, EmptyState, Field, Header, Notice, Spinner, Text } from './ui';

/** Qatar has no daylight saving, so a fixed +03:00 offset is always correct. */
const QATAR = '+03:00';

type SlotsResponse = {
  mode: 'calendar' | 'request';
  slots: { start: string; end: string; label: string }[];
  duration_mins: number;
  today: string;
  options: {
    offers_at_vendor: boolean; offers_home_service: boolean; home_service_notes: string | null;
    auto_accept: boolean; min_notice_hours: number; max_advance_days: number; vendor_address?: string | null;
  };
};

/** Request-mode vendors have no diary, so the buyer proposes one of these start times. */
const REQUEST_TIMES = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
const dayParts = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return {
    week: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
    num: d.getUTCDate(),
    month: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
    long: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
  };
};
const qatarNowDay = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const errorText = (e: unknown) => (e instanceof ApiError || e instanceof Error) ? e.message : 'Something went wrong. Please try again.';

export function BookService({ listing, go, back, tab }: { listing?: Listing; go: (screen: any, params?: any) => void; back: () => void; tab: (screen: any, params?: any) => void }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [config, setConfig] = useState<SlotsResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [day, setDay] = useState('');
  const [slots, setSlots] = useState<SlotsResponse['slots']>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [time, setTime] = useState('');            // calendar: slot.start ISO · request: 'HH:MM'
  const [location, setLocation] = useState<'vendor' | 'home'>('vendor');
  const [form, setForm] = useState({ contact_name: user?.full_name || '', contact_phone: user?.phone || '', contact_email: user?.email || '', address: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ booking: Booking; auto_confirmed: boolean; label: string } | null>(null);
  const set = (key: keyof typeof form) => (value: string) => setForm((old) => ({ ...old, [key]: value }));

  // 1) Load the vendor's booking rules (and today's Qatar date) for this service.
  const loadConfig = useCallback(async () => {
    if (!listing) return;
    setLoadError('');
    try {
      const first = qatarNowDay();
      const data = await api.get<SlotsResponse>(`/bookings/slots${query({ listing_id: listing.id, date: first })}`);
      setConfig(data);
      setLocation(data.options.offers_at_vendor ? 'vendor' : 'home');
      setDay(data.today || first);
      setSlots(data.slots || []);
    } catch (e) { setLoadError(errorText(e)); }
  }, [listing]);
  useEffect(() => { void loadConfig(); }, [loadConfig]);

  // 2) Re-fetch available times whenever the buyer picks another day (calendar vendors).
  const loadSlots = useCallback(async (value: string) => {
    if (!listing || !config || config.mode !== 'calendar') return;
    setSlotsLoading(true);
    try {
      const data = await api.get<SlotsResponse>(`/bookings/slots${query({ listing_id: listing.id, date: value })}`);
      setSlots(data.slots || []);
    } catch (e) { setSlots([]); Alert.alert('Could not load times', errorText(e)); }
    finally { setSlotsLoading(false); }
  }, [listing, config]);

  const pickDay = (value: string) => { setDay(value); setTime(''); if (config?.mode === 'calendar') void loadSlots(value); };

  const days = useMemo(() => {
    if (!config) return [];
    const count = Math.min(Math.max(config.options.max_advance_days || 14, 1), 30) + 1;
    return Array.from({ length: count }, (_, i) => addDays(config.today, i));
  }, [config]);

  if (!listing) return <Screen><Header title="Book a service" back={back} /><EmptyState title="Service unavailable" text="Return to the marketplace and choose a service." /></Screen>;
  if (loadError) return <Screen><Header title="Book a service" back={back} /><EmptyState icon="cloud-offline-outline" title="Could not load availability" text={loadError} action={<Button style={{ marginTop: 8 }} onPress={() => void loadConfig()}>Try again</Button>} /></Screen>;
  if (!config) return <Screen><Header title="Book a service" back={back} /><Spinner label="Checking availability…" /></Screen>;

  const calendar = config.mode === 'calendar';
  const requestStart = !calendar && day && time ? new Date(`${day}T${time}:00${QATAR}`) : null;
  const requestPast = !!requestStart && +requestStart < Date.now() + config.options.min_notice_hours * 3600000;
  const chosenLabel = calendar
    ? (time ? `${dayParts(day).long}, ${slots.find((s) => s.start === time)?.label || ''}` : '')
    : (requestStart ? `${dayParts(day).long}, ${time}` : '');

  if (done) {
    const wa = whatsappUrl(listing.whatsapp, `Hi ${listing.business_name || ''}, I just booked "${listing.title}" (ref ${done.booking.code}) for ${done.label}.`);
    return (
      <Screen>
        <Header title="Booking" />
        <ScrollView contentContainerStyle={styles.doneScroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.doneIcon, { backgroundColor: done.auto_confirmed ? colors.primarySoft : colors.warningSoft }]}>
            <Icon name={done.auto_confirmed ? 'checkmark-circle' : 'time'} size={52} color={done.auto_confirmed ? colors.primary : colors.warning} />
          </View>
          <Text style={[styles.doneTitle, { color: colors.text }]}>{done.auto_confirmed ? 'Booking confirmed' : 'Booking requested'}</Text>
          <Text style={[styles.doneCopy, { color: colors.text2 }]}>{done.auto_confirmed ? 'Your time is reserved with the provider.' : `${listing.business_name || 'The provider'} will confirm your appointment with you shortly.`}</Text>
          <Panel style={{ width: '100%', marginTop: 16, gap: 4 }}>
            <Row label="Reference" value={done.booking.code} strong />
            <Row label="Service" value={listing.title} />
            <Row label="Provider" value={listing.business_name || 'Verified provider'} />
            <Row label="When" value={done.label} />
            <Row label="Where" value={location === 'home' ? 'At your address' : 'At the provider'} />
            <Row label="Price" value={<Price value={listing.price} currency={listing.currency} size={18} from={listing.price_type === 'from'} />} />
          </Panel>
          <View style={{ width: '100%', marginTop: 11 }}><Notice>Nothing has been charged. Payment is arranged directly with the provider.</Notice></View>
          <View style={{ width: '100%', gap: 8, marginTop: 14 }}>
            <Button variant="deep" onPress={() => go('track', { bookingCode: done.booking.code, phone: form.contact_phone })}>Track this booking</Button>
            {wa ? <Button variant="mint" iconLeft="logo-whatsapp" onPress={() => void Linking.openURL(wa)}>Message the provider</Button> : null}
            <Button variant="tonal" onPress={() => go('bookings')}>View my bookings</Button>
            <Button variant="ghost" onPress={() => tab('home')}>Back to explore</Button>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  const submit = async () => {
    if (!user) return go('login');
    if (!form.contact_name.trim() || form.contact_name.trim().length < 2) return Alert.alert('Add your name', 'Enter the name the provider should expect.');
    if (form.contact_phone.replace(/\D/g, '').length < 7) return Alert.alert('Add your phone', 'Enter a phone number the provider can reach you on.');
    if (!day || !time) return Alert.alert('Choose a date and time', 'Pick a day and a time for your appointment.');
    if (!calendar && requestPast) return Alert.alert('Time too soon', `Choose a time at least ${config.options.min_notice_hours} hours from now.`);
    if (location === 'home' && form.address.trim().length < 5) return Alert.alert('Add your address', 'Home visits need a full address.');
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        listing_id: listing.id,
        contact_name: form.contact_name.trim(),
        contact_phone: form.contact_phone.trim(),
        contact_email: form.contact_email.trim() || undefined,
        preferred_note: form.note.trim() || undefined,
        location_type: location,
        address: location === 'home' ? form.address.trim() : undefined,
      };
      if (calendar) body.slot_start = time;
      else body.preferred_at = requestStart!.toISOString();
      const response = await api.post<{ booking: Booking; auto_confirmed: boolean }>('/bookings', body);
      setDone({ ...response, label: chosenLabel });
    } catch (e) {
      const text = errorText(e);
      if (e instanceof ApiError && e.status === 409) { setTime(''); void loadSlots(day); }
      Alert.alert('Could not book service', text);
    } finally { setBusy(false); }
  };

  const ready = !!day && !!time && !(location === 'home' && form.address.trim().length < 5);
  const duration = durationLabel(config.duration_mins);

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Header title="Book a service" back={back} />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Panel style={styles.profile}>
            <Thumb uri={listing.images?.[0]} style={styles.avatar} icon="service-bell" iconSize={28} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text numberOfLines={2} style={[styles.name, { color: colors.text }]}>{listing.title}</Text>
              <Text numberOfLines={1} style={[styles.sub, { color: colors.text2 }]}>{listing.business_name || 'Verified provider'}{listing.vendor_city ? ` · ${listing.vendor_city.trim()}` : ''}</Text>
              <View style={styles.tags}>
                {duration ? <View style={[styles.tag, { backgroundColor: colors.surface2 }]}><Icon name="time" solid={false} size={14} color={colors.text2} /><Text style={[styles.tagText, { color: colors.text2 }]}>{duration}</Text></View> : null}
                <Price value={listing.price} currency={listing.currency} size={19} from={listing.price_type === 'from'} />
              </View>
            </View>
          </Panel>

          <StepHead n={1} title="Choose a date" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRail}>
            {days.map((value, index) => {
              const p = dayParts(value); const active = value === day;
              return <Pressable key={value} onPress={() => pickDay(value)} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={p.long} style={[styles.dayChip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }, active && softShadow(colors.shadow)]}>
                <Text style={[styles.dayWeek, { color: active ? colors.onPrimary : colors.text2 }]}>{index === 0 ? 'Today' : p.week}</Text>
                <Text style={[styles.dayNum, { color: active ? colors.onPrimary : colors.text }]}>{p.num}</Text>
                <Text style={[styles.dayMonth, { color: active ? colors.onPrimary : colors.muted }]}>{p.month}</Text>
              </Pressable>;
            })}
          </ScrollView>

          <StepHead n={2} title="Choose a time" />
          {calendar ? (
            slotsLoading ? <Spinner label="Loading times…" /> :
            slots.length ? <View style={styles.timeGrid}>{slots.map((slot) => {
              const active = slot.start === time;
              return <Pressable key={slot.start} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setTime(slot.start)} style={[styles.timeChip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}>
                <Text style={[styles.timeText, { color: active ? colors.onPrimary : colors.text }]}>{slot.label}</Text>
              </Pressable>;
            })}</View> : <Notice type="warning">No times are free on {dayParts(day).long}. Try another day.</Notice>
          ) : (
            <>
              <Notice>This provider confirms appointments by request. Choose the time you would like and they will confirm or suggest another.</Notice>
              <View style={[styles.timeGrid, { marginTop: 9 }]}>{REQUEST_TIMES.map((value) => {
                const active = value === time;
                const past = +new Date(`${day}T${value}:00${QATAR}`) < Date.now() + config.options.min_notice_hours * 3600000;
                return <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: active, disabled: past }} disabled={past} onPress={() => setTime(value)} style={[styles.timeChip, { opacity: past ? 0.35 : 1, backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}>
                  <Text style={[styles.timeText, { color: active ? colors.onPrimary : colors.text }]}>{value}</Text>
                </Pressable>;
              })}</View>
            </>
          )}
          <Text style={[styles.caption, { color: colors.muted }]}>All times are Qatar time (AST).</Text>

          <StepHead n={3} title="Where" />
          <View style={{ flexDirection: 'row', gap: 9 }}>
            {([['vendor', 'At the provider', 'Go to their location', 'storefront', config.options.offers_at_vendor], ['home', 'At my address', 'Home visit', 'home', config.options.offers_home_service]] as [string, string, string, IconName, boolean][]).map(([value, label, sub, icon, enabled]) => {
              const active = location === value;
              return <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: active, disabled: !enabled }} disabled={!enabled} onPress={() => setLocation(value as 'vendor' | 'home')} style={[styles.where, { opacity: enabled ? 1 : 0.4 }, active ? [{ backgroundColor: colors.surface, borderColor: colors.primary }, softShadow(colors.shadow)] : { backgroundColor: colors.surface2, borderColor: 'transparent' }]}>
                <Icon name={icon} solid={false} size={23} color={active ? colors.primary : colors.text2} />
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.text, marginTop: 8 }}>{label}</Text>
                <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.text2, marginTop: 2 }}>{enabled ? sub : 'Not offered'}</Text>
              </Pressable>;
            })}
          </View>
          {location === 'vendor' && config.options.vendor_address ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}><Icon name="location" solid={false} size={15} color={colors.text2} /><Text style={[styles.caption, { color: colors.text2, marginTop: 0, flexShrink: 1 }]}>{config.options.vendor_address}</Text></View> : null}
          {location === 'home' ? <View style={{ marginTop: 9 }}>
            {config.options.home_service_notes ? <Notice>{config.options.home_service_notes}</Notice> : null}
            <View style={{ height: config.options.home_service_notes ? 12 : 0 }} />
            <Field label="Your address" value={form.address} onChangeText={set('address')} multiline placeholder="Building, street, zone, Doha" style={{ minHeight: 76, textAlignVertical: 'top', paddingTop: 9 }} />
          </View> : null}

          <StepHead n={4} title="Your details" />
          <Field label="Full name" value={form.contact_name} onChangeText={set('contact_name')} autoComplete="name" />
          <Field label="Phone number" value={form.contact_phone} onChangeText={set('contact_phone')} keyboardType="phone-pad" placeholder="+974…" />
          <Field label="Email (optional)" value={form.contact_email} onChangeText={set('contact_email')} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Note for the provider (optional)" value={form.note} onChangeText={set('note')} multiline placeholder="Anything they should know" style={{ minHeight: 76, textAlignVertical: 'top', paddingTop: 9 }} />
          {!user ? <Notice type="warning">Sign in to send your booking and track it from your account.</Notice> : null}
          <Text style={[styles.caption, { color: colors.muted, textAlign: 'center', marginTop: 11 }]}>Nothing is charged in the app. You pay the provider directly.</Text>
        </ScrollView>

        <BottomBar style={{ paddingHorizontal: 12, gap: 11 }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.totalLabel, { color: colors.text2 }]}>{chosenLabel ? 'YOUR APPOINTMENT' : 'SELECT DATE & TIME'}</Text>
            <Text numberOfLines={2} style={[styles.totalValue, { color: colors.text }]}>{chosenLabel || '—'}</Text>
          </View>
          <Button variant="gold" loading={busy} disabled={!ready && !!user} onPress={() => void submit()} style={styles.cta} textStyle={{ fontSize: 13 }}>{user ? (config.options.auto_accept && calendar ? 'Book now' : 'Request booking') : 'Sign in to book'}</Button>
        </BottomBar>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function StepHead({ n, title }: { n: number; title: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stepHead}>
      <View style={[styles.stepNo, { backgroundColor: n % 2 === 0 ? colors.brown : colors.primary }]}><Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '700' }}>{n}</Text></View>
      <Text style={[styles.section, { color: colors.text }]}>{title}</Text>
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  const { colors } = useTheme();
  return <View style={styles.row}><Text style={[styles.rowLabel, { color: colors.text2 }]}>{label}</Text>{typeof value === 'string' ? <Text style={[styles.rowValue, { color: colors.text, fontWeight: strong ? '800' : '700' }]}>{value}</Text> : value}</View>;
}

const styles = StyleSheet.create({
  scroll: { padding: 12, paddingBottom: 22 },
  profile: { flexDirection: 'row', gap: 11, alignItems: 'center' }, avatar: { width: 69, height: 69, borderRadius: 14 },
  name: { fontSize: 14.5, fontWeight: '700', lineHeight: 19, letterSpacing: -0.2 }, sub: { fontSize: 11.5, fontWeight: '600' }, tags: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  tag: { height: 28, borderRadius: 11, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }, tagText: { fontSize: 11.5, fontWeight: '700' },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 9 }, stepNo: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: 15, fontWeight: '700', letterSpacing: -0.3 },
  dayRail: { gap: 8, paddingRight: 12 }, dayChip: { width: 54, height: 74, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 1 },
  dayWeek: { fontSize: 11.5, fontWeight: '600' }, dayNum: { fontSize: 18, fontWeight: '700' }, dayMonth: { fontSize: 11.5, fontWeight: '600' },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, timeChip: { minWidth: 82, height: 39, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11 }, timeText: { fontSize: 13, fontWeight: '700' },
  caption: { fontSize: 11.5, marginTop: 8, fontWeight: '500' },
  where: { flex: 1, borderRadius: 16, borderWidth: 1.5, padding: 12 },
  totalLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1.1 }, totalValue: { fontSize: 12.5, fontWeight: '700', marginTop: 2, lineHeight: 16 },
  cta: { minHeight: 45, minWidth: 150, paddingHorizontal: 17 },
  doneScroll: { padding: 16, alignItems: 'center', paddingBottom: 31 }, doneIcon: { width: 79, height: 79, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 11 },
  doneTitle: { fontSize: 21, fontWeight: '700', marginTop: 14, letterSpacing: -0.5 }, doneCopy: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8, maxWidth: 320 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, gap: 9 }, rowLabel: { fontSize: 12, fontWeight: '500' }, rowValue: { fontSize: 12.5, flexShrink: 1, textAlign: 'right' },
});
