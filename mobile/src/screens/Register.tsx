
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
import { WebOnlyAccount } from './WebOnlyAccount';export function Register({ go, back, done }: any) { const { colors } = useTheme(); const auth = useAuth(); const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '', pin: '', confirm: '' }); const [busy, setBusy] = useState(false); const set = (key: keyof typeof form) => (value: string) => setForm((old) => ({ ...old, [key]: value })); const submit = async () => { if (!form.full_name || !form.phone || !form.email || !form.password || !form.pin) return Alert.alert('Complete the form', 'Every field is required for a secure buyer account.'); if (form.password.length < 12) return Alert.alert('Choose a longer password', 'Use at least 12 characters.'); if (form.pin !== form.confirm) return Alert.alert('PINs do not match', 'Please enter the same four-digit PIN twice.'); setBusy(true); try { const stage = await auth.register(form); if (stage.kind === 'pin') go('pin'); else if (stage.kind === 'setup') go('pinsetup'); else done(); } catch (e) { Alert.alert('Could not create account', message(e)); } finally { setBusy(false); } }; return <AuthScaffold title="Create your account" subtitle="A buyer account lets you order, book and track securely." back={back}><Field label="Full name" value={form.full_name} onChangeText={set('full_name')} autoComplete="name" placeholder="Your name"/><Field label="Phone number" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="+974…"/><Field label="Email address" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com"/><Field label="Password" value={form.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" placeholder="At least 12 characters"/><Field label="Choose a 4-digit PIN" value={form.pin} onChangeText={set('pin')} secureTextEntry keyboardType="number-pad" maxLength={4} placeholder="••••"/><Field label="Confirm your PIN" value={form.confirm} onChangeText={set('confirm')} secureTextEntry keyboardType="number-pad" maxLength={4} placeholder="••••"/><Notice>Keep your PIN private. Avoid simple sequences or digits from your phone number.</Notice><Button loading={busy} onPress={submit} style={{ marginTop: 8 }}>Create secure account</Button><Text style={[styles.terms, { color: colors.text2 }]}>By continuing, you agree to Sokoni Hub's <Text accessibilityRole="link" onPress={() => go('legal')} style={{ color: colors.primary, fontWeight: '800' }}>terms and privacy policy</Text>.</Text><Text style={[styles.authSwitch, { color: colors.text2 }]}>Already registered? <Text accessibilityRole="link" onPress={() => go('login')} style={{ color: colors.primary, fontWeight: '800' }}>Sign in</Text></Text></AuthScaffold>; }
