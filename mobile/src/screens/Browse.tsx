
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
import { WebOnlyAccount } from './WebOnlyAccount';export function Browse({ go, back, tab, initial }: any) {
  const { colors } = useTheme();
  // `initial` is the navigation entry's params object. Browse writes its filters back into it, so coming
  // back from a listing restores the search exactly as the buyer left it.
  const memo: Record<string, any> = initial || {};
  const [q, setQ] = useState<string>(memo.q || '');
  const [search, setSearch] = useState<string>((memo.q || '').trim());
  const [kind, setKind] = useState<string>(memo.kind || '');
  const [category, setCategory] = useState<string>(memo.category || '');
  const [sort, setSort] = useState<string>(memo.sort || 'newest');
  const [min, setMin] = useState<string>(memo.min || '');
  const [max, setMax] = useState<string>(memo.max || '');
  const { city, setCity, cities } = useCity();
  const [categories, setCategories] = useState<Category[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState(false);

const [booted, setBooted] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const latest = useRef(0);
  const PAGE = 20;

  useEffect(() => { Object.assign(memo, { q: search, kind, category, sort, min, max, city }); }, [memo, search, kind, category, sort, min, max, city]);
  useEffect(() => { if (initial?.focus) { const t = setTimeout(() => inputRef.current?.focus(), 350); return () => clearTimeout(t); } return undefined; }, [initial?.focus]);
  useEffect(() => { const t = setTimeout(() => setSearch(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    api.get<{ categories: Category[] }>('/meta/categories').then((r) => setCategories(r.categories)).catch(() => {});
  }, []);

  const fetchPage = useCallback(async (offset: number) => {
    const ticket = ++latest.current;
    const result = await api.get<{ listings: Listing[]; total: number }>(`/listings${query({ q: search, kind, category, city, sort, min, max, limit: PAGE, offset })}`);
    return ticket === latest.current ? result : null;     // ignore answers to an older search
  }, [search, kind, category, city, sort, min, max]);

  const reload = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true); else setLoading(true);
    setError('');
    try { const result = await fetchPage(0); if (result) { setListings(result.listings); setTotal(result.total); } }
    catch (e) { setError(message(e)); }
    finally { setLoading(false); setRefreshing(false); setBooted(true); }
  }, [fetchPage]);
  useEffect(() => { void reload(); }, [reload]);

  const loadMore = async () => {
    if (loadingMore || loading || listings.length >= total) return;
    setLoadingMore(true);
    try { const result = await fetchPage(listings.length); if (result) { setListings((old) => [...old, ...result.listings]); setTotal(result.total); } }
    catch { /* keep what is shown; pull to refresh retries */ }
    finally { setLoadingMore(false); }
  };

  const shownCategories = categories.filter((cat) => !kind || cat.kind === kind);
  const activeFilters = (sort !== 'newest' ? 1 : 0) + (min ? 1 : 0) + (max ? 1 : 0) + (city ? 1 : 0);
  const anyFilter = !!(search || kind || category || activeFilters);
  const clearAll = () => { setQ(''); setSearch(''); setKind(''); setCategory(''); setSort('newest'); setMin(''); setMax(''); setCity(''); };
  const chooseKind = (value: string) => { setKind(value); if (category && categories.find((cat) => cat.slug === category)?.kind !== value && value) setCategory(''); };
  const sortLabel = ({ newest: 'Newest', popular: 'Most popular', price_asc: 'Price: low to high', price_desc: 'Price: high to low' } as Record<string, string>)[sort];

  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.page}>
    <View style={ex.browseTop}>
      {back && initial?.fromHome ? <Pressable accessibilityRole="button" onPress={back} accessibilityLabel="Go back" style={ex.browseBack}><Icon name="arrow-back" size={22} color={colors.text} /></Pressable> : null}
      <View style={[ex.searchBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        <Icon name="search" size={19} color={colors.muted} />
        <TextInput ref={inputRef} accessibilityLabel="Search products, stores or services" value={q} onChangeText={setQ} placeholder="Search products, stores, services" placeholderTextColor={colors.muted} returnKeyType="search" autoCorrect={false} onSubmitEditing={() => setSearch(q.trim())} style={[ex.searchInput, { color: colors.text }]} />
        {q ? <Pressable accessibilityRole="button" onPress={() => { setQ(''); setSearch(''); }} accessibilityLabel="Clear search" hitSlop={8}><Icon name="close-circle" size={19} color={colors.muted} /></Pressable> : null}
      </View>
      <Pressable accessibilityRole="button" onPress={() => setSheet(true)} accessibilityLabel="Filters" style={[ex.filterButton, { backgroundColor: colors.primary }]}>
        <Icon name="options-outline" size={20} color="#fff" />
        {activeFilters ? <View style={[ex.filterBadge, { backgroundColor: colors.gold }]}><Text style={ex.filterBadgeText}>{activeFilters}</Text></View> : null}
      </Pressable>
    </View>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={ex.chipScroller} contentContainerStyle={ex.chipRail}>
      <Chip selected={!kind} onPress={() => chooseKind('')}>All</Chip>
      <Chip selected={kind === 'product'} onPress={() => chooseKind(kind === 'product' ? '' : 'product')}>Products</Chip>
      <Chip selected={kind === 'service'} onPress={() => chooseKind(kind === 'service' ? '' : 'service')}>Services</Chip>
      <View style={[ex.chipDivider, { backgroundColor: colors.border }]} />
      {shownCategories.map((cat) => <Chip key={cat.id} image={categoryImage(cat.slug)} selected={category === cat.slug} onPress={() => { if (category === cat.slug) setCategory(''); else { setCategory(cat.slug); setKind(cat.kind); } }}>{cat.name}</Chip>)}
    </ScrollView>

    <View style={ex.resultsLine}>
      <Text style={[ex.resultsText, { color: colors.text2 }]}>{loading && !listings.length ? 'Searching…' : `${total} result${total === 1 ? '' : 's'}${search ? ` for “${search}”` : ''}${city ? ` in ${city}` : ''}`}</Text>
      <Pressable accessibilityRole="button" onPress={() => setSheet(true)} hitSlop={8}><Text style={[ex.sortText, { color: colors.primary }]}>Sort: {sortLabel}</Text></Pressable>
    </View>

    {loading && !listings.length ? <View style={{ flex: 1, justifyContent: 'center' }}><Spinner label="Loading the local market…" /></View> :
      error && !listings.length ? <EmptyState icon="cloud-offline-outline" title="Could not load listings" text={error} action={<Button style={{ marginTop: 8 }} onPress={() => void reload()}>Try again</Button>} /> :
      <FlatList
        data={listings} numColumns={2} key="market-grid" keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerStyle={ex.gridContent} columnWrapperStyle={ex.gridRow}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload(true)} tintColor={colors.primary} />}
        onEndReached={() => void loadMore()} onEndReachedThreshold={0.4}
        renderItem={({ item }) => <ListingCard listing={item} compact fluid onPress={() => go('listing', { id: item.id })} />}
        ListFooterComponent={loadingMore ? <Spinner label="Loading more…" /> : <View style={{ height: 12 }} />}
        ListEmptyComponent={<EmptyState title="No matching listings" text={anyFilter ? 'Try a different search or remove some filters.' : 'Nothing is listed yet. Please check back soon.'} icon="search-outline" action={anyFilter ? <Button style={{ marginTop: 8 }} onPress={clearAll}>Clear search & filters</Button> : undefined} />}
      />}

    {booted ? <Tabs active="browse" tab={tab} kind={kind} /> : null}
    <Sheet visible={sheet} title="Filters" onClose={() => setSheet(false)}>
      <Text style={[styles.sheetLabel, { color: colors.text }]}>Sort by</Text>
      {[['newest', 'Newest first'], ['popular', 'Most popular'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low']].map(([value, label]) => <Pressable key={value} onPress={() => setSort(value)} accessibilityRole="radio" accessibilityState={{ checked: sort === value }} style={styles.radioRow}><Icon name={sort === value ? 'radio-button-on' : 'radio-button-off'} size={22} color={sort === value ? colors.primary : colors.muted} /><Text style={[styles.radioText, { color: colors.text }]}>{label}</Text></Pressable>)}
      <Divider />
      <Text style={[styles.sheetLabel, { color: colors.text }]}>Price (QAR)</Text>
      <View style={styles.priceFields}><View style={{ flex: 1 }}><Field label="Minimum" value={min} onChangeText={(v) => setMin(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0" /></View><View style={{ flex: 1 }}><Field label="Maximum" value={max} onChangeText={(v) => setMax(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="Any" /></View></View>
      {cities.length > 0 ? <><Text style={[styles.sheetLabel, { color: colors.text }]}>Seller city</Text><View style={ex.cityWrap}><Chip selected={!city} onPress={() => setCity('')}>All cities</Chip>{cities.map((name) => <Chip key={name} selected={city === name} onPress={() => setCity(city === name ? '' : name)}>{name}</Chip>)}</View></> : null}
      <View style={ex.sheetActions}>
        <Button variant="secondary" style={{ flex: 1 }} onPress={() => { setSort('newest'); setMin(''); setMax(''); setCity(''); }}>Reset</Button>
        <Button style={{ flex: 1 }} onPress={() => setSheet(false)}>{`Show ${total} result${total === 1 ? '' : 's'}`}</Button>
      </View>
    </Sheet>
  </KeyboardAvoidingView>;
}

