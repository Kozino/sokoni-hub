
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
import { Support } from './Support';
import { GuestGate } from './GuestGate';
import { WebOnlyAccount } from './WebOnlyAccount';export function Tabs({ active, tab, kind }: { active: Screen; tab: (screen: Screen, params?: Record<string, any>) => void; kind?: string }) {
  const { colors } = useTheme(); const { count } = useCart(); const insets = useSafeAreaInsets();
  const items: [Screen, IconName, string][] = [['home','storefront-outline','Explore'],['browse','grid-outline','Categories'],['browse','construct-outline','Services'],['cart','bag-handle-outline','Cart'],['account','person-outline','Profile']];
  // The bar sits in normal layout flow and pads for the Android gesture/navigation bar, so it is never covered.
  return <View style={[styles.tabs, { backgroundColor: colors.tab, borderColor: colors.border, height: 62 + insets.bottom, paddingBottom: insets.bottom }]}>{items.map(([screen, icon, label]) => {
    const selected = label === 'Services' ? active === 'browse' && kind === 'service' : label === 'Categories' ? active === 'browse' && kind !== 'service' : active === screen;
    const service = label === 'Services';
    return <Pressable key={label} onPress={() => { tap(); tab(screen, service ? { kind: 'service' } : screen === 'browse' ? {} : undefined); }} style={styles.tab} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }}>
      <View style={[service && styles.tabCenterIcon, service && { backgroundColor: colors.gold, borderColor: colors.surface }]}><Icon name={icon} solid={selected && !service} size={service ? 23 : 21} color={service ? '#fff' : selected ? colors.primary : colors.muted}/>{screen === 'cart' && count > 0 ? <View style={[styles.tabBadge, { backgroundColor: colors.gold }]}><Text style={styles.tabBadgeText}>{count}</Text></View> : null}</View><Text style={[styles.tabText, { color: selected ? colors.primary : colors.muted }]}>{label}</Text>
    </Pressable>;
  })}</View>;
}

