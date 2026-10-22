
import { styles, nx, ex } from './src/styles';
import { OfflineBar } from './src/ui';
import { ToastContext } from './src/toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { usePushNotifications } from './src/usePushNotifications';
import { Platform } from 'react-native';
import { createNavigationContainerRef, DarkTheme, DefaultTheme, NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const Stack = createNativeStackNavigator();

const queryClient = new QueryClient();
const navigationRef = createNavigationContainerRef<any>();

function AppRouter({ seenWelcome, finishWelcome }: any) {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  
  const go = useCallback((screen: string, params?: any) => navigation.navigate(screen, params), [navigation]);
  const back = useCallback(() => { if (navigation.canGoBack()) navigation.goBack(); else navigation.navigate('home'); }, [navigation]);
  const tab = useCallback((screen: string, params?: any) => navigation.reset({ index: 0, routes: [{ name: screen, params }] }), [navigation]);
  const done = useCallback(() => {
    navigation.navigate('account');
  }, [navigation]);
  
  const common = { go, back, tab, done };

  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }]}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }} initialRouteName={seenWelcome ? 'home' : 'welcome'}>
        <Stack.Screen name="welcome">{(props) => <Welcome onDone={(screen) => { finishWelcome(); if (screen && screen !== 'welcome') { navigation.reset({ index: 0, routes: [{ name: screen }] }); } else { navigation.reset({ index: 0, routes: [{ name: 'home' }] }); } }} />}</Stack.Screen>
        <Stack.Screen name="home">{(props) => <Home {...common} />}</Stack.Screen>
        <Stack.Screen name="browse">{(props) => <Browse {...common} initial={props.route.params} />}</Stack.Screen>
        <Stack.Screen name="services">{(props) => <Services {...common} initial={props.route.params} />}</Stack.Screen>
        <Stack.Screen name="cart">{(props) => <Cart {...common} />}</Stack.Screen>
        <Stack.Screen name="account">{(props) => <Account {...common} />}</Stack.Screen>
        <Stack.Screen name="login">{(props) => <Login {...common} />}</Stack.Screen>
        <Stack.Screen name="register">{(props) => <Register {...common} />}</Stack.Screen>
        <Stack.Screen name="pin">{(props) => <Pin {...common} setup={false} />}</Stack.Screen>
        <Stack.Screen name="pinsetup">{(props) => <Pin {...common} setup />}</Stack.Screen>
        <Stack.Screen name="forgot">{(props) => <Recovery {...common} params={props.route.params} />}</Stack.Screen>
        <Stack.Screen name="listing">{(props) => <ListingDetail {...common} id={(props.route.params as any)?.id} writeReview={!!(props.route.params as any)?.writeReview} />}</Stack.Screen>
        <Stack.Screen name="store">{(props) => <StoreDetail {...common} slug={(props.route.params as any)?.slug} />}</Stack.Screen>
        <Stack.Screen name="checkout">{(props) => <Checkout {...common} />}</Stack.Screen>
        <Stack.Screen name="orders">{(props) => <Orders {...common} />}</Stack.Screen>
        <Stack.Screen name="bookings">{(props) => <Bookings {...common} />}</Stack.Screen>
        <Stack.Screen name="track">{(props) => <Track {...common} params={props.route.params} />}</Stack.Screen>
        <Stack.Screen name="booking">{(props) => <BookService {...common} listing={(props.route.params as any)?.listing} />}</Stack.Screen>
        <Stack.Screen name="saved">{(props) => <Saved {...common} />}</Stack.Screen>
        <Stack.Screen name="notifications">{(props) => <Notifications {...common} />}</Stack.Screen>
        <Stack.Screen name="legal">{(props) => <LegalScreen {...common} path={(props.route.params as any)?.path} title={(props.route.params as any)?.title} />}</Stack.Screen>
        <Stack.Screen name="support">{(props) => <Support {...common} />}</Stack.Screen>
        <Stack.Screen name="web">{(props) => <WebOnlyAccount onSignOut={(props.route.params as any)?.onSignOut} />}</Stack.Screen>
      </Stack.Navigator>
      <OfflineBar />
    </View>
  );
}


function ErrorFallback({ error }: any) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold', color: 'red', marginBottom: 10 }}>Something went wrong!</Text>
      <Text style={{ textAlign: 'center', marginBottom: 20 }}>{error.message}</Text>
    </View>
  );
}
import { Welcome } from './src/screens/Welcome';
import { Tabs } from './src/screens/Tabs';
import { Home } from './src/screens/Home';
import { Services } from './src/screens/Services';
import { TrustTile } from './src/screens/TrustTile';
import { SectionTitle } from './src/screens/SectionTitle';
import { ListingRail } from './src/screens/ListingRail';
import { ListingImage } from './src/screens/ListingImage';
import { ListingCard } from './src/screens/ListingCard';
import { Browse } from './src/screens/Browse';
import { Saved } from './src/screens/Saved';
import { Notifications } from './src/screens/Notifications';
import { AuthScaffold } from './src/screens/AuthScaffold';
import { Login } from './src/screens/Login';
import { Register } from './src/screens/Register';
import { Pin } from './src/screens/Pin';
import { Recovery } from './src/screens/Recovery';
import { ListingDetail } from './src/screens/ListingDetail';
import { DetailFact } from './src/screens/DetailFact';
import { StoreDetail } from './src/screens/StoreDetail';
import { Cart } from './src/screens/Cart';
import { Orders } from './src/screens/Orders';
import { Bookings } from './src/screens/Bookings';
import { Status } from './src/screens/Status';
import { Track } from './src/screens/Track';
import { Account } from './src/screens/Account';
import { AccountRow } from './src/screens/AccountRow';
import { Support } from './src/screens/Support';
import { GuestGate } from './src/screens/GuestGate';
import { WebOnlyAccount } from './src/screens/WebOnlyAccount';
import { Icon, type IconName } from './src/icons';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts } from '@expo-google-fonts/inter';
import { success, tap } from './src/haptics';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, FlatList, Image, ImageBackground, KeyboardAvoidingView, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
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
type Screen = 'welcome' | 'home' | 'browse' | 'services' | 'cart' | 'account' | 'login' | 'register' | 'pin' | 'pinsetup' | 'forgot' | 'listing' | 'store' | 'checkout' | 'orders' | 'bookings' | 'track' | 'booking' | 'support' | 'saved' | 'notifications' | 'legal';
type Nav = { screen: Screen; params?: Record<string, any>; id?: number };
const message = (error: unknown) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'To be arranged';
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'To be arranged';
const statusLabel = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const useToast = () => useContext(ToastContext);

export default function App() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  const fonts: FontStatus = loaded ? 'ready' : error ? 'failed' : 'loading';
  return <ErrorBoundary FallbackComponent={ErrorFallback}><QueryClientProvider client={queryClient}><FontContext.Provider value={fonts}><SafeAreaProvider><ThemeProvider><AuthProvider><CartProvider><FavouritesProvider><CityProvider><Marketplace /></CityProvider></FavouritesProvider></CartProvider></AuthProvider></ThemeProvider></SafeAreaProvider></FontContext.Provider></QueryClientProvider></ErrorBoundary>;
}


export function Marketplace() {
  const { colors, theme } = useTheme();
  const auth = useAuth();
  const fonts = useContext(FontContext);
  const [welcomeLoaded, setWelcomeLoaded] = useState(false);
  const [seenWelcome, setSeenWelcome] = useState(false);
  const { expoPushToken } = usePushNotifications();
  // Register this device for order alerts once someone is signed in.
  useEffect(() => {
    if (!expoPushToken || !auth.user) return;
    void api.post('/push/token', { token: expoPushToken, platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'unknown' }).catch(() => {});
  }, [expoPushToken, auth.user?.id]);
  const insets = useSafeAreaInsets();
  const counter = useRef(0);
  const [toast, setToast] = useState<{ text: string; cart: boolean; id: number } | null>(null);
  const showToast = useCallback((text: string, cart = false) => setToast({ text, cart, id: ++counter.current }), []);
  const toastApi = useMemo(() => ({ show: showToast }), [showToast]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), toast.cart ? 3800 : 2600); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { AsyncStorage.getItem(WELCOME_KEY).then((value) => { setSeenWelcome(value === 'yes'); setWelcomeLoaded(true); }).catch(() => setWelcomeLoaded(true)); }, []);
  useEffect(() => { if (welcomeLoaded && !auth.loading && fonts !== 'loading') void SplashScreen.hideAsync().catch(() => {}); }, [welcomeLoaded, auth.loading, fonts]);
  useEffect(() => { const t = setTimeout(() => { void SplashScreen.hideAsync().catch(() => {}); }, 8000); return () => clearTimeout(t); }, []);
  
  // Every screen sits on the app's own page colour (the navigator default is a flat grey, and wrong in dark mode).
  const navTheme = useMemo(() => {
    const base = theme === 'dark' ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, background: colors.bg, card: colors.surface, text: colors.text, border: colors.border, primary: colors.primary } };
  }, [theme, colors]);
  const finishWelcome = useCallback(async () => { await AsyncStorage.setItem(WELCOME_KEY, 'yes'); setSeenWelcome(true); }, []);

  if (!welcomeLoaded || auth.loading) return <SafeAreaView edges={['top']} style={[styles.app, { backgroundColor: colors.bg }]}><Spinner label="Preparing Sokoni Hub…" /></SafeAreaView>;

  return <ToastContext.Provider value={toastApi}><SafeAreaView edges={['top']} style={[styles.app, { backgroundColor: colors.bg }]}><StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {auth.user && auth.user.role !== 'buyer' ? <WebOnlyAccount onSignOut={auth.logout} /> : <AppRouter seenWelcome={seenWelcome} finishWelcome={finishWelcome} />}
    </NavigationContainer>
    {toast ? <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: 64 + Math.max(insets.bottom, 6) + 22, alignItems: 'center', zIndex: 60 }}>
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 560, paddingLeft: 16, paddingRight: toast.cart ? 8 : 18, minHeight: 50, borderRadius: 25, backgroundColor: colors.deep, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 14 }}>
        <Icon name="checkmark-circle" size={20} color="#7CE0BB" />
        <Text numberOfLines={2} style={{ flexShrink: 1, color: colors.onDeep, fontSize: 14, fontWeight: '700', paddingVertical: 12 }}>{toast.text}</Text>
        {toast.cart ? <Pressable accessibilityRole="button" accessibilityLabel="View cart" onPress={() => { setToast(null); navigationRef.isReady() && navigationRef.reset({ index: 0, routes: [{ name: 'cart' }] }); }} style={{ backgroundColor: colors.orange, borderRadius: 18, paddingHorizontal: 14, height: 36, justifyContent: 'center' }}><Text style={{ color: colors.onOrange, fontSize: 13.5, fontWeight: '800' }}>View cart</Text></Pressable> : null}
      </View>
    </View> : null}
  </SafeAreaView></ToastContext.Provider>;
}

