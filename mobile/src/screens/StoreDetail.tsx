
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
import { Cart } from './Cart';
import { Orders } from './Orders';
import { Bookings } from './Bookings';
import { Status } from './Status';
import { Track } from './Track';
import { Account } from './Account';
import { AccountRow } from './AccountRow';
import { Support } from './Support';
import { GuestGate } from './GuestGate';
import { WebOnlyAccount } from './WebOnlyAccount';export function StoreDetail({ slug, go, back }: any) { const { colors } = useTheme(); const [vendor, setVendor] = useState<Vendor | null>(null); const [listings, setListings] = useState<Listing[]>([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async (pull = false) => { if (pull) setRefreshing(true); else setLoading(true); setError(''); try { const data = await api.get<{vendor: Vendor; listings: Listing[]}>(`/vendors/${encodeURIComponent(slug)}`); setVendor(data.vendor); setListings(data.listings); } catch (e) { if (pull) Alert.alert('Could not refresh', message(e)); else setError(message(e)); } finally { setLoading(false); setRefreshing(false); } }, [slug]);
  useEffect(() => { void load(); }, [load]);
  if (error && !vendor) return <View style={styles.page}><Header title="Store" back={back}/><EmptyState icon="cloud-offline-outline" title="Store unavailable" text={error} action={<Button style={{ marginTop: 8 }} onPress={() => void load()}>Try again</Button>}/></View>; if (loading || !vendor) return <View style={styles.page}><Header title="Store" back={back}/><Spinner label="Loading store…"/></View>; return <View style={styles.page}><Header title="Store" back={back}/><ScrollView contentContainerStyle={styles.detailScroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary}/>}><View style={{ height: 110, backgroundColor: colors.primary, overflow: 'hidden' }}>{vendor.logo_url && <Image contentFit="cover" transition={200} source={{ uri: vendor.logo_url }} style={{ width: '100%', height: '100%', opacity: 0.4 }} blurRadius={10} />}</View><View style={styles.storeInfo}><View style={{ flexDirection: 'row', alignItems: 'center', marginTop: -35, marginBottom: 10 }}><View style={{ width: 70, height: 70, borderRadius: 12, backgroundColor: '#fff', padding: 3, elevation: 4 }}>{vendor.logo_url ? <Image contentFit="cover" transition={200} source={{ uri: vendor.logo_url}} style={{width: '100%', height: '100%', borderRadius: 9}} /> : <Icon name="storefront" size={48} color={colors.primary}/>}</View></View><Text style={[styles.detailTitle, { color: colors.text }]}>{vendor.business_name}</Text><Text style={[styles.detailDescription, { color: colors.text2 }]}>{vendor.description || 'A verified local Sokoni Hub seller.'}</Text><View style={styles.storeMeta}><Icon name="location-outline" size={17} color={colors.muted}/><Text style={[styles.vendorMeta, { color: colors.text2 }]}>{vendor.city}, {vendor.country}</Text></View><Button variant="secondary" onPress={() => Linking.openURL(`https://wa.me/${String(vendor.whatsapp || '').replace(/\D/g, '')}`)}>Message store on WhatsApp</Button><SectionTitle title="Available listings"/>{listings.length ? listings.map((listing) => <ListingCard key={listing.id} listing={listing} onPress={() => go('listing', { id: listing.id })}/>) : <EmptyState title="No current listings" text="Check back soon for this seller's latest products and services."/>}</View></ScrollView></View>; }

