
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
  const { colors, theme, toggleTheme } = useTheme(); const { user, logout } = useAuth(); const fav = useFavourites();
  const [counts, setCounts] = useState<{ orders?: number; bookings?: number }>({});
  const [refreshing, setRefreshing] = useState(false);
  const fetchCounts = useCallback(() => Promise.all([api.get<{ orders: Order[] }>('/orders/mine').catch(() => null), api.get<{ bookings: Booking[] }>('/bookings/mine').catch(() => null)]), []);
  useEffect(() => {
    if (!user) return undefined; let live = true;
    void fetchCounts().then(([o, b]) => { if (live) setCounts({ orders: o?.orders.length, bookings: b?.bookings.length }); });
    return () => { live = false; };
  }, [user, fetchCounts]);
  const refresh = async () => { setRefreshing(true); const [o, b] = await fetchCounts(); setCounts({ orders: o?.orders.length, bookings: b?.bookings.length }); setRefreshing(false); };
  if(!user) return <View style={styles.page}><View style={styles.accountGuestHeader}><BrandMark small/><Pressable accessibilityRole="button" onPress={back} accessibilityLabel="Close" style={styles.accountClose}><Icon name="close" size={22} color={colors.text}/></Pressable></View><ScrollView contentContainerStyle={styles.accountGuestScroll}><View style={[styles.guestHero,{backgroundColor:colors.primarySoft}]}><View style={[styles.guestAvatar,{backgroundColor:colors.primary}]}><Icon name="person-outline" size={34} color="#fff"/></View><Text style={[styles.guestHeroTitle,{color:colors.text}]}>Your Sokoni Hub profile</Text><Text style={[styles.guestHeroCopy,{color:colors.text2}]}>Sign in to place orders, book specialists, keep your address handy and track every request.</Text><Button onPress={()=>go('login')} style={styles.guestSignButton}>Sign in securely</Button><Button variant="secondary" onPress={()=>go('register')} style={styles.guestCreateButton}>Create buyer account</Button></View><SectionTitle title="Explore as a guest"/><AccountRow icon="search-outline" title="Browse the market" subtitle="Products, stalls and local services" onPress={()=>tab('browse')}/><AccountRow icon="navigate-outline" title="Track with a code" subtitle="Find an order or booking" onPress={()=>go('track')}/><AccountRow icon="help-buoy-outline" title="Help & support" subtitle="Contact the Sokoni Hub team" onPress={()=>go('support')}/></ScrollView><Tabs active="account" tab={tab}/></View>;
  const tiles: [IconName, string, number | undefined, () => void][] = [['receipt-outline','Orders',counts.orders,()=>go('orders')],['calendar-outline','Bookings',counts.bookings,()=>go('bookings')],['navigate-outline','Track',undefined,()=>go('track')],['heart-outline','Saved',fav.items.length,()=>go('saved')]];
  const badge = (n?: number) => n === undefined ? undefined : <View style={[nx.countPill,{backgroundColor:colors.primarySoft}]}><Text style={[nx.countText,{color:colors.primary}]}>{n}</Text></View>;
  return <View style={styles.page}>
    <LinearGradient colors={['#05663F','#FF7A00']} start={{x:0,y:0}} end={{x:1,y:1}} style={nx.profileHeader}>
      <View style={styles.profileTopRow}><View style={nx.logoChip}><BrandMark small/></View><Pressable accessibilityRole="button" onPress={()=>go('notifications')} accessibilityLabel="Notifications" style={styles.profileBell}><Icon name="notifications-outline" size={21} color="#fff"/></Pressable></View>
      <View style={nx.identity}><View style={nx.avatar}><Text style={nx.avatarText}>{user.full_name.charAt(0).toUpperCase()}</Text></View><View style={{flex:1}}><Text numberOfLines={1} style={styles.profileName}>{user.full_name}</Text><Text numberOfLines={1} style={[styles.profileContact,{color:'#F2FFF7'}]}>{user.email || user.phone}</Text><View style={styles.profileVerified}><Icon name="shield-checkmark" size={12} color="#fff"/><Text style={styles.profileVerifiedText}>Verified buyer</Text></View></View></View>
    </LinearGradient>
    <ScrollView contentContainerStyle={nx.accountBody} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
      <View style={nx.tileGrid}>{tiles.map(([icon,label,n,onPress])=><Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[nx.tile,{backgroundColor:colors.surface,borderColor:colors.border}]}><View style={[styles.quickAccountIcon,{backgroundColor:colors.primarySoft}]}><Icon name={icon} size={20} color={colors.primary}/></View><Text style={[styles.quickAccountText,{color:colors.text}]}>{label}</Text>{n===undefined?<View style={nx.countSpacer}/>:badge(n)}</Pressable>)}</View>
      <Text style={[styles.accountSectionLabel,{color:colors.text2}]}>PROFILE DETAILS</Text>
      <View style={[styles.accountGroup,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <AccountRow icon="person-outline" title="Full name" subtitle={user.full_name} right={<View/>}/><Divider/>
        <AccountRow icon="call-outline" title="Phone number" subtitle={user.phone ? `+${String(user.phone).replace(/^\+/, '')}` : 'Not added'} right={<View/>}/><Divider/>
        <AccountRow icon="mail-outline" title="Email address" subtitle={user.email || 'Not added'} right={<View/>}/>
      </View>
      <Text style={[styles.accountSectionLabel,{color:colors.text2}]}>MY ACTIVITY</Text>
      <View style={[styles.accountGroup,{backgroundColor:colors.surface,borderColor:colors.border}]}><AccountRow icon="receipt-outline" title="My orders" subtitle="Track products and delivery" right={badge(counts.orders)} onPress={()=>go('orders')}/><Divider/><AccountRow icon="calendar-outline" title="My bookings" subtitle="Manage service requests" right={badge(counts.bookings)} onPress={()=>go('bookings')}/><Divider/><AccountRow icon="heart-outline" title="Saved items" subtitle="Products and services you liked" right={badge(fav.items.length)} onPress={()=>go('saved')}/></View>
      <Text style={[styles.accountSectionLabel,{color:colors.text2}]}>PREFERENCES</Text>
      <View style={[styles.accountGroup,{backgroundColor:colors.surface,borderColor:colors.border}]}><AccountRow icon={theme==='dark'?'moon-outline':'sunny-outline'} title="Dark mode" subtitle={theme==='dark'?'On':'Off'} right={<Switch accessibilityLabel="Dark mode" value={theme==='dark'} onValueChange={toggleTheme} trackColor={{false:colors.border,true:colors.primary}} thumbColor="#fff"/>}/><Divider/><AccountRow icon="notifications-outline" title="Notifications" subtitle="Order and booking updates" onPress={()=>go('notifications')}/></View>
      <Text style={[styles.accountSectionLabel,{color:colors.text2}]}>SUPPORT & LEGAL</Text>
      <View style={[styles.accountGroup,{backgroundColor:colors.surface,borderColor:colors.border}]}><AccountRow icon="help-buoy-outline" title="Help & support" subtitle="Order, account and safety help" onPress={()=>go('support')}/><Divider/><AccountRow icon="document-text-outline" title="Terms & privacy" subtitle="Customer policies and marketplace rules" onPress={()=>go('legal')}/></View>
      <Button variant="danger" onPress={()=>Alert.alert('Sign out?','You will need your password and PIN to sign in again.',[{text:'Cancel',style:'cancel'},{text:'Sign out',style:'destructive',onPress:()=>void logout()}])} style={styles.colourSignOut}>Sign out</Button>
      <Text style={[styles.accountFootnote,{color:colors.muted}]}>Seller and administrator tools remain on the secure web portal.</Text>
    </ScrollView>
    <Tabs active="account" tab={tab}/>
  </View>;
}

