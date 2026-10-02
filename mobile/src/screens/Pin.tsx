
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
import { WebOnlyAccount } from './WebOnlyAccount';export function Pin({ go, back, done, setup }: any) {
  const { colors } = useTheme(); const auth = useAuth(); const [pin, setPin] = useState(''); const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (overridePin?: string) => { const p = typeof overridePin === 'string' ? overridePin : pin; if (p.length !== 4) return Alert.alert('Enter your PIN', 'Your PIN must contain exactly four digits.'); setBusy(true); try { if (setup) { await auth.setupPin(p, email || undefined); await SecureStore.setItemAsync('sokoni_pin', p); } else { await auth.verifyPin(p); await SecureStore.setItemAsync('sokoni_pin', p); } done(); } catch(e) { Alert.alert(setup?'Could not save PIN':'PIN not accepted',message(e)); setPin(''); } finally {setBusy(false);} };
  useEffect(() => { if (setup) return; (async () => { const hasHardware = await LocalAuthentication.hasHardwareAsync(); if (!hasHardware) return; const isEnrolled = await LocalAuthentication.isEnrolledAsync(); if (!isEnrolled) return; const stored = await SecureStore.getItemAsync('sokoni_pin'); if (!stored) return; const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Sign in to Sokoni Hub' }); if (result.success) { submit(stored); } })(); }, [setup]);
  const pressKey=(key:string)=> { tap(); if(key==='back')return setPin((value)=>value.slice(0,-1)); if(pin.length<4)setPin((value)=>value+key); };
  return <View style={styles.pinReferencePage}><View style={styles.referenceTopbar}><Pressable accessibilityRole="button" onPress={back} accessibilityLabel="Go back" style={styles.referenceBack}><Icon name="arrow-back" size={25} color={colors.text}/></Pressable><BrandMark small/><View style={[styles.currencyBadge,{backgroundColor:colors.surface2}]}><Text style={[styles.currencyBadgeText,{color:colors.text}]}>QATAR{`\n`}(QAR)</Text></View></View><ScrollView contentContainerStyle={styles.pinReferenceScroll} keyboardShouldPersistTaps="handled">
    <View style={[styles.pinShield,{backgroundColor:colors.primarySoft}]}><Icon name={setup?'key-outline':'shield-checkmark'} size={39} color={colors.primary}/><View style={[styles.pinBolt,{backgroundColor:colors.gold}]}><Icon name="flash" size={12} color="#fff"/></View></View>
    <Text style={[styles.pinReferenceTitle,{color:colors.text}]}>{setup?'Create Security PIN':'Enter Security PIN'}</Text><Text style={[styles.pinReferenceIntro,{color:colors.text2}]}>{setup?'Choose a unique 4-digit PIN for future sign-ins.':'Enter the four-digit PIN that protects your Sokoni Hub account.'}</Text>
    {setup && auth.stage.kind==='setup' && auth.stage.needsEmail ? <Field label="Recovery email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com"/> : null}
    <View style={styles.pinBoxes}>{[0,1,2,3].map((index)=><View key={index} style={[styles.pinBox,{backgroundColor:colors.surface,borderColor:index<pin.length?colors.primary:colors.border}]}><Text style={[styles.pinDigit,{color:colors.primary}]}>{pin[index] ? '•' : ''}</Text></View>)}</View>
    <View style={[styles.biometricStrip,{backgroundColor:colors.surface2}]}><Icon name="finger-print" size={20} color={colors.primary}/><Text style={[styles.biometricText,{color:colors.primary}]}>PIN protected sign-in</Text></View>
    {!setup && <Pressable accessibilityRole="button" onPress={() => go('forgot',{purpose:'pin'})}><Text style={[styles.forgotPinLink,{color:colors.gold}]}>Forgot PIN?</Text></Pressable>}
    <Notice type="success">Your PIN is verified securely on Sokoni Hub. We never store the digits on this device.</Notice>
    <Button variant="gold" loading={busy} onPress={submit} icon="arrow-forward" style={styles.pinVerifyButton}>{setup?'Save PIN and access marketplace':'Verify & access marketplace'}</Button>
    <View style={styles.pinKeypad}>{['1','2','3','4','5','6','7','8','9','back','0','done'].map((key)=> <Pressable accessibilityRole="button" key={key} accessibilityLabel={key==='back'?'Delete digit':key==='done'?'Submit PIN':key} onPress={()=>key==='done'?submit():pressKey(key)} style={[styles.pinKey,{backgroundColor:key==='done'?colors.primarySoft:colors.surface,borderColor:colors.border}]}>{key==='back'?<Icon name="backspace-outline" size={24} color={colors.text}/>:key==='done'?<Icon name="arrow-forward" size={24} color={colors.primary}/>:<Text style={[styles.pinKeyText,{color:colors.text}]}>{key}</Text>}</Pressable>)}</View>
    <Text style={[styles.pinSecurityNote,{color:colors.text2}]}><Text style={{color:colors.success}}>●</Text> Account sessions are protected and repeated incorrect PIN attempts are temporarily locked.</Text>
  </ScrollView></View>;
}

