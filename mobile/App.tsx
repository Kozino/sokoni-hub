import { styles, nx, ex } from './src/styles';
import { Screen, Nav } from './src/screens/types';
import { Welcome } from './src/screens/Welcome';
import { Icon, type IconName } from './src/icons';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Image } from 'expo-image';
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts } from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { success, tap } from './src/haptics';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, FlatList, ImageBackground, KeyboardAvoidingView, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError, query } from './src/api';
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP, WEB_URL } from './src/config';
import { AuthProvider, CartProvider, ThemeProvider, useAuth, useCart, useTheme } from './src/providers';
import type { Booking, CartItem, Category, Listing, Order, Review, Vendor } from './src/types';
import { BrandMark, Button, Card, Chip, Divider, Dropdown, EmptyState, Field, FontContext, Header, IconButton, Money, Notice, Sheet, Spinner, Text, TextInput, type DropdownOption, type FontStatus } from './src/ui';
import { CityProvider, useCity } from './src/city';
import { categoryImage } from './src/catImages';
import { BottomBar } from './src/ui';
import { BookService } from './src/booking';
import { Checkout } from './src/checkout';
import { FavouritesProvider, useFavourites } from './src/favourites';
import { FeaturedStores, usePromotions, VipStores } from './src/promotions';
import { LegalScreen } from './src/legal';

const WELCOME_KEY = 'sokoni_mobile_welcome_complete';


const message = (error: unknown) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'To be arranged';
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'To be arranged';
const statusLabel = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const ToastContext = createContext<{ show: (text: string, cartLink?: boolean) => void }>({ show: () => {} });
const useToast = () => useContext(ToastContext);

const queryClient = new QueryClient();
function ErrorFallback({ error }: any) { return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: 'red' }}>{error.message}</Text></View>; }

export default function App() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  const fonts: FontStatus = loaded ? 'ready' : error ? 'failed' : 'loading';
  return <FontContext.Provider value={fonts}><SafeAreaProvider><ThemeProvider><AuthProvider><CartProvider><FavouritesProvider><CityProvider><Marketplace /></CityProvider></FavouritesProvider></CartProvider></AuthProvider></ThemeProvider></SafeAreaProvider></FontContext.Provider>;
}

function Marketplace() {
  const { colors, theme } = useTheme();
  const auth = useAuth();
  const fonts = useContext(FontContext);
  const [welcomeLoaded, setWelcomeLoaded] = useState(false);
  const [seenWelcome, setSeenWelcome] = useState(false);
  const [nav, setNav] = useState<Nav>({ screen: 'home', params: {}, id: 0 });
  const counter = useRef(0);
  const history = useRef<Nav[]>([]);
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ text: string; cart: boolean; id: number } | null>(null);
  const showToast = useCallback((text: string, cart = false) => setToast({ text, cart, id: ++counter.current }), []);
  const toastApi = useMemo(() => ({ show: showToast }), [showToast]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { AsyncStorage.getItem(WELCOME_KEY).then((value) => { setSeenWelcome(value === 'yes'); setWelcomeLoaded(true); }).catch(() => setWelcomeLoaded(true)); }, []);

// Hide the native splash once saved state and sign-in status are known; the timer is a safety net so it can never get stuck.

useEffect(() => { if (welcomeLoaded && !auth.loading && fonts !== 'loading') void SplashScreen.hideAsync().catch(() => {}); }, [welcomeLoaded, auth.loading, fonts]);

useEffect(() => { const t = setTimeout(() => { void SplashScreen.hideAsync().catch(() => {}); }, 8000); return () => clearTimeout(t); }, []);
  const go = useCallback((screen: Screen, params?: Record<string, any>) => { history.current.push(nav); setNav({ screen, params: params ?? {}, id: ++counter.current }); }, [nav]);
  const back = useCallback(() => { const previous = history.current.pop(); setNav(previous || { screen: 'home', params: {}, id: ++counter.current }); }, []);
  const finishWelcome = useCallback(async (destination: Screen = 'home') => { await AsyncStorage.setItem(WELCOME_KEY, 'yes'); setSeenWelcome(true); history.current = []; setNav({ screen: destination, params: {}, id: ++counter.current }); }, []);
  const tab = (screen: Screen, params?: Record<string, any>) => { history.current = []; setNav({ screen, params: params ?? {}, id: ++counter.current }); };
  // Android hardware/gesture back: step back through screens, return to Explore, and only then leave the app.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!seenWelcome) return false;
      if (history.current.length) { back(); return true; }
      if (nav.screen !== 'home') { history.current = []; setNav({ screen: 'home', params: {}, id: ++counter.current }); return true; }
      Alert.alert('Exit Sokoni Hub?', 'Are you sure you want to close the app?', [{ text: 'Stay', style: 'cancel' }, { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() }]);
      return true;
    });
    return () => subscription.remove();
  }, [back, nav.screen, seenWelcome]);

  if (!welcomeLoaded || auth.loading) return <SafeAreaView edges={['top']} style={[styles.app, { backgroundColor: colors.bg }]}><Spinner label="Preparing Sokoni Hub…" /></SafeAreaView>;
  const current = !seenWelcome ? 'welcome' : nav.screen;
  // After sign-in/registration, return to the screen the buyer came from (checkout, booking, listing...).
  const done = () => {
    const authScreens: Screen[] = ['login', 'register', 'pin', 'pinsetup', 'forgot'];
    let target: Nav | undefined;
    while (history.current.length) { const previous = history.current.pop()!; if (!authScreens.includes(previous.screen)) { target = previous; break; } }
    setNav(target ? { ...target } : { screen: 'account', params: {}, id: ++counter.current });
  };
  const common = { go, back, tab, done };
  let body: React.ReactNode;
  if (current === 'welcome') body = <Welcome onDone={finishWelcome} />;
  else if (auth.user && auth.user.role !== 'buyer') body = <WebOnlyAccount onSignOut={auth.logout} />;
  else if (current === 'home') body = <Home {...common} />;
  else if (current === 'browse') body = <Browse {...common} initial={nav.params} />;
  else if (current === 'cart') body = <Cart {...common} />;
  else if (current === 'account') body = <Account {...common} />;
  else if (current === 'login') body = <Login {...common} />;
  else if (current === 'register') body = <Register {...common} />;
  else if (current === 'pin') body = <Pin {...common} setup={false} />;
  else if (current === 'pinsetup') body = <Pin {...common} setup />;
  else if (current === 'forgot') body = <Recovery {...common} params={nav.params} />;
  else if (current === 'listing') body = <ListingDetail {...common} id={nav.params?.id} />;
  else if (current === 'store') body = <StoreDetail {...common} slug={nav.params?.slug} />;
  else if (current === 'checkout') body = <Checkout {...common} />;
  else if (current === 'orders') body = <Orders {...common} />;
  else if (current === 'bookings') body = <Bookings {...common} />;
  else if (current === 'track') body = <Track {...common} params={nav.params} />;
  else if (current === 'booking') body = <BookService {...common} listing={nav.params?.listing} />;
  else if (current === 'saved') body = <Saved {...common} />;
  else if (current === 'notifications') body = <Notifications {...common} />;

else if (current === 'legal') body = <LegalScreen {...common} path={nav.params?.path} title={nav.params?.title} />;
  else body = <Support {...common} />;
  // The status bar is translucent on Android (edge-to-edge): pad the top so headers, back arrows and icons stay visible.
  return <ErrorBoundary FallbackComponent={ErrorFallback}><QueryClientProvider client={queryClient}><ToastContext.Provider value={toastApi}><SafeAreaView edges={current === 'welcome' ? [] : ['top']} style={[styles.app, { backgroundColor: colors.bg }]}><StatusBar style={current === 'welcome' || theme === 'dark' ? 'light' : 'dark'} /><View key={nav.id} style={styles.app}>{body}</View>
    {toast && current !== 'welcome' ? <View pointerEvents="box-none" style={[nx.toastWrap, { bottom: 62 + insets.bottom + 10 }]}><View style={nx.toast}><Icon name="checkmark-circle" size={18} color="#7CE0BB" /><Text style={nx.toastText}>{toast.text}</Text>{toast.cart ? <Pressable accessibilityRole="button" onPress={() => { setToast(null); tab('cart'); }} hitSlop={8}><Text style={nx.toastLink}>View cart</Text></Pressable> : null}</View></View> : null}
  </SafeAreaView></ToastContext.Provider></QueryClientProvider></ErrorBoundary>;
}



function Tabs({ active, tab, kind }: { active: Screen; tab: (screen: Screen, params?: Record<string, any>) => void; kind?: string }) {
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

function Home({ go, tab }: any) {
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stallRail}>{categories.map((category) => <Pressable key={category.id} onPress={() => go('browse',{category:category.slug,kind:category.kind})} style={[nx.stall,{backgroundColor:colors.surface,borderColor:colors.border}]} accessibilityRole="button" accessibilityLabel={category.name}><Image source={categoryImage(category.slug)} style={nx.stallImage}/><Text numberOfLines={2} style={[nx.stallTitle,{color:colors.text}]}>{category.name}</Text></Pressable>)}</ScrollView>
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
function TrustTile({ icon, title, subtitle }: { icon: IconName; title: string; subtitle: string }) { const {colors}=useTheme(); return <View style={[styles.trustTile,{backgroundColor:colors.surface}]}><View style={[styles.trustIcon,{backgroundColor:colors.primarySoft}]}><Icon name={icon} size={18} color={colors.primary}/></View><View style={{flex:1}}><Text numberOfLines={1} style={[styles.trustTitle,{color:colors.text}]}>{title}</Text><Text numberOfLines={1} style={[styles.trustSub,{color:colors.text2}]}>{subtitle}</Text></View></View>; }

function SectionTitle({ title, action, onPress, tight = false }: { title: string; action?: string; onPress?: () => void; tight?: boolean }) { const { colors } = useTheme(); return <View style={[styles.sectionTitle, tight && { marginBottom: 4 }]}><Text style={[styles.sectionHeading, { color: colors.text }]}>{title}</Text>{action && <Pressable accessibilityRole="button" onPress={onPress}><Text style={[styles.seeAll, { color: colors.primary }]}>{action}</Text></Pressable>}</View>; }
function ListingRail({ title, listings, onSelect, onMore }: { title: string; listings: Listing[]; onSelect: (id: string) => void; onMore: () => void }) { const { colors } = useTheme(); return <><SectionTitle title={title} action="See all" onPress={onMore}/>{listings.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.listingRail}>{listings.map((listing) => <ListingCard key={listing.id} listing={listing} onPress={() => onSelect(listing.id)} compact/>)}</ScrollView> : <View style={[styles.railEmpty, { backgroundColor: colors.surface2 }]}><Text style={{ color: colors.text2 }}>Nothing to show here yet.</Text></View>}</>; }
function ListingImage({ uri, style, icon, size = 30 }: { uri?: string; style: any; icon: IconName; size?: number }) {
  const { colors } = useTheme(); const [loaded, setLoaded] = useState(false); const [failed, setFailed] = useState(false);
  const { resizeMode, ...box } = (StyleSheet.flatten(style) || {}) as any;
  // The tinted icon tile is what people see while the photo downloads (or if it cannot load).
  return <View style={[box, { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }]}>{!loaded ? <Icon name={icon} size={size} color={colors.primary}/> : null}{uri && !failed ? <Image source={{ uri }} resizeMode="cover" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} style={StyleSheet.absoluteFill}/> : null}</View>;
}

function ListingCard({ listing, onPress, compact = false, fluid = false }: { listing: Listing; onPress: () => void; compact?: boolean; fluid?: boolean }) {
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

function Browse({ go, back, tab, initial }: any) {
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

  return <View style={styles.page}>
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
  </View>;
}

function Saved({ go, back, tab }: any) {
  const { colors } = useTheme(); const fav = useFavourites();
  return <View style={styles.page}>
    <Header title="Saved items" back={back} />
    <FlatList data={fav.items} numColumns={2} key="saved-grid" keyExtractor={(item) => item.id} contentContainerStyle={ex.gridContent} columnWrapperStyle={ex.gridRow}
      renderItem={({ item }) => <ListingCard listing={item} compact fluid onPress={() => go('listing', { id: item.id })} />}
      ListEmptyComponent={<EmptyState icon="heart-outline" title="Nothing saved yet" text="Tap the heart on any product or service to keep it here for later." action={<Button style={{ marginTop: 10 }} onPress={() => tab('browse')}>Explore the market</Button>} />} />
    <Tabs active="account" tab={tab} />
  </View>;
}

function Notifications({ go, back }: any) {
  const { colors } = useTheme(); const { user } = useAuth();
  type Note = { id: string; icon: IconName; title: string; text: string; at: string; onPress: () => void };
  const [notes, setNotes] = useState<Note[]>([]); const [loading, setLoading] = useState(!!user); const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) return; setLoading(true); setError('');
    try {
      const [orders, bookings] = await Promise.all([api.get<{ orders: Order[] }>('/orders/mine'), api.get<{ bookings: Booking[] }>('/bookings/mine')]);
      const list: Note[] = [
        ...orders.orders.map((o): Note => ({ id: `o-${o.id}`, icon: 'receipt-outline', title: `Order ${o.code}`, text: `${statusLabel(o.status)} · ${o.business_name || o.vendor?.business_name || 'Seller'}`, at: o.created_at, onPress: () => go('track', { code: o.code, phone: user.phone }) })),
        ...bookings.bookings.map((b): Note => ({ id: `b-${b.id}`, icon: 'calendar-outline', title: b.listing_title || `Booking ${b.code}`, text: `${statusLabel(b.status)} · ${dateTime(b.slot_starts_at || b.scheduled_at || b.preferred_at)}`, at: b.created_at, onPress: () => go('track', { bookingCode: b.code, phone: user.phone }) })),
      ].sort((a, b) => +new Date(b.at) - +new Date(a.at));
      setNotes(list);
    } catch (e) { setError(message(e)); } finally { setLoading(false); }
  }, [user, go]);
  useEffect(() => { void load(); }, [load]);
  if (!user) return <GuestGate heading="Notifications" title="Sign in for updates" text="Order and booking updates appear here once you have a buyer account." go={go} back={back} />;
  return <View style={styles.page}>
    <Header title="Notifications" back={back} />
    {loading ? <Spinner label="Checking for updates…" /> : error ? <EmptyState icon="cloud-offline-outline" title="Could not load updates" text={error} action={<Button style={{ marginTop: 8 }} onPress={() => void load()}>Try again</Button>} /> :
      <FlatList data={notes} keyExtractor={(n) => n.id} contentContainerStyle={styles.ordersList} refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} tintColor={colors.primary} />}
        renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={item.onPress}><Card style={ex.noteCard}><View style={[ex.noteIcon, { backgroundColor: colors.primarySoft }]}><Icon name={item.icon} size={20} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[ex.noteTitle, { color: colors.text }]}>{item.title}</Text><Text style={[ex.noteText, { color: colors.text2 }]}>{item.text}</Text></View><Text style={[ex.noteAgo, { color: colors.muted }]}>{date(item.at)}</Text></Card></Pressable>}
        ListEmptyComponent={<EmptyState icon="notifications-outline" title="You're all caught up" text="When you order or book, every status change will show up here." />} />}
  </View>;
}



function AuthScaffold({ title, subtitle, children, back }: { title: string; subtitle: string; children: React.ReactNode; back: () => void }) { const { colors } = useTheme(); return <KeyboardAvoidingView behavior="padding" style={styles.authPage}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.authScroll}><Pressable accessibilityRole="button" onPress={back} accessibilityLabel="Go back" style={styles.authBack}><Icon name="arrow-back" size={24} color={colors.text}/></Pressable><BrandMark/><Text style={[styles.authTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.authSubtitle, { color: colors.text2 }]}>{subtitle}</Text>{children}</ScrollView></KeyboardAvoidingView>; }
function Login({ go, back, done }: any) {
  const { colors } = useTheme(); const auth = useAuth(); const [identifier, setIdentifier] = useState(''); const [password, setPassword] = useState(''); const [phoneMode, setPhoneMode] = useState(true); const [busy, setBusy] = useState(false);
  const submit = async () => { if (!identifier.trim() || !password) return Alert.alert('Enter your details', `Enter your ${phoneMode ? 'phone number' : 'email address'} and password.`); let value = identifier.trim(); if (phoneMode) { let digits = value.replace(/\D/g, ''); if (digits.startsWith('00')) digits = digits.slice(2); if (digits.length === 8) digits = `974${digits}`; value = digits; } setBusy(true); try { const stage = await auth.login(value, password); if (stage.kind === 'pin') go('pin'); else if (stage.kind === 'setup') go('pinsetup'); else if (stage.kind === 'mfa') Alert.alert('Web-only account', 'Administrators use the secure web portal.'); else done(); } catch (e) { Alert.alert('Sign-in failed', message(e)); } finally { setBusy(false); } };
  return <KeyboardAvoidingView behavior="padding" style={styles.authPage}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.referenceAuthScroll}>
    <View style={styles.referenceTopbar}><Pressable accessibilityRole="button" onPress={back} accessibilityLabel="Go back" style={styles.referenceBack}><Icon name="arrow-back" size={25} color={colors.text}/></Pressable><BrandMark small/><View style={[styles.currencyBadge,{backgroundColor:colors.surface2}]}><Text style={[styles.currencyBadgeText,{color:colors.text}]}>QATAR{`\n`}(QAR)</Text></View></View>
    <View style={styles.referenceBrandBlock}><View style={[styles.referenceLogoCircle,{backgroundColor:colors.primarySoft}]}><Image contentFit="cover" transition={200} source={require('./assets/logo.png')} style={styles.referenceLogo}/><View style={[styles.globeDot,{backgroundColor:colors.primary}]}><Icon name="globe-outline" size={15} color="#fff"/></View></View><Text style={[styles.referenceWelcome,{color:colors.text}]}>Welcome Back!</Text><Text style={[styles.referenceLanguage,{color:colors.primary}]}>Karibu tena • Kaabo • Nno</Text><Text style={[styles.referenceIntro,{color:colors.text2}]}>Your trusted African community hub & artisan marketplace across Qatar</Text></View>
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

function Register({ go, back, done }: any) { const { colors } = useTheme(); const auth = useAuth(); const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '', pin: '', confirm: '' }); const [busy, setBusy] = useState(false); const set = (key: keyof typeof form) => (value: string) => setForm((old) => ({ ...old, [key]: value })); const submit = async () => { if (!form.full_name || !form.phone || !form.email || !form.password || !form.pin) return Alert.alert('Complete the form', 'Every field is required for a secure buyer account.'); if (form.password.length < 12) return Alert.alert('Choose a longer password', 'Use at least 12 characters.'); if (form.pin !== form.confirm) return Alert.alert('PINs do not match', 'Please enter the same four-digit PIN twice.'); setBusy(true); try { const stage = await auth.register(form); if (stage.kind === 'pin') go('pin'); else if (stage.kind === 'setup') go('pinsetup'); else done(); } catch (e) { Alert.alert('Could not create account', message(e)); } finally { setBusy(false); } }; return <AuthScaffold title="Create your account" subtitle="A buyer account lets you order, book and track securely." back={back}><Field label="Full name" value={form.full_name} onChangeText={set('full_name')} autoComplete="name" placeholder="Your name"/><Field label="Phone number" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="+974…"/><Field label="Email address" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com"/><Field label="Password" value={form.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" placeholder="At least 12 characters"/><Field label="Choose a 4-digit PIN" value={form.pin} onChangeText={set('pin')} secureTextEntry keyboardType="number-pad" maxLength={4} placeholder="••••"/><Field label="Confirm your PIN" value={form.confirm} onChangeText={set('confirm')} secureTextEntry keyboardType="number-pad" maxLength={4} placeholder="••••"/><Notice>Keep your PIN private. Avoid simple sequences or digits from your phone number.</Notice><Button loading={busy} onPress={submit} style={{ marginTop: 8 }}>Create secure account</Button><Text style={[styles.terms, { color: colors.text2 }]}>By continuing, you agree to Sokoni Hub's <Text accessibilityRole="link" onPress={() => go('legal')} style={{ color: colors.primary, fontWeight: '800' }}>terms and privacy policy</Text>.</Text><Text style={[styles.authSwitch, { color: colors.text2 }]}>Already registered? <Text accessibilityRole="link" onPress={() => go('login')} style={{ color: colors.primary, fontWeight: '800' }}>Sign in</Text></Text></AuthScaffold>; }
function Pin({ go, back, done, setup }: any) {
  const { colors } = useTheme(); const auth = useAuth(); const [pin, setPin] = useState(''); const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (overridePin?: string) => { const p = overridePin || pin; if (p.length !== 4) return Alert.alert('Enter your PIN', 'Your PIN must contain exactly four digits.'); setBusy(true); try { if (setup) { await auth.setupPin(p, email || undefined); await SecureStore.setItemAsync('sokoni_pin', p); } else { await auth.verifyPin(p); await SecureStore.setItemAsync('sokoni_pin', p); } done(); } catch(e) { Alert.alert(setup?'Could not save PIN':'PIN not accepted',message(e)); setPin(''); } finally {setBusy(false);} };
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

function Recovery({ go, back, params }: any) { const { colors } = useTheme(); const initial = params?.purpose === 'pin' ? 'pin' : 'password'; const [purpose, setPurpose] = useState<'password' | 'pin'>(initial); const [email, setEmail] = useState(''); const [code, setCode] = useState(''); const [secret, setSecret] = useState(''); const [confirm, setConfirm] = useState(''); const [requested, setRequested] = useState(false); const [busy, setBusy] = useState(false); const request = async () => { if (!email) return Alert.alert('Enter your email', 'Use the email registered on your buyer account.'); setBusy(true); try { await api.post('/auth/recovery/request', { email, purpose }); setRequested(true); Alert.alert('Check your inbox', 'If that address can receive recovery email, a one-time code will arrive shortly.'); } catch (e) { Alert.alert('Could not start recovery', message(e)); } finally { setBusy(false); } }; const reset = async () => { if (code.length !== 6 || !secret) return Alert.alert('Complete the form', 'Enter the six-digit email code and your new credential.'); if (secret !== confirm) return Alert.alert('Does not match', 'Please enter the same new value twice.'); if (purpose === 'password' && secret.length < 12) return Alert.alert('Choose a longer password', 'Use at least 12 characters.'); if (purpose === 'pin' && !/^\d{4}$/.test(secret)) return Alert.alert('PIN required', 'Use exactly four digits.'); setBusy(true); try { await api.post('/auth/recovery/complete', purpose === 'password' ? { email, purpose, code, new_password: secret } : { email, purpose, code, new_pin: secret }); Alert.alert('Updated securely', `Your ${purpose === 'password' ? 'password' : 'PIN'} has been reset. Sign in again.`); go('login'); } catch (e) { Alert.alert('Could not reset', message(e)); } finally { setBusy(false); } }; return <AuthScaffold title={`Recover ${purpose === 'password' ? 'password' : 'PIN'}`} subtitle="Recovery emails work as soon as Sokoni Hub email delivery is enabled. We never reveal whether an account exists." back={back}><View style={styles.recoveryTabs}><Chip selected={purpose === 'password'} onPress={() => { setPurpose('password'); setRequested(false); }}>Password</Chip><Chip selected={purpose === 'pin'} onPress={() => { setPurpose('pin'); setRequested(false); }}>PIN</Chip></View><Field label="Your account email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" editable={!requested}/>{!requested ? <Button loading={busy} onPress={request}>Email me a recovery code</Button> : <><Notice type="success">A short-lived one-time code was requested. It is valid for 15 minutes.</Notice><Field label="6-digit recovery code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="••••••"/><Field label={purpose === 'password' ? 'New password' : 'New 4-digit PIN'} value={secret} onChangeText={setSecret} secureTextEntry keyboardType={purpose === 'pin' ? 'number-pad' : 'default'} maxLength={purpose === 'pin' ? 4 : undefined} placeholder={purpose === 'password' ? 'At least 12 characters' : '••••'}/><Field label="Confirm new value" value={confirm} onChangeText={setConfirm} secureTextEntry keyboardType={purpose === 'pin' ? 'number-pad' : 'default'} maxLength={purpose === 'pin' ? 4 : undefined} placeholder="Repeat it"/><Button loading={busy} onPress={reset}>Reset securely</Button><Pressable accessibilityRole="button" onPress={() => { setRequested(false); setCode(''); }}><Text style={[styles.forgot, { color: colors.primary }]}>Request a new code</Text></Pressable></>}</AuthScaffold>; }

function ListingDetail({ id, go, back }: any) {
  const { colors }=useTheme();const {user}=useAuth();const {add}=useCart();const fav=useFavourites();const [data,setData]=useState<{listing:Listing;related:Listing[];vendorItems:Listing[]}|null>(null);const [reviews,setReviews]=useState<Review[]>([]);const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [error,setError]=useState('');const [reviewOpen,setReviewOpen]=useState(false);const [review,setReview]=useState({rating:'5',title:'',comment:''});
  const load=useCallback(async(pull=false)=>{if(pull)setRefreshing(true);else setLoading(true);setError('');try{const detail=await api.get<{listing:Listing;related:Listing[];vendorItems:Listing[]}>(`/listings/${id}`);setData(detail);const result=await api.get<{reviews:Review[]}>(`/reviews${query({listing_id:id,limit:5})}`);setReviews(result.reviews);}catch(e){if(pull)Alert.alert('Could not refresh',message(e));else setError(message(e));}finally{setLoading(false);setRefreshing(false);}},[id]);useEffect(()=>{void load();},[load]);if(error&&!data)return <View style={styles.page}><Header title="Product details" back={back}/><EmptyState icon="cloud-offline-outline" title="Listing unavailable" text={error} action={<Button style={{marginTop:8}} onPress={()=>void load()}>Try again</Button>}/></View>;if(loading||!data)return <View style={styles.page}><Header title="Product details" back={back}/><Spinner label="Loading listing…"/></View>;const listing=data.listing;
  const addItem=()=>{if(listing.quantity!==null&&listing.quantity<=0)return Alert.alert('Out of stock','This item is currently unavailable.');add({listing_id:listing.id,vendor_id:listing.vendor_id,vendor_name:listing.business_name||'Local seller',title:listing.title,price:Number(listing.price),currency:listing.currency,image:listing.images?.[0],qty:1,max:listing.quantity??undefined,kind:listing.kind});success();Alert.alert('Added to cart',`${listing.title} is ready for checkout.`,[{text:'Keep shopping'},{text:'View cart',onPress:()=>go('cart')}]);};const submitReview=async()=>{try{await api.post('/reviews',{listing_id:id,rating:Number(review.rating),title:review.title||undefined,comment:review.comment||undefined});setReviewOpen(false);setReview({rating:'5',title:'',comment:''});await load();Alert.alert('Thank you','Your review is now published.');}catch(e){Alert.alert('Cannot post review',message(e));}};
  return <View style={styles.page}><View style={styles.detailTopbar}><Pressable accessibilityRole="button" onPress={back} accessibilityLabel="Go back" style={[styles.detailCircle,{backgroundColor:colors.surface}]}><Icon name="arrow-back" size={22} color={colors.text}/></Pressable><View style={{flex:1}}/><Pressable accessibilityRole="button" onPress={()=>go('cart')} accessibilityLabel="Open cart" style={[styles.detailCircle,{backgroundColor:colors.surface}]}><Icon name="bag-handle-outline" size={20} color={colors.primary}/></Pressable><Pressable onPress={()=>{tap();fav.toggle(listing);}} accessibilityRole="button" accessibilityLabel={fav.has(listing.id)?'Remove from saved':'Save for later'} style={[styles.detailCircle,{backgroundColor:colors.surface}]}><Icon name={fav.has(listing.id)?'heart':'heart-outline'} size={20} color={fav.has(listing.id)?'#D9304F':colors.primary}/></Pressable></View><ScrollView contentContainerStyle={styles.referenceDetailScroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.primary}/>}>{listing.images?.length?<ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>{listing.images.map((url)=><ListingImage key={url} uri={url} style={styles.referenceDetailImage} icon={listing.kind==='service'?'construct-outline':'basket-outline'} size={68}/>)}</ScrollView>:<View style={[styles.referenceDetailImage,{backgroundColor:colors.primarySoft}]}><Icon name={listing.kind==='service'?'construct-outline':'basket-outline'} size={68} color={colors.primary}/></View>}<View style={styles.detailReferenceBody}><View style={styles.detailTagRow}><Text style={[styles.detailReferenceTag,{backgroundColor:listing.kind==='service'?colors.tealSoft:colors.primarySoft,color:listing.kind==='service'?colors.teal:colors.primary}]}>{listing.kind==='service'?'LOCAL SERVICE':'FRESH LOCAL PICK'}</Text>{listing.quantity!==null&&<View style={nx.inline}><Icon name={listing.quantity>0?'checkmark-circle':'close-circle'} size={14} color={listing.quantity>0?colors.primary:colors.danger}/><Text style={[styles.detailStock,{color:listing.quantity>0?colors.primary:colors.danger}]}>{listing.quantity>0?'In stock':'Out of stock'}</Text></View>}</View><Text style={[styles.referenceDetailTitle,{color:colors.text}]}>{listing.title}</Text><View style={styles.detailPriceLine}><Money value={listing.price} currency={listing.currency} strong/>{listing.unit&&<Text style={[styles.detailUnit,{color:colors.text2}]}>per {listing.unit}</Text>}</View><View style={[styles.sellerDetailCard,{backgroundColor:colors.surface2}]}><Pressable accessibilityRole="button" onPress={()=>go('store',{slug:listing.vendor_slug})} accessibilityLabel={`Visit ${listing.business_name} store`} style={styles.sellerDetailRow}><View style={[styles.sellerAvatar,{backgroundColor:colors.surface}]}>{listing.vendor_logo?<Image source={{uri:listing.vendor_logo}} style={styles.vendorLogo}/>:<Icon name="storefront-outline" size={24} color={colors.primary}/>}</View><View style={{flex:1}}><Text style={[styles.sellerDetailName,{color:colors.text}]}>{listing.business_name}</Text><View style={[nx.inline,{marginTop:3}]}><Icon name="location-outline" size={12} color={colors.text2}/><Text style={[styles.sellerDetailMeta,{color:colors.text2,marginTop:0}]}>{listing.vendor_city||'Doha'} · Verified community vendor</Text></View><View style={styles.ratingLine}><Icon name="star" size={13} color={colors.gold}/><Text style={[styles.ratingText,{color:colors.text2}]}>{Number(listing.vendor_rating_avg||listing.rating_avg||0).toFixed(1)} ({listing.vendor_rating_count||listing.rating_count||0} reviews)</Text></View></View><Icon name="chevron-forward" size={19} color={colors.muted}/></Pressable></View><Text style={[styles.detailSectionTitle,{color:colors.text}]}>About this {listing.kind}</Text><Text style={[styles.referenceDetailDescription,{color:colors.text2}]}>{listing.description||'Ask this verified local seller for more detail about this listing.'}</Text><View style={styles.detailFacts}><DetailFact icon="shield-checkmark-outline" label="Verified seller"/><DetailFact icon="chatbubble-ellipses-outline" label="Direct contact"/><DetailFact icon={listing.kind==='service'?'calendar-outline':'bag-check-outline'} label={listing.kind==='service'?'Book a time':'Server-priced checkout'}/></View><View style={styles.reviewHeader}><Text style={[styles.detailSectionTitle,{color:colors.text,marginBottom:0}]}>Buyer reviews</Text>{user&&<Pressable accessibilityRole="button" onPress={()=>setReviewOpen(true)}><Text style={[styles.writeReview,{color:colors.gold}]}>Write review</Text></Pressable>}</View>{reviews.length?reviews.slice(0,3).map((item)=><View key={item.id} style={[styles.referenceReview,{backgroundColor:colors.surface}]}><View style={styles.ratingLine}><View style={nx.inline}>{[1,2,3,4,5].map((n)=><Icon key={n} name="star" size={14} color={n<=item.rating?colors.gold:colors.border}/>)}</View><Text style={[styles.reviewDate,{color:colors.muted}]}>{date(item.created_at)}</Text></View><Text style={[styles.reviewTitle,{color:colors.text}]}>{item.title||'Buyer review'}</Text>{item.comment?<Text style={[styles.reviewCopy,{color:colors.text2}]}>{item.comment}</Text>:null}</View>):<Text style={[styles.noReview,{color:colors.text2}]}>Be the first buyer to leave a review after your completed order or booking.</Text>}<SectionTitle title="More to explore" action="View all" onPress={()=>go('browse')}/><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.listingRail}>{data.related.map((row)=><ListingCard key={row.id} listing={row} compact onPress={()=>go('listing',{id:row.id})}/>)}</ScrollView></View></ScrollView><BottomBar><View><Text style={[styles.totalLabel,{color:colors.text2}]}>{listing.kind==='service'?'STARTING FROM':'PRICE'}</Text><Money value={listing.price} currency={listing.currency} strong/></View><Button variant={listing.kind==='service'?'primary':'gold'} icon={listing.kind==='service'?'arrow-forward':'cart-outline'} onPress={listing.kind==='service'?()=>go('booking',{listing}):addItem} style={styles.detailBuyButton}>{listing.kind==='service'?'Book service':'Add to cart'}</Button></BottomBar><Sheet visible={reviewOpen} title="Write a review" onClose={()=>setReviewOpen(false)}><Field label="Rating (1–5)" value={review.rating} onChangeText={(rating)=>setReview((r)=>({...r,rating}))} keyboardType="number-pad" maxLength={1}/><Field label="Review title (optional)" value={review.title} onChangeText={(title)=>setReview((r)=>({...r,title}))} placeholder="Summarise your experience"/><Field label="Comment (optional)" value={review.comment} onChangeText={(comment)=>setReview((r)=>({...r,comment}))} multiline style={{minHeight:96,textAlignVertical:'top',paddingTop:12}}/><Button onPress={submitReview}>Post review</Button></Sheet></View>;
}
function DetailFact({icon,label}:{icon:IconName;label:string}){const{colors}=useTheme();return <View style={styles.detailFact}><Icon name={icon} size={18} color={colors.primary}/><Text style={[styles.detailFactText,{color:colors.text2}]}>{label}</Text></View>;}

function StoreDetail({ slug, go, back }: any) { const { colors } = useTheme(); const [vendor, setVendor] = useState<Vendor | null>(null); const [listings, setListings] = useState<Listing[]>([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async (pull = false) => { if (pull) setRefreshing(true); else setLoading(true); setError(''); try { const data = await api.get<{vendor: Vendor; listings: Listing[]}>(`/vendors/${encodeURIComponent(slug)}`); setVendor(data.vendor); setListings(data.listings); } catch (e) { if (pull) Alert.alert('Could not refresh', message(e)); else setError(message(e)); } finally { setLoading(false); setRefreshing(false); } }, [slug]);
  useEffect(() => { void load(); }, [load]);
  if (error && !vendor) return <View style={styles.page}><Header title="Store" back={back}/><EmptyState icon="cloud-offline-outline" title="Store unavailable" text={error} action={<Button style={{ marginTop: 8 }} onPress={() => void load()}>Try again</Button>}/></View>; if (loading || !vendor) return <View style={styles.page}><Header title="Store" back={back}/><Spinner label="Loading store…"/></View>; return <View style={styles.page}><Header title="Store" back={back}/><ScrollView contentContainerStyle={styles.detailScroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary}/>}><View style={{ height: 110, backgroundColor: colors.primary, overflow: 'hidden' }}>{vendor.logo_url && <Image contentFit="cover" transition={200} source={{ uri:  vendor.logo_url  }} style={{ width: '100%', height: '100%', opacity: 0.4 }} blurRadius={10} />}</View><View style={styles.storeInfo}><View style={{ flexDirection: 'row', alignItems: 'center', marginTop: -35, marginBottom: 10 }}><View style={{ width: 70, height: 70, borderRadius: 12, backgroundColor: '#fff', padding: 3, elevation: 4 }}>{vendor.logo_url ? <Image contentFit="cover" transition={200} source={{uri: vendor.logo_url}} style={{width: '100%', height: '100%', borderRadius: 9}} /> : <Icon name="storefront" size={48} color={colors.primary}/>}</View></View><Text style={[styles.detailTitle, { color: colors.text }]}>{vendor.business_name}</Text><Text style={[styles.detailDescription, { color: colors.text2 }]}>{vendor.description || 'A verified local Sokoni Hub seller.'}</Text><View style={styles.storeMeta}><Icon name="location-outline" size={17} color={colors.muted}/><Text style={[styles.vendorMeta, { color: colors.text2 }]}>{vendor.city}, {vendor.country}</Text></View><Button variant="secondary" onPress={() => Linking.openURL(`https://wa.me/${String(vendor.whatsapp || '').replace(/\D/g, '')}`)}>Message store on WhatsApp</Button><SectionTitle title="Available listings"/>{listings.length ? listings.map((listing) => <ListingCard key={listing.id} listing={listing} onPress={() => go('listing', { id: listing.id })}/>) : <EmptyState title="No current listings" text="Check back soon for this seller's latest products and services."/>}</View></ScrollView></View>; }

function Cart({ go, back, tab }: any) {
  const { colors } = useTheme(); const cart = useCart(); const subtotal = cart.items.reduce((total,item)=>total+item.price*item.qty,0);
  const byVendor=cart.items.reduce<Record<string,CartItem[]>>((all,item)=>{(all[item.vendor_name]??=[]).push(item);return all;},{});
  // Header, scrolling content, checkout bar and the tab bar are stacked in one column, so the tab bar is always pinned to the bottom.
  return <View style={styles.page}>
    <View style={styles.cartTopbar}><Pressable accessibilityRole="button" onPress={back} accessibilityLabel="Go back" style={styles.referenceBack}><Icon name="arrow-back" size={23} color={colors.text}/></Pressable><BrandMark small/></View>
    {cart.items.length ? <>
      <ScrollView style={{flex:1}} contentContainerStyle={styles.referenceCartScroll}>
        <View style={styles.cartTitleRow}><Text style={[styles.referenceCartTitle,{color:colors.text}]}>My Cart <Text style={[styles.cartCountPill,{backgroundColor:colors.surface2,color:colors.text2}]}>{cart.count} items</Text></Text></View>
        <View style={[styles.dispatchProgress,{backgroundColor:colors.surface}]}><View style={[styles.dispatchIcon,{backgroundColor:colors.primarySoft}]}><Icon name="car-outline" size={20} color={colors.primary}/></View><View style={{flex:1}}><View style={styles.dispatchHead}><Text style={[styles.dispatchTitle,{color:colors.text}]}>Delivery price confirmed at checkout</Text><Text style={[styles.dispatchTitle,{color:colors.primary}]}>Secure quote</Text></View><View style={[styles.progressTrack,{backgroundColor:colors.border}]}><View style={[styles.progressFill,{backgroundColor:colors.primary,width:'74%'}]}/></View><Text style={[styles.dispatchCopy,{color:colors.text2}]}>Server pricing checks availability, delivery options and final fees before payment.</Text></View></View>
        {Object.entries(byVendor).map(([vendor,items])=><View key={vendor} style={[styles.vendorCartBlock,{backgroundColor:colors.surface,borderColor:colors.border}]}><View style={styles.vendorCartHeading}><Icon name="storefront-outline" size={16} color={colors.primary}/><Text style={[styles.vendorCartName,{color:colors.text}]}>{vendor}</Text></View>{items.map((item)=><View key={item.listing_id} style={styles.referenceCartItem}><ListingImage uri={item.image} style={styles.referenceCartImage} icon="basket-outline" size={25}/><View style={{flex:1}}><Text numberOfLines={2} style={[styles.referenceCartItemTitle,{color:colors.text}]}>{item.title}</Text><View style={styles.cartBadges}><Text style={[styles.cartFreshBadge,{backgroundColor:colors.primarySoft,color:colors.primary}]}>Verified listing</Text><Text style={[styles.importText,{color:colors.text2}]}>Local seller</Text></View><Money value={item.price} currency={item.currency} strong/></View><View style={styles.cartItemControls}><Pressable accessibilityRole="button" onPress={()=>cart.remove(item.listing_id)} accessibilityLabel="Remove item" hitSlop={8}><Icon name="trash-outline" size={18} color={colors.muted}/></Pressable><View style={styles.qtyRow}><Pressable accessibilityRole="button" onPress={()=>item.qty===1?cart.remove(item.listing_id):cart.setQty(item.listing_id,item.qty-1)} accessibilityLabel="Decrease quantity" style={[styles.roundQty,{borderColor:colors.border}]}><Icon name="remove" size={15} color={colors.text}/></Pressable><Text style={[styles.qty,{color:colors.text}]}>{item.qty}</Text><Pressable accessibilityRole="button" onPress={()=>cart.setQty(item.listing_id,item.qty+1)} accessibilityLabel="Increase quantity" style={[styles.roundQty,{backgroundColor:colors.primary,borderColor:colors.primary}]}><Icon name="add" size={15} color="#fff"/></Pressable></View></View></View>)}</View>)}
      </ScrollView>
      <BottomBar style={{paddingBottom:10}}><View><Text style={[styles.totalLabel,{color:colors.text2}]}>TOTAL CART</Text><Money value={subtotal} strong/></View><Button variant="gold" icon="arrow-forward" onPress={()=>go('checkout')} style={styles.referenceCheckoutButton}>Proceed to checkout</Button></BottomBar>
    </> : <View style={{flex:1}}><EmptyState title="Your cart is waiting" text="Add a local product, then checkout with server-verified prices." icon="bag-handle-outline" action={<Button style={{marginTop:10}} onPress={()=>tab('browse')}>Explore local listings</Button>}/></View>}
    <Tabs active="cart" tab={tab}/>
  </View>;
}

function Orders({ go, back }: any) { const { colors } = useTheme(); const { user } = useAuth(); const [orders, setOrders] = useState<Order[]>([]); const [loading, setLoading] = useState(true); const load = useCallback(async () => { if (!user) return; setLoading(true); try { setOrders((await api.get<{orders: Order[]}>('/orders/mine')).orders); } catch (e) { Alert.alert('Could not load orders', message(e)); } finally { setLoading(false); } }, [user]); useEffect(() => { void load(); }, [load]); if (!user) return <GuestGate heading="My orders" title="Sign in to see orders" text="Your order history and status are stored securely in your buyer account." go={go} back={back}/>; return <View style={styles.page}><Header title="My orders" back={back}/>{loading ? <Spinner label="Loading your orders…"/> : <FlatList data={orders} keyExtractor={(order) => order.id} contentContainerStyle={styles.ordersList} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary}/>} renderItem={({ item }) => <Card style={styles.orderCard}><View style={styles.orderTop}><View><Text style={[styles.orderCode, { color: colors.text }]}>{item.code}</Text><Text style={[styles.orderDate, { color: colors.text2 }]}>{date(item.created_at)} · {item.business_name || item.vendor?.business_name}</Text></View><Status value={item.status}/></View><Divider/><View style={styles.orderBottom}><Money value={item.total} currency={item.currency} strong/><Pressable accessibilityRole="button" onPress={() => go('track', { code: item.code, phone: user.phone })}><Text style={[styles.trackLink, { color: colors.primary }]}>Track order</Text></Pressable></View></Card>} ListEmptyComponent={<EmptyState title="No orders yet" text="When you purchase a local product, its status will appear here." action={<Button onPress={() => go('browse')}>Start browsing</Button>}/>}/>}</View>; }
function Bookings({ go, back }: any) { const { colors } = useTheme(); const { user } = useAuth(); const [bookings, setBookings] = useState<Booking[]>([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async (pull = false) => { if (!user) return; if (pull) setRefreshing(true); else setLoading(true); setError(''); try { setBookings((await api.get<{bookings: Booking[]}>('/bookings/mine')).bookings); } catch (e) { if (pull) Alert.alert('Could not refresh', message(e)); else setError(message(e)); } finally { setLoading(false); setRefreshing(false); } }, [user]);
  useEffect(() => { void load(); }, [load]); if (!user) return <GuestGate heading="My bookings" title="Sign in to see bookings" text="Keep your service requests and their latest status in one place." go={go} back={back}/>; return <View style={styles.page}><Header title="My bookings" back={back}/>{loading ? <Spinner label="Loading your bookings…"/> : error && !bookings.length ? <EmptyState icon="cloud-offline-outline" title="Could not load bookings" text={error} action={<Button style={{ marginTop: 8 }} onPress={() => void load()}>Try again</Button>}/> : <FlatList data={bookings} keyExtractor={(booking) => booking.id} contentContainerStyle={styles.ordersList} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary}/>} renderItem={({ item }) => <Card style={styles.orderCard}><View style={styles.orderTop}><View><Text style={[styles.orderCode, { color: colors.text }]}>{item.listing_title || item.code}</Text><Text style={[styles.orderDate, { color: colors.text2 }]}>{item.business_name} · {dateTime(item.slot_starts_at || item.scheduled_at || item.preferred_at)}</Text></View><Status value={item.status}/></View><Divider/><Pressable accessibilityRole="button" onPress={() => go('track', { bookingCode: item.code, phone: user.phone })}><Text style={[styles.trackLink, { color: colors.primary }]}>Track booking</Text></Pressable></Card>} ListEmptyComponent={<EmptyState title="No bookings yet" text="Book a local service to manage it here." action={<Button onPress={() => go('browse', { kind: 'service' })}>Browse services</Button>}/>}/>}</View>; }
function Status({ value }: { value: string }) { const { colors } = useTheme(); const danger = value === 'cancelled'; const success = ['delivered','completed','confirmed'].includes(value); return <View style={[styles.status, { backgroundColor: danger ? colors.dangerSoft : success ? colors.successSoft : colors.warningSoft }]}><Text style={{ color: danger ? colors.danger : success ? colors.success : colors.warning, fontSize: 11, fontWeight: '800' }}>{statusLabel(value)}</Text></View>; }
function Track({ go, back, params }: any) { const { colors } = useTheme(); const [orderCode, setOrderCode] = useState(params?.code || ''); const [bookingCode, setBookingCode] = useState(params?.bookingCode || ''); const [phone, setPhone] = useState(params?.phone || ''); const [result, setResult] = useState<any>(null); const [busy, setBusy] = useState(false); const track = async () => { if (!phone || (!orderCode && !bookingCode)) return Alert.alert('Enter tracking details', 'Use either your order or booking code and the phone used at checkout.'); setBusy(true); try { const isBooking = !!bookingCode; const data = await api.get<any>(isBooking ? `/bookings/track${query({code: bookingCode, phone})}` : `/orders/track${query({code: orderCode, phone})}`); setResult({ ...data, isBooking }); } catch (e) { Alert.alert('Could not find it', message(e)); } finally { setBusy(false); } }; return <View style={styles.page}><Header title="Track an order or booking" back={back}/><ScrollView contentContainerStyle={styles.trackScroll}><Notice>Enter the code from your confirmation and the complete phone number used to place it.</Notice><Field label="Order code (if tracking an order)" value={orderCode} onChangeText={(value) => { setOrderCode(value.toUpperCase()); if(value) setBookingCode(''); }} autoCapitalize="characters" placeholder="ORD…"/><Field label="Booking code (if tracking a service)" value={bookingCode} onChangeText={(value) => { setBookingCode(value.toUpperCase()); if(value) setOrderCode(''); }} autoCapitalize="characters" placeholder="BKG…"/><Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+974…"/><Button loading={busy} onPress={track}>Track status</Button>{result ? <Card style={{ marginTop: 18 }}><View style={styles.orderTop}><Text style={[styles.orderCode, { color: colors.text }]}>{result.order?.code || result.booking?.code}</Text><Status value={result.order?.status || result.booking?.status}/></View><Divider/><Text style={[styles.trackProduct, { color: colors.text }]}>{result.order?.business_name || result.booking?.listing_title || result.booking?.business_name || 'Sokoni Hub'}</Text><Text style={[styles.trackDetail, { color: colors.text2 }]}>{result.isBooking ? `Preferred: ${date(result.booking?.slot_starts_at || result.booking?.scheduled_at || result.booking?.preferred_at)}` : `Placed: ${date(result.order?.created_at)}`}</Text>{result.order?.whatsapp_url ? <Button variant="secondary" onPress={() => Linking.openURL(result.order.whatsapp_url)} style={{ marginTop: 13 }}>Contact seller on WhatsApp</Button> : null}</Card> : null}</ScrollView></View>; }
function Account({ go, back, tab }: any) {
  const { colors, theme, toggleTheme } = useTheme(); const { user, logout } = useAuth(); const fav = useFavourites();
  const [counts, setCounts] = useState<{ orders?: number; bookings?: number }>({});
  const [refreshing, setRefreshing] = useState(false);
  const fetchCounts = useCallback(() => Promise.all([api.get<{ orders: Order[] }>('/orders/mine').catch(() => null), api.get<{ bookings: Booking[] }>('/bookings/mine').catch(() => null)]), []);
  useEffect(() => {
    if (!user) return undefined; let live = true;
    void fetchCounts().then(([o, b]) => { if (live) setCounts({ orders: o?.orders.length, bookings: b?.bookings.length }); });
    return () => { live = false; };
  }, [user, fetchCounts]);
  const refresh = async () => { setRefreshing(true); const [o, b] = await fetchCounts(); setCounts({ orders: o?.orders.length, bookings: b?.bookings.length }); setRefreshing(false); };
  if(!user) return <View style={styles.page}><View style={styles.accountGuestHeader}><BrandMark small/><Pressable accessibilityRole="button" onPress={back} accessibilityLabel="Close" style={styles.accountClose}><Icon name="close" size={22} color={colors.text}/></Pressable></View><ScrollView contentContainerStyle={styles.accountGuestScroll}><View style={[styles.guestHero,{backgroundColor:colors.primarySoft}]}><View style={[styles.guestAvatar,{backgroundColor:colors.primary}]}><Icon name="person-outline" size={34} color="#fff"/></View><Text style={[styles.guestHeroTitle,{color:colors.text}]}>Your Sokoni Hub profile</Text><Text style={[styles.guestHeroCopy,{color:colors.text2}]}>Sign in to place orders, book specialists, keep your address handy and track every request.</Text><Button onPress={()=>go('login')} style={styles.guestSignButton}>Sign in securely</Button><Button variant="secondary" onPress={()=>go('register')} style={styles.guestCreateButton}>Create buyer account</Button></View><SectionTitle title="Explore as a guest"/><AccountRow icon="search-outline" title="Browse the market" subtitle="Products, stalls and local services" onPress={()=>tab('browse')}/><AccountRow icon="navigate-outline" title="Track with a code" subtitle="Find an order or booking" onPress={()=>go('track')}/><AccountRow icon="help-buoy-outline" title="Help & support" subtitle="Contact the Sokoni Hub team" onPress={()=>go('support')}/></ScrollView><Tabs active="account" tab={tab}/></View>;
  const tiles: [IconName, string, number | undefined, () => void][] = [['receipt-outline','Orders',counts.orders,()=>go('orders')],['calendar-outline','Bookings',counts.bookings,()=>go('bookings')],['navigate-outline','Track',undefined,()=>go('track')],['heart-outline','Saved',fav.items.length,()=>go('saved')]];
  const badge = (n?: number) => n === undefined ? undefined : <View style={[nx.countPill,{backgroundColor:colors.primarySoft}]}><Text style={[nx.countText,{color:colors.primary}]}>{n}</Text></View>;
  return <View style={styles.page}>
    <LinearGradient colors={['#05663F','#FF7A00']} start={{x:0,y:0}} end={{x:1,y:1}} style={nx.profileHeader}>
      <View style={styles.profileTopRow}><View style={nx.logoChip}><BrandMark small/></View><Pressable accessibilityRole="button" onPress={()=>go('notifications')} accessibilityLabel="Notifications" style={styles.profileBell}><Icon name="notifications-outline" size={21} color="#fff"/></Pressable></View>
      <View style={nx.identity}><View style={nx.avatar}><Text style={nx.avatarText}>{user.full_name.charAt(0).toUpperCase()}</Text></View><View style={{flex:1}}><Text numberOfLines={1} style={styles.profileName}>{user.full_name}</Text><Text numberOfLines={1} style={[styles.profileContact,{color:'#F2FFF7'}]}>{user.email || user.phone}</Text><View style={styles.profileVerified}><Icon name="shield-checkmark" size={12} color="#fff"/><Text style={styles.profileVerifiedText}>Verified buyer</Text></View></View></View>
    </LinearGradient>
    <ScrollView contentContainerStyle={nx.accountBody} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
      <View style={nx.tileGrid}>{tiles.map(([icon,label,n,onPress])=><Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[nx.tile,{backgroundColor:colors.surface,borderColor:colors.border}]}><View style={[styles.quickAccountIcon,{backgroundColor:colors.primarySoft}]}><Icon name={icon} size={20} color={colors.primary}/></View><Text style={[styles.quickAccountText,{color:colors.text}]}>{label}</Text>{n===undefined?<View style={nx.countSpacer}/>:badge(n)}</Pressable>)}</View>
      <Text style={[styles.accountSectionLabel,{color:colors.text2}]}>PROFILE DETAILS</Text>
      <View style={[styles.accountGroup,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <AccountRow icon="person-outline" title="Full name" subtitle={user.full_name} right={<View/>}/><Divider/>
        <AccountRow icon="call-outline" title="Phone number" subtitle={user.phone ? `+${String(user.phone).replace(/^\+/, '')}` : 'Not added'} right={<View/>}/><Divider/>
        <AccountRow icon="mail-outline" title="Email address" subtitle={user.email || 'Not added'} right={<View/>}/>
      </View>
      <Text style={[styles.accountSectionLabel,{color:colors.text2}]}>MY ACTIVITY</Text>
      <View style={[styles.accountGroup,{backgroundColor:colors.surface,borderColor:colors.border}]}><AccountRow icon="receipt-outline" title="My orders" subtitle="Track products and delivery" right={badge(counts.orders)} onPress={()=>go('orders')}/><Divider/><AccountRow icon="calendar-outline" title="My bookings" subtitle="Manage service requests" right={badge(counts.bookings)} onPress={()=>go('bookings')}/><Divider/><AccountRow icon="heart-outline" title="Saved items" subtitle="Products and services you liked" right={badge(fav.items.length)} onPress={()=>go('saved')}/></View>
      <Text style={[styles.accountSectionLabel,{color:colors.text2}]}>PREFERENCES</Text>
      <View style={[styles.accountGroup,{backgroundColor:colors.surface,borderColor:colors.border}]}><AccountRow icon={theme==='dark'?'moon-outline':'sunny-outline'} title="Dark mode" subtitle={theme==='dark'?'On':'Off'} right={<Switch accessibilityLabel="Dark mode" value={theme==='dark'} onValueChange={toggleTheme} trackColor={{false:colors.border,true:colors.primary}} thumbColor="#fff"/>}/><Divider/><AccountRow icon="notifications-outline" title="Notifications" subtitle="Order and booking updates" onPress={()=>go('notifications')}/></View>
      <Text style={[styles.accountSectionLabel,{color:colors.text2}]}>SUPPORT & LEGAL</Text>
      <View style={[styles.accountGroup,{backgroundColor:colors.surface,borderColor:colors.border}]}><AccountRow icon="help-buoy-outline" title="Help & support" subtitle="Order, account and safety help" onPress={()=>go('support')}/><Divider/><AccountRow icon="document-text-outline" title="Terms & privacy" subtitle="Customer policies and marketplace rules" onPress={()=>go('legal')}/></View>
      <Button variant="danger" onPress={()=>Alert.alert('Sign out?','You will need your password and PIN to sign in again.',[{text:'Cancel',style:'cancel'},{text:'Sign out',style:'destructive',onPress:()=>void logout()}])} style={styles.colourSignOut}>Sign out</Button>
      <Text style={[styles.accountFootnote,{color:colors.muted}]}>Seller and administrator tools remain on the secure web portal.</Text>
    </ScrollView>
    <Tabs active="account" tab={tab}/>
  </View>;
}

function AccountRow({ icon, title, subtitle, onPress, right }: { icon: IconName; title: string; subtitle?: string; onPress?: () => void; right?: React.ReactNode }) { const { colors } = useTheme(); return <Pressable accessibilityRole="button" disabled={!onPress} onPress={onPress} style={styles.accountRow}><View style={[styles.accountIcon, { backgroundColor: colors.primarySoft }]}><Icon name={icon} size={21} color={colors.primary}/></View><View style={{ flex: 1 }}><Text style={[styles.accountTitle, { color: colors.text }]}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={[styles.accountSubtitle, { color: colors.text2 }]}>{subtitle}</Text> : null}</View>{right ?? (onPress ? <Icon name="chevron-forward" size={20} color={colors.muted}/> : null)}</Pressable>; }

function Support({ go, back }: any) { const { colors } = useTheme(); return <View style={styles.page}><Header title="Help & support" back={back}/><ScrollView contentContainerStyle={styles.supportScroll}><View style={[styles.supportHero, { backgroundColor: colors.tealSoft }]}><Icon name="help-buoy" size={38} color={colors.teal}/><Text style={[styles.supportTitle, { color: colors.text }]}>We're here to help</Text><Text style={[styles.supportCopy, { color: colors.text2 }]}>For help with an order, booking, account or marketplace issue, contact Sokoni Hub directly.</Text></View><AccountRow icon="logo-whatsapp" title="WhatsApp support" subtitle="Message our support team" onPress={() => Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}`)}/><AccountRow icon="mail-outline" title="Email support" subtitle={SUPPORT_EMAIL} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}/><AccountRow icon="globe-outline" title="Open customer website" subtitle="More help and legal information" onPress={() => go('legal', { path: '', title: 'Sokoni Hub website' })}/><Notice type="warning">Never share your password, PIN, one-time recovery code or payment details in a message.</Notice></ScrollView></View>; }
function GuestGate({ title, text, go, back, heading = 'Your activity' }: { title: string; text: string; go: any; back: any; heading?: string }) { return <View style={styles.page}><Header title={heading} back={back}/><EmptyState title={title} text={text} icon="lock-closed-outline" action={<Button style={{ marginTop: 10 }} onPress={() => go('login')}>Sign in</Button>}/></View>; }
function WebOnlyAccount({ onSignOut }: { onSignOut: () => Promise<void> }) { const { colors } = useTheme(); return <View style={styles.page}><Header title="Web portal account"/><EmptyState icon="desktop-outline" title="This account uses the web portal" text="Sokoni Hub's mobile application is intentionally for consumers only. Vendor and administrator tools remain protected on the web." action={<View style={{ width: 260, gap: 10, marginTop: 10 }}><Button onPress={() => WebBrowser.openBrowserAsync(WEB_URL)}>Open secure web portal</Button><Button variant="secondary" onPress={() => void onSignOut()}>Sign out</Button></View>}/><Text style={[styles.webPortalText, { color: colors.muted }]}>This separation keeps store operations and administration out of the consumer app.</Text></View>; }




