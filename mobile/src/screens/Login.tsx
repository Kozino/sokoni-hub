
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
import { WebOnlyAccount } from './WebOnlyAccount';export function Login({ go, back, done }: any) {
  const { colors } = useTheme(); const auth = useAuth(); const [identifier, setIdentifier] = useState(''); const [password, setPassword] = useState(''); const [phoneMode, setPhoneMode] = useState(true); const [busy, setBusy] = useState(false);
  const submit = async () => { if (!identifier.trim() || !password) return Alert.alert('Enter your details', `Enter your ${phoneMode ? 'phone number' : 'email address'} and password.`); let value = identifier.trim(); if (phoneMode) { let digits = value.replace(/\D/g, ''); if (digits.startsWith('00')) digits = digits.slice(2); if (digits.length === 8) digits = `974${digits}`; value = digits; } setBusy(true); try { const stage = await auth.login(value, password); if (stage.kind === 'pin') go('pin'); else if (stage.kind === 'setup') go('pinsetup'); else if (stage.kind === 'mfa') Alert.alert('Web-only account', 'Administrators use the secure web portal.'); else done(); } catch (e) { Alert.alert('Sign-in failed', message(e)); } finally { setBusy(false); } };
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.authPage}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.referenceAuthScroll}>
    <View style={styles.referenceTopbar}><Pressable accessibilityRole="button" onPress={back} accessibilityLabel="Go back" style={styles.referenceBack}><Icon name="arrow-back" size={25} color={colors.text}/></Pressable><BrandMark small/><View style={[styles.currencyBadge,{backgroundColor:colors.surface2}]}><Text style={[styles.currencyBadgeText,{color:colors.text}]}>QATAR{`\n`}(QAR)</Text></View></View>
    <View style={styles.referenceBrandBlock}><View style={[styles.referenceLogoCircle,{backgroundColor:colors.primarySoft}]}><Image contentFit="cover" source={require('../../assets/logo.png')} style={styles.referenceLogo}/><View style={[styles.globeDot,{backgroundColor:colors.primary}]}><Icon name="globe-outline" size={15} color="#fff"/></View></View><Text style={[styles.referenceWelcome,{color:colors.text}]}>Welcome Back!</Text><Text style={[styles.referenceLanguage,{color:colors.primary}]}>Karibu tena • Kaabo • Nno</Text><Text style={[styles.referenceIntro,{color:colors.text2}]}>Your trusted African community hub & artisan marketplace across Qatar</Text></View>
    <View style={[styles.referenceLoginCard,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <View style={[styles.loginModeToggle,{backgroundColor:colors.surface2}]}><Pressable onPress={() => setPhoneMode(true)} accessibilityRole="button" accessibilityState={{ selected: phoneMode }} style={[styles.loginMode,{backgroundColor:phoneMode?colors.primary:'transparent'}]}><Icon name="call-outline" size={18} color={phoneMode?'#fff':colors.text2}/><Text style={[styles.loginModeText,{color:phoneMode?'#fff':colors.text2}]}>Qatar Phone</Text></Pressable><Pressable onPress={() => setPhoneMode(false)} accessibilityRole="button" accessibilityState={{ selected: !phoneMode }} style={[styles.loginMode,{backgroundColor:!phoneMode?colors.primary:'transparent'}]}><Icon name="mail-outline" size={18} color={!phoneMode?'#fff':colors.text2}/><Text style={[styles.loginModeText,{color:!phoneMode?'#fff':colors.text2}]}>Email Address</Text></Pressable></View>
      <View style={styles.fieldHeader}><Text style={[styles.referenceFieldLabel,{color:colors.text}]}>{phoneMode ? 'Mobile Number' : 'Email Address'}</Text>{phoneMode && <Text style={[styles.networkLabel,{color:colors.text2}]}>Ooredoo / Vodafone</Text>}</View>
      {phoneMode ? <View style={[nx.phoneField,{backgroundColor:colors.surface2,borderColor:colors.border}]}><View style={nx.phonePrefix}><Text style={styles.qatarFlag}>🇶🇦</Text><Text style={[styles.countryCodeText,{color:colors.text}]}>+974</Text></View><View style={[nx.phoneDivider,{backgroundColor:colors.border}]}/><TextInput accessibilityLabel="Mobile number" value={identifier} onChangeText={setIdentifier} keyboardType="phone-pad" autoComplete="username" placeholder="3312 4567" placeholderTextColor={colors.muted} style={[nx.phoneInput,{color:colors.text}]}/></View> : <Field label="" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="email-address" autoComplete="username" placeholder="you@example.com" style={styles.referenceField}/>}
      <View style={styles.fieldHeader}><Text style={[styles.referenceFieldLabel,{color:colors.text}]}>Password</Text><Pressable accessibilityRole="button" onPress={() => go('forgot',{purpose:'password'})}><Text style={[styles.forgot,{color:colors.gold}]}>Forgot password?</Text></Pressable></View>
      <Field label="" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder="Your secure password" style={styles.referenceField}/>
      <Notice><Text>After your password, we will ask for your secure four-digit PIN.</Text></Notice>
      <Button loading={busy} onPress={submit} icon="arrow-forward" style={styles.referenceSignIn}>Sign In to Sokoni Hub</Button>
      <View style={styles.orLine}><View style={[styles.orStroke,{backgroundColor:colors.border}]}/><Text style={[styles.orText,{color:colors.text2}]}>OR SECURE ACCESS</Text><View style={[styles.orStroke,{backgroundColor:colors.border}]}/></View>
      <Button variant="secondary" onPress={() => go('browse')} style={styles.guestAccess}>Continue exploring listings as guest</Button>
      <Text style={[styles.authSwitch,{color:colors.text2}]}>New to Qatar or Sokoni? <Text accessibilityRole="link" onPress={() => go('register')} style={{color:colors.gold,fontWeight:'900'}}>Create an account</Text></Text>
    </View>
    <Pressable accessibilityRole="button" onPress={() => WebBrowser.openBrowserAsync(WEB_URL)}><Text style={[styles.webPortalLink,{color:colors.text2}]}>Vendors and administrators use the secure web portal.</Text></Pressable>
  </ScrollView></KeyboardAvoidingView>;
}

