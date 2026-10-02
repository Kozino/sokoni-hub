
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
import { Account } from './Account';
import { AccountRow } from './AccountRow';
import { Support } from './Support';
import { GuestGate } from './GuestGate';
import { WebOnlyAccount } from './WebOnlyAccount';export function Notifications({ go, back }: any) {
  const { colors } = useTheme(); const { user } = useAuth();
  type Note = { id: string; icon: IconName; title: string; text: string; at: string; onPress: () => void };
  const [notes, setNotes] = useState<Note[]>([]); const [loading, setLoading] = useState(!!user); const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) return; setLoading(true); setError('');
    try {
      const [orders, bookings] = await Promise.all([api.get<{ orders: Order[] }>('/orders/mine'), api.get<{ bookings: Booking[] }>('/bookings/mine')]);
      const list: Note[] = [
        ...orders.orders.map((o): Note => ({ id: `o-${o.id}`, icon: 'receipt-outline', title: `Order ${o.code}`, text: `${statusLabel(o.status)} · ${o.business_name || o.vendor?.business_name || 'Seller'}`, at: o.created_at, onPress: () => go('track', { code: o.code, phone: user.phone }) })),
        ...bookings.bookings.map((b): Note => ({ id: `b-${b.id}`, icon: 'calendar-outline', title: b.listing_title || `Booking ${b.code}`, text: `${statusLabel(b.status)} · ${dateTime(b.slot_starts_at || b.scheduled_at || b.preferred_at)}`, at: b.created_at, onPress: () => go('track', { bookingCode: b.code, phone: user.phone }) })),
      ].sort((a, b) => +new Date(b.at) - +new Date(a.at));
      setNotes(list);
    } catch (e) { setError(message(e)); } finally { setLoading(false); }
  }, [user, go]);
  useEffect(() => { void load(); }, [load]);
  if (!user) return <GuestGate heading="Notifications" title="Sign in for updates" text="Order and booking updates appear here once you have a buyer account." go={go} back={back} />;
  return <View style={styles.page}>
    <Header title="Notifications" back={back} />
    {loading ? <Spinner label="Checking for updates…" /> : error ? <EmptyState icon="cloud-offline-outline" title="Could not load updates" text={error} action={<Button style={{ marginTop: 8 }} onPress={() => void load()}>Try again</Button>} /> :
      <FlatList data={notes} keyExtractor={(n) => n.id} contentContainerStyle={styles.ordersList} refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} tintColor={colors.primary} />}
        renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={item.onPress}><Card style={ex.noteCard}><View style={[ex.noteIcon, { backgroundColor: colors.primarySoft }]}><Icon name={item.icon} size={20} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[ex.noteTitle, { color: colors.text }]}>{item.title}</Text><Text style={[ex.noteText, { color: colors.text2 }]}>{item.text}</Text></View><Text style={[ex.noteAgo, { color: colors.muted }]}>{date(item.at)}</Text></Card></Pressable>}
        ListEmptyComponent={<EmptyState icon="notifications-outline" title="You're all caught up" text="When you order or book, every status change will show up here." />} />}
  </View>;
}



