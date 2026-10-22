import { registerRootComponent } from 'expo';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BanknotesIcon, Cog6ToothIcon, TruckIcon } from 'react-native-heroicons/outline';
import './src/backgroundLocation'; // defines the background location task (QC item 14)
import { AuthProvider, useAuth } from './src/providers/AuthContext';
import { api } from './src/api';
import { usePushToken } from './src/usePushToken';
import { Welcome } from './src/screens/Welcome';
import { Login } from './src/screens/Login';
import { Register } from './src/screens/Register';
import { Pin } from './src/screens/Pin';
import { Pending } from './src/screens/Pending';
import { Home } from './src/screens/Home';
import { Earnings } from './src/screens/Earnings';
import { Settings } from './src/screens/Settings';
import { ActiveDelivery } from './src/screens/ActiveDelivery';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { Button } from './src/components/UI';
import type { Stage } from './src/screens/types';
import { C } from './src/theme';

type PublicScreen = 'welcome' | 'login' | 'register';
type Tab = 'home' | 'earnings' | 'settings';
type DriverState = 'checking' | 'approved' | 'pending' | 'suspended' | 'error';

function Router() {
  const { user, loading, login, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [publicScreen, setPublicScreen] = useState<PublicScreen>('welcome');
  const [stage, setStage] = useState<Stage | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [driver, setDriver] = useState<DriverState>('checking');
  const [driverOnline, setDriverOnline] = useState<boolean | undefined>(undefined);
  const pushToken = usePushToken();

  // Riders get an alert when a job is posted near them.
  useEffect(() => {
    if (!pushToken || !user) return;
    void api.post('/push/token', { token: pushToken, platform: Platform.OS === 'ios' ? 'ios' : 'android' }).catch(() => {});
  }, [pushToken, user?.id]);

  // Riders must be approved by an admin before they can use the app.
  const loadDriver = async () => {
    setDriver('checking');
    try {
      const res = await api.get<any>('/drivers/me');
      const status = res.driver?.status ?? 'pending';
      setDriverOnline(res.driver?.is_online == null ? undefined : !!res.driver.is_online);
      setDriver(status === 'approved' ? 'approved' : status === 'suspended' ? 'suspended' : 'pending');
    } catch {
      setDriver('error');
    }
  };

  useEffect(() => {
    if (user) {
      loadDriver();
    } else {
      setDriver('checking');
      setDriverOnline(undefined);
      setTab('home');
      setActiveOrderId(null);
    }
  }, [user]);

  // Called after the PIN step. Only rider accounts may use this app.
  const completeSignIn = async (res: { token: string; user: any }) => {
    setStage(null);
    if (res.user?.role !== 'driver') {
      Alert.alert('Not a driver account', 'This app is for Sokoni Hub drivers. Customers use the Sokoni Hub app, and vendors use the web portal.');
      return;
    }
    await login(res.user, res.token);
  };

  const signOut = async () => {
    await logout();
    setPublicScreen('welcome');
    setStage(null);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.loadingText}>Preparing your driver portal…</Text>
      </View>
    );
  }

  // Signed out: welcome → login → PIN, or register.
  if (!user) {
    if (stage) return <Pin stage={stage} onBack={() => setStage(null)} onDone={completeSignIn} />;
    if (publicScreen === 'register') {
      return <Register onBack={() => setPublicScreen('login')} onDone={() => setPublicScreen('login')} />;
    }
    if (publicScreen === 'login') {
      return <Login onBack={() => setPublicScreen('welcome')} onRegister={() => setPublicScreen('register')} onStage={setStage} />;
    }
    return <Welcome onNav={setPublicScreen} />;
  }

  // Signed in: show the rider app only once the rider is approved.
  if (driver === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.loadingText}>Loading your driver profile…</Text>
      </View>
    );
  }

  if (driver === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Could not load your driver profile</Text>
        <Text style={styles.errorText}>Check your connection and try again. Your deliveries and account are safe.</Text>
        <Button title="Try again" onPress={loadDriver} style={styles.retry} />
        <Pressable onPress={signOut} accessibilityRole="button" style={styles.signOut}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  if (driver !== 'approved') {
    return <Pending status={driver} onRefresh={loadDriver} onSignOut={signOut} />;
  }

  if (activeOrderId) {
    return (
      <ErrorBoundary>
        <ActiveDelivery orderId={activeOrderId} onDone={() => setActiveOrderId(null)} />
      </ErrorBoundary>
    );
  }

  const tabs = [
    { id: 'home' as Tab, Icon: TruckIcon, label: 'Home' },
    { id: 'earnings' as Tab, Icon: BanknotesIcon, label: 'Earnings' },
    { id: 'settings' as Tab, Icon: Cog6ToothIcon, label: 'Settings' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <ErrorBoundary key={tab}>
          {tab === 'home' && <Home onOpenDelivery={(id) => setActiveOrderId(id)} onOnlineChange={setDriverOnline} />}
          {tab === 'earnings' && <Earnings online={driverOnline} />}
          {tab === 'settings' && <Settings online={driverOnline} onLogout={signOut} />}
        </ErrorBoundary>
      </View>
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {tabs.map(({ id, Icon, label }) => {
          const active = tab === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              onPress={() => setTab(id)}
              style={({ pressed }) => [styles.tabItem, pressed && { opacity: 0.65 }]}
            >
              <View style={[styles.tabIconWrap, active && styles.tabActive]}>
                <Icon size={22} color={active ? C.primary : C.text2} />
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
              <View style={[styles.tabIndicator, active && styles.tabIndicatorActive]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor={C.surface} />
      <AuthProvider>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <Router />
        </SafeAreaView>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg, padding: 28 },
  container: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1 },
  loadingText: { marginTop: 16, color: C.text2, fontSize: 13, fontWeight: '600' },
  errorTitle: { fontSize: 21, fontWeight: '900', color: C.text, marginBottom: 8, textAlign: 'center', letterSpacing: -0.4 },
  errorText: { fontSize: 14, lineHeight: 21, color: C.text2, textAlign: 'center', marginBottom: 22 },
  retry: { alignSelf: 'stretch', width: '100%' },
  signOut: { marginTop: 18, padding: 8 },
  link: { color: C.primary, fontWeight: '800' },
  tabBar: { flexDirection: 'row', backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8, paddingHorizontal: 24 },
  tabItem: { flex: 1, alignItems: 'center', minHeight: 55 },
  tabIconWrap: { width: 48, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: C.primarySoft },
  tabLabel: { fontSize: 11, color: C.text2, marginTop: 4, fontWeight: '700' },
  tabLabelActive: { color: C.primary, fontWeight: '900' },
  tabIndicator: { width: 4, height: 4, borderRadius: 2, marginTop: 5, backgroundColor: 'transparent' },
  tabIndicatorActive: { backgroundColor: C.primary },
});

registerRootComponent(App);
