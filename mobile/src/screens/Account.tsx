
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, FlatList, ImageBackground, KeyboardAvoidingView, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, useWindowDimensions, View, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError, query } from '../api';
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP, WEB_URL } from '../config';
import { AuthProvider, CartProvider, ThemeProvider, useAuth, useCart, useTheme } from '../providers';
import type { Booking, CartItem, Category, Listing, Order, Review, Vendor } from '../types';
import { BrandMark, Button, Card, Chip, Divider, Dropdown, EmptyState, Field, FontContext, Header, IconButton, Money, Notice, Sheet, Spinner, Text, TextInput, type DropdownOption, type FontStatus } from '../ui';
import { CityProvider, useCity } from '../city';
import { categoryImage } from '../catImages';
import { BottomBar } from '../ui';
import { BookService } from '../booking';
import { Checkout } from '../checkout';
import { FavouritesProvider, useFavourites } from '../favourites';
import { FeaturedStores, usePromotions, VipStores } from '../promotions';
import { LegalScreen } from '../legal';
import { Icon, type IconName } from '../icons';
import { styles, nx, ex } from '../styles';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { tap, success } from '../haptics';

// Sokoni Hub brand colours (logo green and gold).
const BRAND = { green: '#05663F', greenSoft: '#E1F7E9', gold: '#FF7A00', goldSoft: '#FFF1E0' };

export type Screen = 'welcome' | 'home' | 'browse' | 'cart' | 'account' | 'login' | 'register' | 'pin' | 'pinsetup' | 'forgot' | 'listing' | 'store' | 'checkout' | 'orders' | 'bookings' | 'track' | 'booking' | 'support' | 'saved' | 'notifications' | 'legal';
export type Nav = { screen: Screen; params?: Record<string, any>; id?: number };

const message = (error: any) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'To be arranged';
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'To be arranged';
const statusLabel = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export const ToastContext = createContext<{ show: (text: string, cartLink?: boolean) => void }>({ show: () => {} });
export const useToast = () => useContext(ToastContext);

import { Welcome } from './Welcome';
import { Tabs } from './Tabs';
import { Home } from './Home';
import { TrustTile } from './TrustTile';
import { SectionTitle } from './SectionTitle';
import { ListingRail } from './ListingRail';
import { ListingImage } from './ListingImage';
import { ListingCard } from './ListingCard';
import { Browse } from './Browse';
import { Saved } from './Saved';
import { Notifications } from './Notifications';
import { AuthScaffold } from './AuthScaffold';
import { Login } from './Login';
import { Register } from './Register';
import { Pin } from './Pin';
import { Recovery } from './Recovery';
import { ListingDetail } from './ListingDetail';
import { DetailFact } from './DetailFact';
import { StoreDetail } from './StoreDetail';
import { Cart } from './Cart';
import { Orders } from './Orders';
import { Bookings } from './Bookings';
import { Status } from './Status';
import { Track } from './Track';
import { AccountRow } from './AccountRow';
import { Support } from './Support';
import { GuestGate } from './GuestGate';
import { WebOnlyAccount } from './WebOnlyAccount';export function Account({ go, back, tab }: any) {
  const { colors, theme, toggleTheme } = useTheme(); 
  const { user, logout, changePassword, changePin } = useAuth(); 
  const fav = useFavourites();
  const [counts, setCounts] = useState<{ orders?: number; bookings?: number }>({});
  const [refreshing, setRefreshing] = useState(false);
  
  const [passSheet, setPassSheet] = useState(false);
  const [passForm, setPassForm] = useState({ current: '', newPass: '' });
  const [passBusy, setPassBusy] = useState(false);
  
  const [pinSheet, setPinSheet] = useState(false);
  const [pinForm, setPinForm] = useState({ current: '', newPin: '', confirm: '' });
  const [pinBusy, setPinBusy] = useState(false);

  const [deleteSheet, setDeleteSheet] = useState(false);
  const [deleteForm, setDeleteForm] = useState({ password: '', reason: '', agree: false });
  const [deleteBusy, setDeleteBusy] = useState(false);

  const submitPass = async () => {
    if (!passForm.current || passForm.newPass.length < 12) return Alert.alert('Invalid', 'New password must be at least 12 characters.');
    setPassBusy(true);
    try {
      await changePassword(passForm.current, passForm.newPass);
      setPassSheet(false); setPassForm({ current: '', newPass: '' });
      Alert.alert('Success', 'Your password has been changed.');
    } catch(e: any) { Alert.alert('Error', e.message); }
    finally { setPassBusy(false); }
  };

  /** Starts a durable deletion request (same process as the web portal). Sokoni Hub reviews it. */
  const submitDelete = async () => {
    if (!deleteForm.password) return Alert.alert('Password needed', 'Enter your current password to confirm.');
    if (!deleteForm.agree) return Alert.alert('Confirm first', 'Tick the box to confirm you understand the request.');
    setDeleteBusy(true);
    try {
      const res = await api.post<{ request: { reference: string } }>('/account-deletion/requests', {
        password: deleteForm.password,
        acknowledge: true,
        reason: deleteForm.reason.trim() || undefined,
      });
      setDeleteSheet(false);
      setDeleteForm({ password: '', reason: '', agree: false });
      Alert.alert('Deletion requested', `We have your request. Keep this reference: ${res.request.reference}`);
    } catch (e: any) {
      Alert.alert('Could not start deletion', e instanceof ApiError ? e.message : (e?.message || 'Something went wrong. Please try again.'));
    } finally {
      setDeleteBusy(false);
    }
  };

  const submitPin = async () => {
    if (!pinForm.current || pinForm.newPin.length !== 4) return Alert.alert('Invalid', 'PIN must be 4 digits.');
    if (pinForm.newPin !== pinForm.confirm) return Alert.alert('Mismatch', 'New PINs do not match.');
    setPinBusy(true);
    try {
      await changePin(pinForm.current, pinForm.newPin);
      setPinSheet(false); setPinForm({ current: '', newPin: '', confirm: '' });
      Alert.alert('Success', 'Your PIN has been changed.');
    } catch(e: any) { Alert.alert('Error', e.message); }
    finally { setPinBusy(false); }
  };

  const fetchCounts = useCallback(() => Promise.all([api.get<{ orders: Order[] }>('/orders/mine').catch(() => null), api.get<{ bookings: Booking[] }>('/bookings/mine').catch(() => null)]), []);
  
  useEffect(() => {
    if (!user) return undefined; let live = true;
    void fetchCounts().then(([o, b]) => { if (live) setCounts({ orders: o?.orders.length, bookings: b?.bookings.length }); });
    return () => { live = false; };
  }, [user, fetchCounts]);
  
  const refresh = async () => { 
    setRefreshing(true); 
    const [o, b] = await fetchCounts(); 
    setCounts({ orders: o?.orders.length, bookings: b?.bookings.length }); 
    setRefreshing(false); 
  };

  if(!user) return (
    <View style={styles.page}>
      <View style={[styles.accountGuestHeader, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 10, paddingTop: 10, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <BrandMark small/>
        <Pressable accessibilityRole="button" onPress={back} hitSlop={8} style={{ padding: 4 }}>
          <Icon name="close" size={24} color={colors.text}/>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
        <View style={{ alignItems: 'center', marginBottom: 32, marginTop: 20 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}>
            <Icon name="person" size={40} color={colors.muted} />
          </View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 8, textAlign: 'center' }}>Your Profile</Text>
          <Text style={{ fontSize: 15, color: colors.text2, textAlign: 'center', lineHeight: 22, paddingHorizontal: 10 }}>Sign in to place orders, book specialists, keep your address handy, and track every request seamlessly.</Text>
        </View>
        <Button onPress={()=>go('login')} style={{ marginBottom: 12, height: 50, borderRadius: 25 }}>Sign in securely</Button>
        <Button variant="secondary" onPress={()=>go('register')} style={{ height: 50, borderRadius: 25 }}>Create buyer account</Button>
        
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: 40, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Explore</Text>
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' }}>
          <AccountRow icon="search-outline" title="Browse the market" subtitle="Products, stalls and local services" onPress={()=>tab('browse')}/>
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 52 }} />
          <AccountRow icon="navigate-outline" title="Track with a code" subtitle="Find an order or booking" onPress={()=>go('track')}/>
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 52 }} />
          <AccountRow icon="help-buoy-outline" title="Help & support" subtitle="Contact the Sokoni Hub team" onPress={()=>go('support')}/>
        </View>
      </ScrollView>
      <Tabs active="account" tab={tab}/>
    </View>
  );

  const tiles: [IconName, string, number | undefined, () => void][] = [
    ['receipt-outline', 'Orders', counts.orders, () => go('orders')],
    ['calendar-outline', 'Bookings', counts.bookings, () => go('bookings')],
    ['navigate-outline', 'Track', undefined, () => go('track')],
    ['heart-outline', 'Saved', fav.items.length, () => go('saved')]
  ];

  const badge = (n?: number) => n ? (
    <View style={{ backgroundColor: colors.primary, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{n}</Text>
    </View>
  ) : undefined;

  const GroupTitle = ({ children }: { children: string }) => (
    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: 32, marginBottom: 8, paddingHorizontal: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {children}
    </Text>
  );

  const CardGroup = ({ children }: { children: React.ReactNode }) => (
    <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden', marginHorizontal: 16, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 8, elevation: 1 }}>
      {children}
    </View>
  );

  const Line = () => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 52 }} />;

  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScrollView 
      contentContainerStyle={{ paddingBottom: 60 }} 
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
    >
      {/* Brand hero: Sokoni green with gold accents */}
      <View style={{ backgroundColor: BRAND.green, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 56, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', right: -50, top: -50, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,255,255,0.06)' }} />
        <View style={{ position: 'absolute', left: -40, bottom: -70, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,122,0,0.22)' }} />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color: 'rgba(255,255,255,0.72)', textTransform: 'uppercase' }}>My account</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => go('notifications')} style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Icon name="notifications-outline" size={21} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 20 }}>
          <View style={{ width: 82, height: 82, borderRadius: 41, backgroundColor: BRAND.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.9)', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 }}>
            <Text style={{ fontSize: 32, fontWeight: '900', color: '#FFFFFF' }}>{user.full_name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 23, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.4 }}>{user.full_name}</Text>
            <Text numberOfLines={1} style={{ fontSize: 14, color: 'rgba(255,255,255,0.82)', marginTop: 2 }}>{user.email || user.phone}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
              <Icon name="shield-checkmark" size={14} color="#FFB36B" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>Verified buyer</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Shortcut card overlapping the hero */}
      <View style={{ marginHorizontal: 16, marginTop: -30, backgroundColor: colors.surface, borderRadius: 22, padding: 10, flexDirection: 'row', gap: 6, shadowColor: '#0B2B1E', shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
        {tiles.map(([icon, label, n, onPress], index) => {
          const tone = index % 2 === 0 ? { bg: BRAND.greenSoft, fg: BRAND.green } : { bg: BRAND.goldSoft, fg: BRAND.gold };
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={onPress}
              style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 16, opacity: pressed ? 0.7 : 1 })}
            >
              <View style={{ width: 50, height: 50, borderRadius: 17, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={icon} size={23} color={tone.fg} />
                {n ? (
                  <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 19, height: 19, borderRadius: 10, backgroundColor: BRAND.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: colors.surface }}>
                    <Text style={{ fontSize: 10, fontWeight: '900', color: '#FFFFFF' }}>{n}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ marginTop: 8, fontSize: 12, fontWeight: '700', color: colors.text }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <GroupTitle>Profile Details</GroupTitle>
      <CardGroup>
        <AccountRow icon="person-outline" title="Full name" subtitle={user.full_name} right={<View/>} />
        <Line />
        <AccountRow icon="call-outline" title="Phone number" subtitle={user.phone ? `+${String(user.phone).replace(/^\+/, '')}` : 'Not added'} right={<View/>} />
        <Line />
        <AccountRow icon="mail-outline" title="Email address" subtitle={user.email || 'Not added'} right={<View/>} />
      </CardGroup>

      <GroupTitle>Security</GroupTitle>
      <CardGroup>
        <AccountRow icon="lock-closed-outline" title="Change password" subtitle="Update your 12+ character password" onPress={() => setPassSheet(true)} />
        <Line />
        <AccountRow icon="key-outline" title="Change PIN" subtitle="Update your 4-digit security PIN" onPress={() => setPinSheet(true)} />
        <Line />
        <AccountRow icon="trash" title="Delete account" subtitle="Request permanent deletion" onPress={() => setDeleteSheet(true)} />
      </CardGroup>

      <GroupTitle>My Activity</GroupTitle>
      <CardGroup>
        <AccountRow icon="receipt-outline" title="My orders" subtitle="Track products and delivery" right={badge(counts.orders)} onPress={()=>go('orders')} />
        <Line />
        <AccountRow icon="calendar-outline" title="My bookings" subtitle="Manage service requests" right={badge(counts.bookings)} onPress={()=>go('bookings')} />
        <Line />
        <AccountRow icon="heart-outline" title="Saved items" subtitle="Products and services you liked" right={badge(fav.items.length)} onPress={()=>go('saved')} />
      </CardGroup>

      <GroupTitle>Preferences</GroupTitle>
      <CardGroup>
        <AccountRow icon={theme==='dark'?'moon-outline':'sunny-outline'} title="Dark mode" subtitle={theme==='dark'?'On':'Off'} right={<Switch value={theme==='dark'} onValueChange={toggleTheme} trackColor={{false:colors.border,true:colors.primary}} thumbColor="#fff"/>} />
        <Line />
        <AccountRow icon="notifications-outline" title="Notifications" subtitle="Order and booking updates" onPress={()=>go('notifications')} />
      </CardGroup>

      <GroupTitle>Support & Legal</GroupTitle>
      <CardGroup>
        <AccountRow icon="help-buoy-outline" title="Help & support" subtitle="Order, account and safety help" onPress={()=>go('support')} />
        <Line />
        <AccountRow icon="document-text-outline" title="Terms & privacy" subtitle="Customer policies and marketplace rules" onPress={()=>go('legal')} />
      </CardGroup>

      <View style={{ paddingHorizontal: 16, marginTop: 40, marginBottom: 20 }}>
        <Pressable 
          onPress={() => Alert.alert('Sign out?','You will need your password and PIN to sign in again.',[{text:'Cancel',style:'cancel'},{text:'Sign out',style:'destructive',onPress:()=>void logout()}])}
          style={({pressed}) => [{ backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.danger }}>Sign out</Text>
        </Pressable>
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 16, paddingHorizontal: 20 }}>
          Seller and administrator tools remain on the secure web portal.
        </Text>
      </View>
    </ScrollView>
    <Tabs active="account" tab={tab}/>

    <Sheet visible={passSheet} title="Change Password" onClose={() => setPassSheet(false)}>
      <Field label="Current Password" value={passForm.current} onChangeText={(v) => setPassForm({...passForm, current: v})} secureTextEntry />
      <Field label="New Password (12+ chars)" value={passForm.newPass} onChangeText={(v) => setPassForm({...passForm, newPass: v})} secureTextEntry />
      <Button onPress={submitPass} loading={passBusy} style={{ marginTop: 12 }}>Update Password</Button>
    </Sheet>

    <Sheet visible={pinSheet} title="Change PIN" onClose={() => setPinSheet(false)}>
      <Field label="Current PIN" value={pinForm.current} onChangeText={(v) => setPinForm({...pinForm, current: v})} secureTextEntry keyboardType="number-pad" maxLength={4} />
      <Field label="New PIN" value={pinForm.newPin} onChangeText={(v) => setPinForm({...pinForm, newPin: v})} secureTextEntry keyboardType="number-pad" maxLength={4} />
      <Field label="Confirm New PIN" value={pinForm.confirm} onChangeText={(v) => setPinForm({...pinForm, confirm: v})} secureTextEntry keyboardType="number-pad" maxLength={4} />
      <Button onPress={submitPin} loading={pinBusy} style={{ marginTop: 12 }}>Update PIN</Button>
    </Sheet>

    <Sheet visible={deleteSheet} title="Delete account" onClose={() => setDeleteSheet(false)}>
      <Notice>Your account is reviewed, then deleted: your profile, login and uploaded documents are removed. Order and payment records we must keep are retained under our privacy policy. Finish any open orders or bookings first.</Notice>
      <Field label="Current Password" value={deleteForm.password} onChangeText={(v) => setDeleteForm({ ...deleteForm, password: v })} secureTextEntry />
      <Field label="Reason (optional)" value={deleteForm.reason} onChangeText={(v) => setDeleteForm({ ...deleteForm, reason: v })} multiline maxLength={500} />
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: deleteForm.agree }} onPress={() => setDeleteForm({ ...deleteForm, agree: !deleteForm.agree })} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: deleteForm.agree ? colors.primary : colors.border, backgroundColor: deleteForm.agree ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
          {deleteForm.agree ? <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>✓</Text> : null}
        </View>
        <Text style={{ flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 }}>I understand my account will be deleted after review and cannot be undone.</Text>
      </Pressable>
      <Button variant="danger" onPress={submitDelete} loading={deleteBusy}>Request deletion</Button>
    </Sheet>
  </View>;
}
