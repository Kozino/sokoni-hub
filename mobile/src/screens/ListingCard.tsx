
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
import { WebOnlyAccount } from './WebOnlyAccount';export function ListingCard({ listing, onPress, compact = false, fluid = false }: { listing: Listing; onPress: () => void; compact?: boolean; fluid?: boolean }) {
  const { colors } = useTheme(); const image = listing.images?.[0]; const fav = useFavourites(); const saved = fav.has(listing.id); const { add } = useCart(); const toast = useToast();
  const isService = listing.kind === 'service';
  const addToCart = () => {
    if (listing.quantity !== null && listing.quantity <= 0) return toast.show('This item is out of stock');
    add({ listing_id: listing.id, vendor_id: listing.vendor_id, vendor_name: listing.business_name || 'Local seller', title: listing.title, price: Number(listing.price), currency: listing.currency, image: listing.images?.[0], qty: 1, max: listing.quantity ?? undefined, kind: listing.kind });
    success(); toast.show('Added to cart', true);
  };
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={listing.title} style={[styles.listingCard, compact && styles.listingCardCompact, fluid && { width: '48.5%' }, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={styles.listingVisual}><ListingImage uri={image} style={[styles.listingImage, compact && styles.listingImageCompact]} icon={isService ? 'construct-outline' : 'basket-outline'}/><Pressable onPress={() => { tap(); fav.toggle(listing); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved' : 'Save for later'} style={[styles.favouriteButton,{backgroundColor:'rgba(255,255,255,.94)'}]}><Icon name={saved ? 'heart' : 'heart-outline'} size={17} color={saved ? '#D9304F' : colors.primary}/></Pressable>{isService ? <View style={[styles.itemRibbon,{backgroundColor:colors.primary}]}><Text style={styles.itemRibbonText}>HOME SERVICE</Text></View> : <View style={[styles.itemRibbon,{backgroundColor:colors.teal}]}><Text style={styles.itemRibbonText}>LOCAL PICK</Text></View>}</View>
    <View style={styles.listingInfo}>
      <Text numberOfLines={2} style={[styles.listingTitle, { color: colors.text }]}>{listing.title}</Text>
      <View style={nx.inline}><Icon name="storefront-outline" size={12} color={colors.text2}/><Text numberOfLines={1} style={[styles.listingVendor, { color: colors.text2, flex: 1 }]}>{listing.business_name || listing.vendor_city || 'Verified local seller'}</Text></View>
      <View style={styles.ratingLine}><Icon name="star" size={12} color={colors.gold}/><Text style={[styles.ratingText,{color:colors.text2}]}>{Number(listing.rating_avg || listing.vendor_rating_avg || 0).toFixed(1)} ({listing.rating_count || listing.vendor_rating_count || 0})</Text></View>
      <View style={nx.priceRow}>
        <Money value={listing.price} currency={listing.currency} strong/>
        {isService
          ? <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Book service" style={[nx.bookPill,{backgroundColor:colors.primary}]}><Icon name="calendar-outline" size={13} color="#fff"/><Text style={nx.bookPillText}>Book</Text></Pressable>
          : <Pressable onPress={addToCart} hitSlop={6} accessibilityRole="button" accessibilityLabel="Add to cart" style={[nx.cartCircle,{backgroundColor:colors.primary}]}><Icon name="cart-outline" size={17} color="#fff"/></Pressable>}
      </View>
    </View>
  </Pressable>;
}

