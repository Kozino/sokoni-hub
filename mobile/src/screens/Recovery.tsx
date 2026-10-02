
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
import { WebOnlyAccount } from './WebOnlyAccount';export function Recovery({ go, back, params }: any) { const { colors } = useTheme(); const initial = params?.purpose === 'pin' ? 'pin' : 'password'; const [purpose, setPurpose] = useState<'password' | 'pin'>(initial); const [email, setEmail] = useState(''); const [code, setCode] = useState(''); const [secret, setSecret] = useState(''); const [confirm, setConfirm] = useState(''); const [requested, setRequested] = useState(false); const [busy, setBusy] = useState(false); const request = async () => { if (!email) return Alert.alert('Enter your email', 'Use the email registered on your buyer account.'); setBusy(true); try { await api.post('/auth/recovery/request', { email, purpose }); setRequested(true); Alert.alert('Check your inbox', 'If that address can receive recovery email, a one-time code will arrive shortly.'); } catch (e) { Alert.alert('Could not start recovery', message(e)); } finally { setBusy(false); } }; const reset = async () => { if (code.length !== 6 || !secret) return Alert.alert('Complete the form', 'Enter the six-digit email code and your new credential.'); if (secret !== confirm) return Alert.alert('Does not match', 'Please enter the same new value twice.'); if (purpose === 'password' && secret.length < 12) return Alert.alert('Choose a longer password', 'Use at least 12 characters.'); if (purpose === 'pin' && !/^\d{4}$/.test(secret)) return Alert.alert('PIN required', 'Use exactly four digits.'); setBusy(true); try { await api.post('/auth/recovery/complete', purpose === 'password' ? { email, purpose, code, new_password: secret } : { email, purpose, code, new_pin: secret }); Alert.alert('Updated securely', `Your ${purpose === 'password' ? 'password' : 'PIN'} has been reset. Sign in again.`); go('login'); } catch (e) { Alert.alert('Could not reset', message(e)); } finally { setBusy(false); } }; return <AuthScaffold title={`Recover ${purpose === 'password' ? 'password' : 'PIN'}`} subtitle="Recovery emails work as soon as Sokoni Hub email delivery is enabled. We never reveal whether an account exists." back={back}><View style={styles.recoveryTabs}><Chip selected={purpose === 'password'} onPress={() => { setPurpose('password'); setRequested(false); }}>Password</Chip><Chip selected={purpose === 'pin'} onPress={() => { setPurpose('pin'); setRequested(false); }}>PIN</Chip></View><Field label="Your account email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" editable={!requested}/>{!requested ? <Button loading={busy} onPress={request}>Email me a recovery code</Button> : <><Notice type="success">A short-lived one-time code was requested. It is valid for 15 minutes.</Notice><Field label="6-digit recovery code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="••••••"/><Field label={purpose === 'password' ? 'New password' : 'New 4-digit PIN'} value={secret} onChangeText={setSecret} secureTextEntry keyboardType={purpose === 'pin' ? 'number-pad' : 'default'} maxLength={purpose === 'pin' ? 4 : undefined} placeholder={purpose === 'password' ? 'At least 12 characters' : '••••'}/><Field label="Confirm new value" value={confirm} onChangeText={setConfirm} secureTextEntry keyboardType={purpose === 'pin' ? 'number-pad' : 'default'} maxLength={purpose === 'pin' ? 4 : undefined} placeholder="Repeat it"/><Button loading={busy} onPress={reset}>Reset securely</Button><Pressable accessibilityRole="button" onPress={() => { setRequested(false); setCode(''); }}><Text style={[styles.forgot, { color: colors.primary }]}>Request a new code</Text></Pressable></>}</AuthScaffold>; }

