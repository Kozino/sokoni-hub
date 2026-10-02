import os, re

app_code = open('App.tsx', 'r').read()
os.makedirs('src/screens', exist_ok=True)
os.makedirs('src/navigation', exist_ok=True)
os.makedirs('src/styles', exist_ok=True)

# 1. Styles
styles_match = re.search(r'(const styles = StyleSheet\.create\(\{[\s\S]*?\}\);)', app_code)
nx_match = re.search(r'(const nx = StyleSheet\.create\(\{[\s\S]*?\}\);)', app_code)

styles_code = "import { StyleSheet } from 'react-native';\n\n"
if styles_match: styles_code += "export " + styles_match.group(1) + "\n\n"
if nx_match: styles_code += "export " + nx_match.group(1) + "\n"
open('src/styles/styles.ts', 'w').write(styles_code)

app_code = re.sub(r'(const styles = StyleSheet\.create\(\{[\s\S]*?\}\);)', '', app_code)
app_code = re.sub(r'(const nx = StyleSheet\.create\(\{[\s\S]*?\}\);)', '', app_code)

# 2. Screens
screens = ['Welcome', 'Tabs', 'Home', 'TrustTile', 'SectionTitle', 'ListingRail', 'ListingImage', 'ListingCard', 'Browse', 'Saved', 'Notifications', 'AuthScaffold', 'Login', 'Register', 'Pin', 'Recovery', 'ListingDetail', 'DetailFact', 'StoreDetail', 'Cart', 'Orders', 'Bookings', 'Status', 'Track', 'Account', 'AccountRow', 'Support', 'GuestGate', 'WebOnlyAccount']

screen_map = {}
parts = re.split(r'^function ', app_code, flags=re.MULTILINE)
for i in range(1, len(parts)):
    match = re.match(r'^([A-Z][a-zA-Z0-9_]*)\(([\s\S]*)$', parts[i])
    if match:
        name = match.group(1)
        body = match.group(2)
        screen_map[name] = f"export function {name}(" + body

common_imports = """import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, FlatList, ImageBackground, KeyboardAvoidingView, Linking, Pressable, RefreshControl, ScrollView, Switch, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError, query } from '../api';
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP, WEB_URL } from '../config';
import { AuthProvider, CartProvider, ThemeProvider, useAuth, useCart, useTheme } from '../providers';
import { BrandMark, Button, Card, Chip, Divider, Dropdown, EmptyState, Field, FontContext, Header, IconButton, Money, Notice, Sheet, Spinner, Text, TextInput } from '../ui';
import { CityProvider, useCity } from '../city';
import { categoryImage } from '../catImages';
import { BottomBar } from '../ui';
import { BookService } from '../booking';
import { Checkout } from '../checkout';
import { FavouritesProvider, useFavourites } from '../favourites';
import { FeaturedStores, usePromotions, VipStores } from '../promotions';
import { LegalScreen } from '../legal';
import { Icon } from '../icons';
import { styles, nx } from '../styles/styles';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { tap, success } from '../haptics';

const message = (error: any) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'To be arranged';
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'To be arranged';
const statusLabel = (value: string) => value.replace(/_/g, ' ').replace(/\\b\\w/g, (letter) => letter.toUpperCase());
"""

for name, code in screen_map.items():
    if name == 'App' or name == 'Marketplace': continue
    
    # Inject react navigation hooks inside the body block, exactly where it starts
    body_match = re.search(r'export function [^\(]+\([\s\S]*?\)\s*\{', code)
    if body_match:
        body_start = body_match.end()
        injected = """
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const go = (screen: string, params?: any) => navigation.navigate(screen, params);
  const back = () => navigation.goBack();
  const tab = (screen: string, params?: any) => navigation.navigate(screen, params);
  const done = () => navigation.navigate('account');
  const initial = route.params;
  const params = route.params;
  const setup = route.params?.setup;
"""
        code = code[:body_start] + injected + code[body_start:]

    # Expo image refactor
    code = code.replace('<Image source={{', '<Image contentFit="cover" transition={200} source={{')
    code = code.replace('<Image source={require', '<Image contentFit="cover" source={require')
    
    open(f'src/screens/{name}.tsx', 'w').write(common_imports + "\n" + code)

# Navigator
screens_to_import = [s for s in screens if s not in ('App', 'Marketplace', 'Tabs', 'TrustTile', 'SectionTitle', 'ListingRail', 'ListingImage', 'ListingCard', 'AuthScaffold', 'DetailFact', 'Status')]
nav_imports = '\n'.join([f"import {{ {s} }} from '../screens/{s}';" for s in screens_to_import])
nav_code = f"""
import React from 'react';
import {{ NavigationContainer }} from '@react-navigation/native';
import {{ createNativeStackNavigator }} from '@react-navigation/native-stack';
import {{ createBottomTabNavigator }} from '@react-navigation/bottom-tabs';

{nav_imports}

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabNavigator() {{
  return (
    <Tab.Navigator screenOptions={{{{ headerShown: false, tabBarStyle: {{ display: 'none' }} }}}}>
      <Tab.Screen name="home" component={{Home}} />
      <Tab.Screen name="browse" component={{Browse}} />
      <Tab.Screen name="cart" component={{Cart}} />
      <Tab.Screen name="account" component={{Account}} />
    </Tab.Navigator>
  );
}}

export function RootNavigator() {{
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{{{ headerShown: false }}}}>
        <Stack.Screen name="Main" component={{TabNavigator}} />
        <Stack.Screen name="welcome" component={{Welcome}} />
        <Stack.Screen name="login" component={{Login}} />
        <Stack.Screen name="register" component={{Register}} />
        <Stack.Screen name="pin" component={{Pin}} />
        <Stack.Screen name="pinsetup" component={{Pin}} initialParams={{{{ setup: true }}}} />
        <Stack.Screen name="forgot" component={{Recovery}} />
        <Stack.Screen name="listing" component={{ListingDetail}} />
        <Stack.Screen name="store" component={{StoreDetail}} />
        <Stack.Screen name="orders" component={{Orders}} />
        <Stack.Screen name="bookings" component={{Bookings}} />
        <Stack.Screen name="track" component={{Track}} />
        <Stack.Screen name="support" component={{Support}} />
        <Stack.Screen name="saved" component={{Saved}} />
        <Stack.Screen name="notifications" component={{Notifications}} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}}
"""
open('src/navigation/RootNavigator.tsx', 'w').write(nav_code)

# App.tsx
new_app = """
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts } from '@expo-google-fonts/inter';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, CartProvider, ThemeProvider } from './src/providers';
import { CityProvider } from './src/city';
import { FavouritesProvider } from './src/favourites';
import { RootNavigator } from './src/navigation/RootNavigator';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { View, Text } from 'react-native';
import { FontContext } from './src/ui';

const queryClient = new QueryClient();

function ErrorFallback({ error }: any) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold', color: 'red', marginBottom: 10 }}>Something went wrong!</Text>
      <Text style={{ textAlign: 'center', marginBottom: 20 }}>{error.message}</Text>
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });

  useEffect(() => { if (fontsLoaded) SplashScreen.hideAsync().catch(() => {}); }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <QueryClientProvider client={queryClient}>
        <FontContext.Provider value={{ loaded: true }}>
          <ThemeProvider>
            <AuthProvider>
              <CityProvider>
                <CartProvider>
                  <FavouritesProvider>
                    <SafeAreaProvider>
                      <RootNavigator />
                      <StatusBar style="auto" />
                    </SafeAreaProvider>
                  </FavouritesProvider>
                </CartProvider>
              </CityProvider>
            </AuthProvider>
          </ThemeProvider>
        </FontContext.Provider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
"""
open('App.tsx', 'w').write(new_app)

