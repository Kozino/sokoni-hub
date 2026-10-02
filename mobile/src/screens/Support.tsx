
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
import { Account } from './Account';
import { AccountRow } from './AccountRow';
import { GuestGate } from './GuestGate';
import { WebOnlyAccount } from './WebOnlyAccount';export function Support({ go, back }: any) { const { colors } = useTheme(); return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.page}><Header title="Help & support" back={back}/><ScrollView contentContainerStyle={styles.supportScroll}><View style={[styles.supportHero, { backgroundColor: colors.tealSoft }]}><Icon name="help-buoy" size={38} color={colors.teal}/><Text style={[styles.supportTitle, { color: colors.text }]}>We're here to help</Text><Text style={[styles.supportCopy, { color: colors.text2 }]}>For help with an order, booking, account or marketplace issue, contact Sokoni Hub directly.</Text></View><AccountRow icon="logo-whatsapp" title="WhatsApp support" subtitle="Message our support team" onPress={() => Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}`)}/><AccountRow icon="mail-outline" title="Email support" subtitle={SUPPORT_EMAIL} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}/><AccountRow icon="globe-outline" title="Open customer website" subtitle="More help and legal information" onPress={() => go('legal', { path: '', title: 'Sokoni Hub website' })}/><Notice type="warning">Never share your password, PIN, one-time recovery code or payment details in a message.</Notice></ScrollView></KeyboardAvoidingView>;
}
