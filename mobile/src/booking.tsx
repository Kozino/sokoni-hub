import { Icon, type IconName } from './icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, ApiError, query } from './api';
import { useAuth, useTheme } from './providers';
import type { Booking, Listing } from './types';
import { BottomBar, Button, Card, EmptyState, Field, Header, Money, Notice, Spinner } from './ui';

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
  const [done, setDone] = useState<{ booking: Booking; auto_confirmed: boolean; whatsapp?: string | null; label: string } | null>(null);
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

  if (!listing) return <View style={styles.page}><Header title="Book service" back={back} /><EmptyState title="Service unavailable" text="Return to the marketplace and choose a service." /></View>;
  if (loadError) return <View style={styles.page}><Header title="Book service" back={back} /><EmptyState icon="cloud-offline-outline" title="Could not load availability" text={loadError} action={<Button style={{ marginTop: 10 }} onPress={() => void loadConfig()}>Try again</Button>} /></View>;
  if (!config) return <View style={styles.page}><Header title="Book service" back={back} /><Spinner label="Checking availability…" /></View>;

  const calendar = config.mode === 'calendar';
  const requestStart = !calendar && day && time ? new Date(`${day}T${time}:00${QATAR}`) : null;
  const requestPast = !!requestStart && +requestStart < Date.now() + config.options.min_notice_hours * 3600000;
  const chosenLabel = calendar
    ? (time ? `${dayParts(day).long}, ${slots.find((s) => s.start === time)?.label || ''}` : '')
    : (requestStart ? `${dayParts(day).long}, ${time}` : '');

  if (done) {
    return <View style={styles.page}>
      <Header title="Booking" />
      <ScrollView contentContainerStyle={styles.doneScroll}>
        <View style={[styles.doneIcon, { backgroundColor: done.auto_confirmed ? colors.successSoft : colors.warningSoft }]}>
          <Icon name={done.auto_confirmed ? 'checkmark-circle' : 'time'} size={44} color={done.auto_confirmed ? colors.success : colors.warning} />
        </View>
        <Text style={[styles.doneTitle, { color: colors.text }]}>{done.auto_confirmed ? 'Booking confirmed' : 'Booking requested'}</Text>
        <Text style={[styles.doneCopy, { color: colors.text2 }]}>{done.auto_confirmed ? 'Your time is reserved.' : `${listing.business_name || 'The provider'} will confirm your appointment with you shortly.`}</Text>
        <Card style={{ width: '100%', marginTop: 18 }}>
          <Row label="Reference" value={done.booking.code} strong />
          <Row label="Service" value={listing.title} />
          <Row label="When" value={done.label} />
          <Row label="Where" value={location === 'home' ? 'At your address' : 'At the provider'} />
          <Row label="Price" value={<Money value={listing.price} currency={listing.currency} strong />} />
        </Card>
        <Notice>Nothing has been charged. Payment is arranged directly with the provider.</Notice>
        <View style={{ width: '100%', gap: 10, marginTop: 16 }}>
          {done.whatsapp ? <Button variant="secondary" onPress={() => void Linking.openURL(done.whatsapp!)}>Message provider on WhatsApp</Button> : null}
          <Button onPress={() => go('bookings')}>View my bookings</Button>
          <Button variant="ghost" onPress={() => tab('home')}>Back to explore</Button>
        </View>
      </ScrollView>
    </View>;
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
      const response = await api.post<{ booking: Booking; auto_confirmed: boolean; whatsapp?: string | null }>('/bookings', body);
      setDone({ ...response, label: chosenLabel });
    } catch (e) {
      const text = errorText(e);
      if (e instanceof ApiError && e.status === 409) { setTime(''); void loadSlots(day); }
      Alert.alert('Could not book service', text);
    } finally { setBusy(false); }
  };

  const ready = !!day && !!time && !(location === 'home' && form.address.trim().length < 5);

  return <KeyboardAvoidingView behavior="padding" style={styles.page}>
    <Header title="Book a service" back={back} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
      <View style={styles.profile}>
        {listing.images?.[0] ? <Image source={{ uri: listing.images[0] }} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }]}><Icon name="construct-outline" size={30} color={colors.primary} /></View>}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={[styles.name, { color: colors.text }]}>{listing.title}</Text>
          <Text numberOfLines={1} style={[styles.sub, { color: colors.text2 }]}>{listing.business_name || 'Verified local provider'} · {listing.vendor_city || 'Doha'}</Text>
          <View style={styles.tags}>
            <View style={[styles.tag, { backgroundColor: colors.surface2 }]}><Icon name="time-outline" size={13} color={colors.text2} /><Text style={[styles.tagText, { color: colors.text2 }]}>{config.duration_mins} min</Text></View>
            <Money value={listing.price} currency={listing.currency} strong />
          </View>
        </View>
      </View>

      <Text style={[styles.section, { color: colors.text }]}>1 · Choose a date</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRail}>
        {days.map((value) => {
          const p = dayParts(value); const active = value === day;
          return <Pressable key={value} onPress={() => pickDay(value)} accessibilityRole="button" accessibilityLabel={p.long} style={[styles.dayChip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}>
            <Text style={[styles.dayWeek, { color: active ? '#fff' : colors.text2 }]}>{p.week}</Text>
            <Text style={[styles.dayNum, { color: active ? '#fff' : colors.text }]}>{p.num}</Text>
            <Text style={[styles.dayMonth, { color: active ? '#fff' : colors.muted }]}>{p.month}</Text>
          </Pressable>;
        })}
      </ScrollView>

      <Text style={[styles.section, { color: colors.text }]}>2 · Choose a time</Text>
      {calendar ? (
        slotsLoading ? <Spinner label="Loading times…" /> :
        slots.length ? <View style={styles.timeGrid}>{slots.map((slot) => {
          const active = slot.start === time;
          return <Pressable key={slot.start} onPress={() => setTime(slot.start)} style={[styles.timeChip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}>
            <Text style={[styles.timeText, { color: active ? '#fff' : colors.text }]}>{slot.label}</Text>
          </Pressable>;
        })}</View> : <Notice type="warning">No times are free on {dayParts(day).long}. Try another day.</Notice>
      ) : (
        <>
          <Notice>This provider confirms appointments by request. Choose the time you would like and they will confirm or suggest another.</Notice>
          <View style={[styles.timeGrid, { marginTop: 10 }]}>{REQUEST_TIMES.map((value) => {
            const active = value === time;
            const past = +new Date(`${day}T${value}:00${QATAR}`) < Date.now() + config.options.min_notice_hours * 3600000;
            return <Pressable key={value} disabled={past} onPress={() => setTime(value)} style={[styles.timeChip, { opacity: past ? .35 : 1, backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}>
              <Text style={[styles.timeText, { color: active ? '#fff' : colors.text }]}>{value}</Text>
            </Pressable>;
          })}</View>
        </>
      )}
      <Text style={[styles.caption, { color: colors.muted }]}>All times are Qatar time (AST).</Text>

      <Text style={[styles.section, { color: colors.text }]}>3 · Where</Text>
      <View style={[styles.toggle, { backgroundColor: colors.surface2 }]}>
        {([['vendor', 'At the provider', 'storefront-outline', config.options.offers_at_vendor], ['home', 'At my address', 'home-outline', config.options.offers_home_service]] as const).map(([value, label, icon, enabled]) => {
          const active = location === value;
          return <Pressable key={value} disabled={!enabled} onPress={() => setLocation(value)} style={[styles.toggleOption, { opacity: enabled ? 1 : .4, backgroundColor: active ? colors.primary : 'transparent' }]}>
            <Icon name={icon} size={16} color={active ? '#fff' : colors.text2} /><Text style={[styles.toggleText, { color: active ? '#fff' : colors.text2 }]}>{label}</Text>
          </Pressable>;
        })}
      </View>
      {location === 'vendor' && config.options.vendor_address ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}><Icon name="location-outline" size={13} color={colors.text2} /><Text style={[styles.caption, { color: colors.text2, marginTop: 0, flexShrink: 1 }]}>{config.options.vendor_address}</Text></View> : null}
      {location === 'home' ? <View style={{ marginTop: 10 }}>
        {config.options.home_service_notes ? <Notice>{config.options.home_service_notes}</Notice> : null}
        <Field label="Your address" value={form.address} onChangeText={set('address')} multiline placeholder="Building, street, zone, Doha" style={{ minHeight: 70, textAlignVertical: 'top', paddingTop: 12 }} />
      </View> : null}

      <Text style={[styles.section, { color: colors.text }]}>4 · Your details</Text>
      <Field label="Full name" value={form.contact_name} onChangeText={set('contact_name')} autoComplete="name" />
      <Field label="Phone number" value={form.contact_phone} onChangeText={set('contact_phone')} keyboardType="phone-pad" placeholder="+974…" />
      <Field label="Email (optional)" value={form.contact_email} onChangeText={set('contact_email')} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Note for the provider (optional)" value={form.note} onChangeText={set('note')} multiline placeholder="Anything they should know" style={{ minHeight: 70, textAlignVertical: 'top', paddingTop: 12 }} />
      {!user ? <Notice type="warning">Sign in to send your booking and track it from your account.</Notice> : null}
    </ScrollView>

    <BottomBar>
      <View style={{ flex: 1 }}>
        <Text style={[styles.totalLabel, { color: colors.text2 }]}>{chosenLabel ? 'YOUR APPOINTMENT' : 'SELECT DATE & TIME'}</Text>
        <Text numberOfLines={1} style={[styles.totalValue, { color: colors.text }]}>{chosenLabel || '—'}</Text>
      </View>
      <Button variant="gold" loading={busy} disabled={!ready && !!user} onPress={() => void submit()} style={styles.cta}>{user ? (config.options.auto_accept && calendar ? 'Book now' : 'Request booking') : 'Sign in to book'}</Button>
    </BottomBar>
  </KeyboardAvoidingView>;
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  const { colors } = useTheme();
  return <View style={styles.row}><Text style={[styles.rowLabel, { color: colors.text2 }]}>{label}</Text>{typeof value === 'string' ? <Text style={[styles.rowValue, { color: colors.text, fontWeight: strong ? '900' : '700' }]}>{value}</Text> : value}</View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, scroll: { padding: 16, paddingBottom: 24 },
  profile: { flexDirection: 'row', gap: 12, alignItems: 'center' }, avatar: { width: 72, height: 72, borderRadius: 12, resizeMode: 'cover' },
  name: { fontSize: 16, fontWeight: '900', lineHeight: 20 }, sub: { fontSize: 11, marginTop: 3 }, tags: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 7 },
  tag: { height: 26, borderRadius: 13, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 4 }, tagText: { fontSize: 10, fontWeight: '800' },
  section: { fontSize: 16, fontWeight: '900', marginTop: 24, marginBottom: 10 },
  dayRail: { gap: 8, paddingRight: 16 }, dayChip: { width: 60, height: 78, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 1 },
  dayWeek: { fontSize: 11, fontWeight: '700' }, dayNum: { fontSize: 20, fontWeight: '900' }, dayMonth: { fontSize: 10, fontWeight: '700' },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, timeChip: { minWidth: 76, height: 42, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, timeText: { fontSize: 14, fontWeight: '800' },
  caption: { fontSize: 11, marginTop: 9 },
  toggle: { height: 50, borderRadius: 12, padding: 4, flexDirection: 'row', gap: 4 }, toggleOption: { flex: 1, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, toggleText: { fontSize: 12, fontWeight: '900' },
  totalLabel: { fontSize: 9, fontWeight: '800', letterSpacing: .4 }, totalValue: { fontSize: 13, fontWeight: '900', marginTop: 2 }, cta: { minWidth: 160, borderRadius: 24 },
  doneScroll: { padding: 20, alignItems: 'center' }, doneIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  doneTitle: { fontSize: 24, fontWeight: '900', marginTop: 16 }, doneCopy: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6, maxWidth: 300 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, gap: 12 }, rowLabel: { fontSize: 12 }, rowValue: { fontSize: 13, flexShrink: 1, textAlign: 'right' },
});
