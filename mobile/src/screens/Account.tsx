/**
 * Profile. Real account data (name, phone, email, member since), live counters for orders, bookings and saved
 * items, the remembered delivery address, preferences and security. Security flows (password, PIN, deletion)
 * are unchanged from before; only the presentation is new.
 */
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { api, ApiError } from '../api';
import { SellCard } from '../cards';
import { useCity } from '../city';
import { useCheckoutDraft } from '../checkoutDraft';
import { bookingTime, errorMessage, isActiveOrder, isUpcomingBooking, useMyBookings, useMyOrders } from '../data';
import { useFavourites } from '../favourites';
import { cleanCity, longDate, plural, shortDate, time24 } from '../format';
import { Icon, type IconName } from '../icons';
import { AppBar, Avatar, Panel, Screen, Tabs, orderLook, softShadow } from '../kit';
import type { NavProps } from '../nav';
import { useAuth, useTheme } from '../providers';
import { Button, Dropdown, Field, Notice, Sheet, Text } from '../ui';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const BUILD = Constants.expoConfig?.ios?.buildNumber ?? (Constants.expoConfig?.android?.versionCode ? String(Constants.expoConfig.android.versionCode) : '');

export function Account({ go, tab }: NavProps) {
  const { colors, theme, toggleTheme } = useTheme();
  const { user, logout, changePassword, changePin, updateUser } = useAuth();
  const fav = useFavourites();
  const orders = useMyOrders();
  const bookings = useMyBookings();
  const { city, setCity, cities } = useCity();
  const [draft, setDraft] = useCheckoutDraft();
  const [refreshing, setRefreshing] = useState(false);

  const [editSheet, setEditSheet] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '' });
  const [editBusy, setEditBusy] = useState(false);
  const [addressSheet, setAddressSheet] = useState(false);
  const [passSheet, setPassSheet] = useState(false);
  const [passForm, setPassForm] = useState({ current: '', newPass: '' });
  const [passBusy, setPassBusy] = useState(false);
  const [pinSheet, setPinSheet] = useState(false);
  const [pinForm, setPinForm] = useState({ current: '', newPin: '', confirm: '' });
  const [pinBusy, setPinBusy] = useState(false);
  const [deleteSheet, setDeleteSheet] = useState(false);
  const [deleteForm, setDeleteForm] = useState({ password: '', reason: '', agree: false });
  const [deleteBusy, setDeleteBusy] = useState(false);

  const submitEdit = async () => {
    const name = editForm.name.trim();
    const email = editForm.email.trim();
    if (name.length < 2) return Alert.alert('Name needed', 'Enter your full name.');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return Alert.alert('Check your email', 'Enter a valid email address or leave it empty.');
    setEditBusy(true);
    try {
      const res = await api.patch<{ user: NonNullable<typeof user> }>('/auth/me', { full_name: name, ...(email && email !== user?.email ? { email } : {}) });
      if (user) updateUser({ ...user, ...res.user });
      setEditSheet(false);
    } catch (e) { Alert.alert('Could not save', errorMessage(e)); }
    finally { setEditBusy(false); }
  };
  const submitPass = async () => {
    if (!passForm.current || passForm.newPass.length < 12) return Alert.alert('Invalid', 'New password must be at least 12 characters.');
    setPassBusy(true);
    try { await changePassword(passForm.current, passForm.newPass); setPassSheet(false); setPassForm({ current: '', newPass: '' }); Alert.alert('Success', 'Your password has been changed.'); }
    catch (e) { Alert.alert('Error', errorMessage(e)); }
    finally { setPassBusy(false); }
  };
  /** Starts a durable deletion request (same process as the web portal). Sokoni Hub reviews it. */
  const submitDelete = async () => {
    if (!deleteForm.password) return Alert.alert('Password needed', 'Enter your current password to confirm.');
    if (!deleteForm.agree) return Alert.alert('Confirm first', 'Tick the box to confirm you understand the request.');
    setDeleteBusy(true);
    try {
      const res = await api.post<{ request: { reference: string } }>('/account-deletion/requests', { password: deleteForm.password, acknowledge: true, reason: deleteForm.reason.trim() || undefined });
      setDeleteSheet(false); setDeleteForm({ password: '', reason: '', agree: false });
      Alert.alert('Deletion requested', `We have your request. Keep this reference: ${res.request.reference}`);
    } catch (e) { Alert.alert('Could not start deletion', e instanceof ApiError ? e.message : errorMessage(e)); }
    finally { setDeleteBusy(false); }
  };
  const submitPin = async () => {
    if (!pinForm.current || pinForm.newPin.length !== 4) return Alert.alert('Invalid', 'PIN must be 4 digits.');
    if (pinForm.newPin !== pinForm.confirm) return Alert.alert('Mismatch', 'New PINs do not match.');
    setPinBusy(true);
    try { await changePin(pinForm.current, pinForm.newPin); setPinSheet(false); setPinForm({ current: '', newPin: '', confirm: '' }); Alert.alert('Success', 'Your PIN has been changed.'); }
    catch (e) { Alert.alert('Error', errorMessage(e)); }
    finally { setPinBusy(false); }
  };
  const refresh = async () => { setRefreshing(true); await Promise.all([orders.refetch(), bookings.refetch()]); setRefreshing(false); };

  /* ------------------------------------------------------------------------ signed out */
  if (!user) {
    return (
      <Screen>
        <AppBar go={go} tab={tab} />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          <LinearGradient colors={[colors.primary, colors.deep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.guestHero}>
            <View style={s.guestIcon}><Icon name="person" solid={false} size={38} color="#FFFFFF" /></View>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#FFFFFF', marginTop: 14, letterSpacing: -0.4 }}>Your Sokoni Hub profile</Text>
            <Text style={{ fontSize: 14.5, color: '#D3EEDF', textAlign: 'center', lineHeight: 21, marginTop: 8 }}>Sign in to place orders, book providers, keep your address handy and follow every request.</Text>
            <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 20 }}>
              <Button variant="gold" onPress={() => go('login')}>Sign in securely</Button>
              <Button variant="tonal" onPress={() => go('register')}>Create a buyer account</Button>
            </View>
          </LinearGradient>
          <Text style={[s.group, { color: colors.text2 }]}>EXPLORE</Text>
          <Panel style={{ padding: 6 }}>
            <Row icon="search" tint="mint" title="Browse the market" sub="Products, stalls and local services" onPress={() => tab('browse')} />
            <Row icon="navigate" tint="lav" title="Track with a code" sub="Find an order or a booking" onPress={() => go('track')} />
            <Row icon="help-buoy" tint="mint" title="Help & support" sub="Contact the Sokoni Hub team" onPress={() => go('support')} last />
          </Panel>
        </ScrollView>
        <Tabs active="account" tab={tab} />
      </Screen>
    );
  }

  const activeOrders = (orders.data ?? []).filter((o) => isActiveOrder(o.status));
  const upcoming = (bookings.data ?? []).filter(isUpcomingBooking).sort((a, b) => new Date(bookingTime(a) || a.created_at).getTime() - new Date(bookingTime(b) || b.created_at).getTime());
  const nextOrder = activeOrders[0];
  const nextBooking = upcoming[0];
  const phone = user.phone ? `+${String(user.phone).replace(/^\+/, '')}` : '';
  const since = user.created_at ? `Member since ${shortDate(user.created_at)}` : 'Buyer account';
  const addressLine = draft.address ? [draft.address.trim(), cleanCity(draft.city)].filter(Boolean).join(', ') : '';
  const cityOptions = [{ value: '', label: 'All of Qatar' }, ...cities.map((c) => ({ value: c, label: c }))];

  return (
    <Screen>
      <AppBar go={go} tab={tab} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
        <LinearGradient colors={[colors.primary, colors.deep]} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={s.hero}>
          <View style={s.heroTop}>
            <View>
              <Avatar name={user.full_name} size={76} tone="orange" />
              <View style={[s.verified, { backgroundColor: colors.orange, borderColor: colors.deep }]}><Icon name="shield-checkmark" size={13} color={colors.onOrange} /></View>
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={s.name}>{user.full_name}</Text>
              {phone ? <Text numberOfLines={1} style={s.phone}>{phone}</Text> : null}
              <Dropdown value={city} options={cityOptions} onChange={setCity} menuWidth={220} style={{ alignSelf: 'flex-start', marginTop: 3 }} renderTrigger={() => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name="location" size={14} color={colors.orange} /><Text style={s.city}>{city ? `${city}, Qatar` : 'All of Qatar'}</Text><Icon name="chevron-down" size={12} color="#BFE9D2" /></View>
              )} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit profile" onPress={() => { setEditForm({ name: user.full_name, email: user.email || '' }); setEditSheet(true); }} style={s.edit}><Icon name="pencil" solid={false} size={20} color="#FFFFFF" /></Pressable>
          </View>
          <View style={s.strip}>
            <Icon name="shield-checkmark" solid={false} size={18} color={colors.orange} />
            <Text style={s.stripText}>{since}</Text>
            <View style={s.stripPill}><Text style={s.stripPillText}>Buyer</Text></View>
          </View>
        </LinearGradient>

        <View style={s.tiles}>
          <Tile icon="archive" tint="mint" label="Orders" pill={activeOrders.length ? `${activeOrders.length} Active` : `${orders.data?.length ?? 0} Total`} pillTone={activeOrders.length ? 'orange' : 'lav'} onPress={() => go('orders')} />
          <Tile icon="calendar" tint="lav" label="Bookings" pill={upcoming.length ? `${upcoming.length} Upcoming` : `${bookings.data?.length ?? 0} Total`} pillTone={upcoming.length ? 'mint' : 'lav'} onPress={() => go('bookings')} />
          <Tile icon="heart" tint="rose" label="Saved" pill={`${fav.items.length} ${fav.items.length === 1 ? 'Item' : 'Items'}`} pillTone="lav" onPress={() => go('saved')} />
        </View>

        <Text style={[s.group, { color: colors.text2 }]}>ACCOUNT</Text>
        <Panel style={s.list}>
          <Row icon="car" tint="mint" title="Order History & Tracking" sub={nextOrder ? `${nextOrder.business_name || 'Order'} · ${orderLook(nextOrder.status, { pickup: nextOrder.fulfilment_mode === 'pickup' }).label}` : orders.data?.length ? `${plural(orders.data.length, 'order')} placed` : 'No orders yet'} dot={!!nextOrder} onPress={() => go('orders')} />
          <Row icon="calendar" tint="lav" title="Service Appointments" sub={nextBooking ? `${nextBooking.listing_title || 'Booking'}, ${bookingTime(nextBooking) ? `${longDate(bookingTime(nextBooking)).split(',')[0].slice(0, 3)} ${time24(bookingTime(nextBooking))}` : 'time to be arranged'}` : 'No upcoming appointments'} onPress={() => go('bookings')} />
          <Row icon="location" tint="lav" title="Delivery Address" sub={addressLine || 'Saved when you place an order'} onPress={() => setAddressSheet(true)} last />
        </Panel>

        <SellCard />

        <Text style={[s.group, { color: colors.text2 }]}>PREFERENCES</Text>
        <Panel style={s.list}>
          <Dropdown value={city} options={cityOptions} onChange={setCity} menuWidth={240} renderTrigger={() => <Row icon="globe" tint="lav" title="City & Region" sub="Regional marketplace feed" value={city ? `${city}, Qatar` : 'All of Qatar'} />} />
          <Row icon={theme === 'dark' ? 'moon' : 'sunny'} tint="lav" title="Dark mode" sub={theme === 'dark' ? 'On' : 'Off'} right={<Switch value={theme === 'dark'} onValueChange={toggleTheme} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />} />
          <Row icon="bell-alert" tint="lav" title="Notifications & Alerts" sub="Order and booking updates" onPress={() => go('notifications')} last />
        </Panel>

        <Text style={[s.group, { color: colors.text2 }]}>SECURITY</Text>
        <Panel style={s.list}>
          <Row icon="lock-closed" tint="lav" title="Change password" sub="Use 12 or more characters" onPress={() => setPassSheet(true)} />
          <Row icon="key" tint="lav" title="Change PIN" sub="Your 4-digit security PIN" onPress={() => setPinSheet(true)} />
          <Row icon="trash" tint="rose" title="Delete account" sub="Request permanent deletion" onPress={() => setDeleteSheet(true)} last />
        </Panel>

        <Text style={[s.group, { color: colors.text2 }]}>SUPPORT & TRUST</Text>
        <Panel style={s.list}>
          <Row icon="chat" tint="mint" title="Help & WhatsApp Support" sub="Order, account and safety help" onPress={() => go('support')} />
          <Row icon="document-text" tint="lav" title="Terms & Privacy Policy" sub="Customer policies and marketplace rules" onPress={() => go('legal')} last />
        </Panel>

        <Pressable
          accessibilityRole="button" onPress={() => Alert.alert('Sign out?', 'You will need your password and PIN to sign in again.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => void logout() }])}
          style={({ pressed }) => [s.signOut, { backgroundColor: colors.dangerSoft, opacity: pressed ? 0.85 : 1 }]}
        >
          <Icon name="log-out" solid={false} size={21} color={colors.dangerText} /><Text style={{ fontSize: 16, fontWeight: '800', color: colors.dangerText }}>Sign Out</Text>
        </Pressable>
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.text2, textAlign: 'center', marginTop: 18, paddingHorizontal: 24 }}>Sokoni Hub v{APP_VERSION}{BUILD ? ` (Build ${BUILD})` : ''} • Seller and admin tools stay on the secure web portal</Text>
      </ScrollView>
      <Tabs active="account" tab={tab} />

      <Sheet visible={editSheet} title="Edit profile" onClose={() => setEditSheet(false)}>
        <Field label="Full name" value={editForm.name} onChangeText={(v) => setEditForm({ ...editForm, name: v })} autoComplete="name" />
        <Field label="Email (optional)" value={editForm.email} onChangeText={(v) => setEditForm({ ...editForm, email: v })} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        <Field label="Phone number" value={phone} editable={false} style={{ opacity: 0.6 }} />
        <Text style={{ fontSize: 12.5, color: colors.text2, marginTop: -6, marginBottom: 14, lineHeight: 18 }}>Your phone number is your sign-in. To change it, contact Sokoni Hub support.</Text>
        <Button onPress={submitEdit} loading={editBusy}>Save changes</Button>
      </Sheet>

      <Sheet visible={addressSheet} title="Delivery address" onClose={() => setAddressSheet(false)}>
        {draft.address ? (
          <>
            <View style={[s.addressCard, { backgroundColor: colors.surface2 }]}>
              <Icon name="location" solid={false} size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.text, lineHeight: 22 }}>{draft.address}</Text>
                <Text style={{ fontSize: 13.5, color: colors.text2, marginTop: 3, fontWeight: '600' }}>{[draft.city, draft.country].filter(Boolean).join(', ')}{draft.lat !== null ? ' · map pin saved' : ''}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, color: colors.text2, marginTop: 12, lineHeight: 19 }}>This is the address from your last checkout. It is kept on this phone only and pre-fills your next order — you can change it there.</Text>
            <Button variant="secondary" style={{ marginTop: 16 }} onPress={() => { setDraft({ address: '', city: '', lat: null, lng: null }); setAddressSheet(false); }}>Remove saved address</Button>
          </>
        ) : <Notice>No address is saved yet. It is remembered on this phone when you place your first order.</Notice>}
      </Sheet>

      <Sheet visible={passSheet} title="Change Password" onClose={() => setPassSheet(false)}>
        <Field label="Current Password" value={passForm.current} onChangeText={(v) => setPassForm({ ...passForm, current: v })} secureTextEntry />
        <Field label="New Password (12+ chars)" value={passForm.newPass} onChangeText={(v) => setPassForm({ ...passForm, newPass: v })} secureTextEntry />
        <Button onPress={submitPass} loading={passBusy} style={{ marginTop: 12 }}>Update Password</Button>
      </Sheet>

      <Sheet visible={pinSheet} title="Change PIN" onClose={() => setPinSheet(false)}>
        <Field label="Current PIN" value={pinForm.current} onChangeText={(v) => setPinForm({ ...pinForm, current: v })} secureTextEntry keyboardType="number-pad" maxLength={4} />
        <Field label="New PIN" value={pinForm.newPin} onChangeText={(v) => setPinForm({ ...pinForm, newPin: v })} secureTextEntry keyboardType="number-pad" maxLength={4} />
        <Field label="Confirm New PIN" value={pinForm.confirm} onChangeText={(v) => setPinForm({ ...pinForm, confirm: v })} secureTextEntry keyboardType="number-pad" maxLength={4} />
        <Button onPress={submitPin} loading={pinBusy} style={{ marginTop: 12 }}>Update PIN</Button>
      </Sheet>

      <Sheet visible={deleteSheet} title="Delete account" onClose={() => setDeleteSheet(false)}>
        <Notice>Your account is reviewed, then deleted: your profile, login and uploaded documents are removed. Order and payment records we must keep are retained under our privacy policy. Finish any open orders or bookings first.</Notice>
        <View style={{ height: 12 }} />
        <Field label="Current Password" value={deleteForm.password} onChangeText={(v) => setDeleteForm({ ...deleteForm, password: v })} secureTextEntry />
        <Field label="Reason (optional)" value={deleteForm.reason} onChangeText={(v) => setDeleteForm({ ...deleteForm, reason: v })} multiline maxLength={500} />
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: deleteForm.agree }} onPress={() => setDeleteForm({ ...deleteForm, agree: !deleteForm.agree })} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: deleteForm.agree ? colors.primary : colors.border, backgroundColor: deleteForm.agree ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
            {deleteForm.agree ? <Icon name="check" size={14} color={colors.onPrimary} /> : null}
          </View>
          <Text style={{ flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 }}>I understand my account will be deleted after review and cannot be undone.</Text>
        </Pressable>
        <Button variant="danger" onPress={submitDelete} loading={deleteBusy}>Request deletion</Button>
      </Sheet>
    </Screen>
  );
}

/* ------------------------------------------------------------------------------ pieces */
type Tint = 'mint' | 'lav' | 'rose' | 'orange';
function Row({ icon, tint, title, sub, value, right, onPress, dot, last }: { icon: IconName; tint: Tint; title: string; sub?: string; value?: string; right?: ReactNode; onPress?: () => void; dot?: boolean; last?: boolean }) {
  const { colors } = useTheme();
  const bg = tint === 'mint' ? colors.primarySoft : tint === 'rose' ? colors.dangerSoft : tint === 'orange' ? colors.orangeSoft : colors.lav2;
  const fg = tint === 'mint' ? colors.primary : tint === 'rose' ? colors.dangerText : tint === 'orange' ? colors.orange : colors.text2;
  const body = (
    <View style={[s.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <View style={[s.rowIcon, { backgroundColor: bg }]}><Icon name={icon} solid={false} size={21} color={fg} /></View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ fontSize: 15.5, fontWeight: '800', color: colors.text }}>{title}</Text>
        {sub ? <Text numberOfLines={2} style={{ fontSize: 13.5, color: colors.text2, marginTop: 2, lineHeight: 19, fontWeight: '500' }}>{sub}</Text> : null}
      </View>
      {value ? <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '800', color: colors.primary, maxWidth: 110 }}>{value}</Text> : null}
      {dot ? <View style={[s.dot, { backgroundColor: colors.orange }]} /> : null}
      {right ?? (onPress || value ? <Icon name="chevron-forward" size={18} color={colors.muted} /> : null)}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>{body}</Pressable> : body;
}

function Tile({ icon, tint, label, pill, pillTone, onPress }: { icon: IconName; tint: Tint; label: string; pill: string; pillTone: 'orange' | 'mint' | 'lav'; onPress: () => void }) {
  const { colors } = useTheme();
  const bg = tint === 'mint' ? colors.primarySoft : tint === 'rose' ? colors.dangerSoft : colors.lav2;
  const fg = tint === 'mint' ? colors.primary : tint === 'rose' ? colors.dangerText : colors.text2;
  const pillBg = pillTone === 'orange' ? colors.orangeSoft : pillTone === 'mint' ? colors.primarySoft : colors.lav2;
  const pillFg = pillTone === 'orange' ? colors.gold : pillTone === 'mint' ? colors.primary : colors.text2;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${pill}`} onPress={onPress} style={({ pressed }) => [s.tile, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.9 : 1 }, softShadow(colors.shadow, 2)]}>
      <View style={[s.tileIcon, { backgroundColor: bg }]}><Icon name={icon} solid={false} size={24} color={fg} /></View>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 10 }}>{label}</Text>
      <View style={[s.tilePill, { backgroundColor: pillBg }]}><Text style={{ fontSize: 11.5, fontWeight: '800', color: pillFg }}>{pill}</Text></View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  hero: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 86, borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  verified: { position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 25, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  phone: { fontSize: 15, color: '#D3EEDF', fontWeight: '600', marginTop: 2 },
  city: { fontSize: 14, color: '#E4F7EC', fontWeight: '800' },
  edit: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 16, paddingHorizontal: 14, height: 48, marginTop: 18 },
  stripText: { flex: 1, color: '#FFFFFF', fontSize: 14.5, fontWeight: '800' },
  stripPill: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 11, paddingHorizontal: 12, height: 26, justifyContent: 'center' },
  stripPillText: { color: '#E4F7EC', fontSize: 12.5, fontWeight: '800' },
  tiles: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginTop: -58 },
  tile: { flex: 1, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 6 },
  tileIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tilePill: { borderRadius: 10, paddingHorizontal: 10, height: 22, justifyContent: 'center', marginTop: 8 },
  group: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, marginTop: 26, marginBottom: 10, paddingHorizontal: 20 },
  list: { marginHorizontal: 16, padding: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingHorizontal: 10 },
  rowIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 4 },
  signOut: { marginHorizontal: 16, marginTop: 28, height: 58, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  guestHero: { borderRadius: 28, padding: 22, alignItems: 'center' },
  guestIcon: { width: 76, height: 76, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  addressCard: { flexDirection: 'row', gap: 12, borderRadius: 16, padding: 16 },
});
