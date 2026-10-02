
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
import { WebOnlyAccount } from './WebOnlyAccount';export function Home({ go, tab }: any) {
  const { colors } = useTheme(); const { user } = useAuth(); const { count } = useCart(); const { city, setCity, cities } = useCity();
  const [categories, setCategories] = useState<Category[]>([]); const [products, setProducts] = useState<Listing[]>([]); const [services, setServices] = useState<Listing[]>([]); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const [text, setText] = useState(''); const [goods, setGoods] = useState('all');
  const promos = usePromotions();
  const load = useCallback(async () => { setError(''); try {
    const [c, p, s] = await Promise.all([
      api.get<{categories: Category[]}>('/meta/categories'),
      api.get<{listings: Listing[]}>(`/listings${query({ kind: 'product', limit: 8, city })}`),
      api.get<{listings: Listing[]}>(`/listings${query({ kind: 'service', limit: 8, city })}`),
    ]); setCategories(c.categories); setProducts(p.listings); setServices(s.listings);
  } catch (e) { setError(message(e)); } }, [city]);
  useEffect(() => { void load(); }, [load]);
  const cityOptions: DropdownOption[] = [{ value: '', label: 'All cities' }, ...cities.map((name) => ({ value: name, label: name }))];
  const goodsOptions: DropdownOption[] = [{ value: 'all', label: 'All goods' }, { value: 'kind:product', label: 'Products only' }, { value: 'kind:service', label: 'Services only' }, ...categories.map((c) => ({ value: `cat:${c.slug}`, label: c.name, image: categoryImage(c.slug) }))];
  const runSearch = () => {
    const params: Record<string, any> = { q: text.trim(), fromHome: true };
    if (goods === 'kind:product') params.kind = 'product';
    else if (goods === 'kind:service') params.kind = 'service';
    else if (goods.startsWith('cat:')) { const cat = categories.find((c) => c.slug === goods.slice(4)); if (cat) { params.category = cat.slug; params.kind = cat.kind; } }
    go('browse', params);
  };
  return <View style={styles.page}>
    <View style={[nx.fixedTop, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
      <BrandMark small/>
      <Dropdown value={city} options={cityOptions} onChange={setCity} style={nx.cityTrigger} menuWidth={220} renderTrigger={(label) => <><Icon name="location-outline" size={16} color={colors.primary}/><Text numberOfLines={1} style={[styles.marketLocationText, { color: colors.text }]}>{label}</Text><Icon name="chevron-down-outline" size={14} color={colors.muted}/></>}/>
      <View style={styles.marketTopIcons}><IconButton icon="notifications-outline" label="Notifications" onPress={() => go('notifications')}/><IconButton icon="bag-outline" label="Cart" badge={count} onPress={() => tab('cart')}/></View>
    </View>
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([load(), promos.reload()]); setRefreshing(false); }} tintColor={colors.primary} />} contentContainerStyle={styles.marketScroll} keyboardShouldPersistTaps="handled">
      <LinearGradient colors={[colors.primary, '#033B2A']} start={{x:0,y:0}} end={{x:1,y:1}} style={[styles.marketHero, { marginTop: 12 }]}>
        <Text style={styles.marketHeroTitle}>Shop your market,{`\n`}all in one place.</Text>
        <Text style={styles.marketHeroCopy}>Discover local products and book trusted services near you, with clear prices and direct seller contact.</Text>
        <View style={styles.marketSearchBox}><Icon name="search-outline" size={20} color={colors.muted}/><TextInput accessibilityLabel="Search products, stores or services" value={text} onChangeText={setText} onSubmitEditing={runSearch} returnKeyType="search" autoCorrect={false} placeholder="Search products, stores or services" placeholderTextColor={colors.muted} style={[nx.heroInput, { color: '#111827' }]}/>{text ? <Pressable accessibilityRole="button" onPress={() => setText('')} hitSlop={8} accessibilityLabel="Clear"><Icon name="close-circle" size={18} color={colors.muted}/></Pressable> : null}</View>
        <View style={styles.marketHeroFilters}>
          <Dropdown value={city} options={cityOptions} onChange={setCity} style={styles.marketFilter} menuWidth={220} renderTrigger={(label) => <><Icon name="location-outline" color={colors.primary} size={15}/><Text numberOfLines={1} style={[styles.marketFilterText,{color:colors.text, flexShrink:1}]}>{label}</Text><Icon name="chevron-down-outline" color={colors.muted} size={13}/></>}/>
          <Dropdown value={goods} options={goodsOptions} onChange={setGoods} style={styles.marketFilter} menuWidth={250} renderTrigger={(label) => <><Icon name="apps-outline" color={colors.primary} size={15}/><Text numberOfLines={1} style={[styles.marketFilterText,{color:colors.text, flexShrink:1}]}>{label}</Text><Icon name="chevron-down-outline" color={colors.muted} size={13}/></>}/>
        </View>
        <Pressable accessibilityRole="button" onPress={runSearch} accessibilityLabel="Search market" style={[styles.marketSearchButton,{backgroundColor:colors.gold}]}><Icon name="search-outline" size={17} color="#fff"/><Text style={styles.marketSearchButtonText}>Search market</Text></Pressable>
      </LinearGradient>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRail}>{['Rice & grains','Food','Beauty','Fashion','Home services'].map((label) => <Pressable accessibilityRole="button" key={label} onPress={() => go('browse',{q:label})} style={[styles.quickChip,{backgroundColor:colors.surface2}]}><Text style={[styles.quickChipText,{color:colors.text2}]}>{label}</Text></Pressable>)}</ScrollView>
      <View style={styles.trustGrid}><TrustTile icon="shield-checkmark-outline" title="Verified sellers" subtitle="Local vetting"/><TrustTile icon="cash-outline" title="Pay on delivery" subtitle="Cash or transfer"/><TrustTile icon="logo-whatsapp" title="WhatsApp contact" subtitle="Direct support"/><TrustTile icon="pricetag-outline" title="Clear pricing" subtitle="No listing fee"/></View>
      {error ? <View style={{marginHorizontal:14}}><Notice type="warning">{error}</Notice></View> : null}
      <VipStores stores={promos.vip} onOpen={(slug) => go('store',{slug})}/>
      <SectionTitle title="Explore market stalls" action="View all" onPress={() => go('browse')}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stallRail}>{categories.map((category) => <Pressable key={category.id} onPress={() => go('browse',{category:category.slug,kind:category.kind})} style={[nx.stall,{backgroundColor:colors.surface,borderColor:colors.border}]} accessibilityRole="button" accessibilityLabel={category.name}><Image contentFit="cover" source={categoryImage(category.slug)} style={nx.stallImage}/><Text numberOfLines={2} style={[nx.stallTitle,{color:colors.text}]}>{category.name}</Text></Pressable>)}</ScrollView>
      <FeaturedStores stores={promos.featured} onOpen={(slug) => go('store',{slug})}/>
      <SectionTitle title="Trending near you" action="See all" onPress={() => go('browse')} tight/>
      <Text style={[styles.sectionCaption,{color:colors.text2}]}>{city ? `Order products or book trusted services in ${city}.` : 'Order products or book trusted services across Qatar.'}</Text>
      <View style={styles.marketGrid}>{products.slice(0,4).map((listing) => <ListingCard key={listing.id} listing={listing} onPress={() => go('listing',{id:listing.id})} compact fluid/>)}</View>
      {services.length ? <><SectionTitle title="Popular services" action="View all" onPress={() => go('browse',{kind:'service'})}/><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.listingRail,{paddingLeft:14}]}>{services.map((listing) => <ListingCard key={listing.id} listing={listing} onPress={() => go('listing',{id:listing.id})} compact/>)}</ScrollView></> : null}
      <LinearGradient colors={[colors.primary,'#126D4B',colors.gold]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.sellBanner}><View style={{flex:1}}><Text style={styles.sellBannerEyebrow}>LOCAL SERVICES & PRODUCTS</Text><Text style={styles.sellBannerTitle}>Find your neighbourhood favourites.</Text><Text style={styles.sellBannerCopy}>Browse freely, then create a buyer account to order and track.</Text></View><Pressable accessibilityRole="button" onPress={() => user ? go('account') : go('register')} style={styles.sellBannerAction}><Text style={[styles.sellBannerActionText,{color:colors.primary}]}>{user ? 'My account' : 'Join now'}</Text><Icon name="arrow-forward" size={15} color={colors.primary}/></Pressable></LinearGradient>
      <View style={{height:24}}/>
    </ScrollView><Tabs active="home" tab={tab}/>
  </View>;
}
