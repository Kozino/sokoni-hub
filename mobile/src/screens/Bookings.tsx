
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { Status } from './Status';
import { Track } from './Track';
import { Account } from './Account';
import { AccountRow } from './AccountRow';
import { Support } from './Support';
import { GuestGate } from './GuestGate';
import { WebOnlyAccount } from './WebOnlyAccount';export function Bookings({ go, back }: any) { const { colors } = useTheme(); const { user } = useAuth(); const [bookings, setBookings] = useState<Booking[]>([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async (pull = false) => { if (!user) return; if (pull) setRefreshing(true); else setLoading(true); setError(''); try { setBookings((await api.get<{bookings: Booking[]}>('/bookings/mine')).bookings); } catch (e) { if (pull) Alert.alert('Could not refresh', message(e)); else setError(message(e)); } finally { setLoading(false); setRefreshing(false); } }, [user]);
  useEffect(() => { void load(); }, [load]); if (!user) return <GuestGate heading="My bookings" title="Sign in to see bookings" text="Keep your service requests and their latest status in one place." go={go} back={back}/>; return <View style={styles.page}><Header title="My bookings" back={back}/>{loading ? <Spinner label="Loading your bookings…"/> : error && !bookings.length ? <EmptyState icon="cloud-offline-outline" title="Could not load bookings" text={error} action={<Button style={{ marginTop: 8 }} onPress={() => void load()}>Try again</Button>}/> : <FlatList data={bookings} keyExtractor={(booking) => booking.id} contentContainerStyle={styles.ordersList} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary}/>} renderItem={({ item }) => <Card style={styles.orderCard}><View style={styles.orderTop}><View><Text style={[styles.orderCode, { color: colors.text }]}>{item.listing_title || item.code}</Text><Text style={[styles.orderDate, { color: colors.text2 }]}>{item.business_name} · {dateTime(item.slot_starts_at || item.scheduled_at || item.preferred_at)}</Text></View><Status value={item.status}/></View><Divider/><Pressable accessibilityRole="button" onPress={() => go('track', { bookingCode: item.code, phone: user.phone })}><Text style={[styles.trackLink, { color: colors.primary }]}>Track booking</Text></Pressable></Card>} ListEmptyComponent={<EmptyState title="No bookings yet" text="Book a local service to manage it here." action={<Button onPress={() => go('browse', { kind: 'service' })}>Browse services</Button>}/>}/>}</View>; }
