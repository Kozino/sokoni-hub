
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
import { Account } from './Account';
import { AccountRow } from './AccountRow';
import { Support } from './Support';
import { GuestGate } from './GuestGate';
import { WebOnlyAccount } from './WebOnlyAccount';export function Track({ go, back, params }: any) { const { colors } = useTheme(); const [orderCode, setOrderCode] = useState(params?.code || ''); const [bookingCode, setBookingCode] = useState(params?.bookingCode || ''); const [phone, setPhone] = useState(params?.phone || ''); const [result, setResult] = useState<any>(null); const [busy, setBusy] = useState(false); const track = async () => { if (!phone || (!orderCode && !bookingCode)) return Alert.alert('Enter tracking details', 'Use either your order or booking code and the phone used at checkout.'); setBusy(true); try { const isBooking = !!bookingCode; const data = await api.get<any>(isBooking ? `/bookings/track${query({code: bookingCode, phone})}` : `/orders/track${query({code: orderCode, phone})}`); setResult({ ...data, isBooking }); } catch (e) { Alert.alert('Could not find it', message(e)); } finally { setBusy(false); } }; return <View style={styles.page}><Header title="Track an order or booking" back={back}/><ScrollView contentContainerStyle={styles.trackScroll}><Notice>Enter the code from your confirmation and the complete phone number used to place it.</Notice><Field label="Order code (if tracking an order)" value={orderCode} onChangeText={(value) => { setOrderCode(value.toUpperCase()); if(value) setBookingCode(''); }} autoCapitalize="characters" placeholder="ORD…"/><Field label="Booking code (if tracking a service)" value={bookingCode} onChangeText={(value) => { setBookingCode(value.toUpperCase()); if(value) setOrderCode(''); }} autoCapitalize="characters" placeholder="BKG…"/><Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+974…"/><Button loading={busy} onPress={track}>Track status</Button>{result ? <Card style={{ marginTop: 18 }}><View style={styles.orderTop}><Text style={[styles.orderCode, { color: colors.text }]}>{result.order?.code || result.booking?.code}</Text><Status value={result.order?.status || result.booking?.status}/></View><Divider/><Text style={[styles.trackProduct, { color: colors.text }]}>{result.order?.business_name || result.booking?.listing_title || result.booking?.business_name || 'Sokoni Hub'}</Text><Text style={[styles.trackDetail, { color: colors.text2 }]}>{result.isBooking ? `Preferred: ${date(result.booking?.slot_starts_at || result.booking?.scheduled_at || result.booking?.preferred_at)}` : `Placed: ${date(result.order?.created_at)}`}</Text>{result.order?.whatsapp_url ? <Button variant="secondary" onPress={() => Linking.openURL(result.order.whatsapp_url)} style={{ marginTop: 13 }}>Contact seller on WhatsApp</Button> : null}</Card> : null}</ScrollView></View>; }
