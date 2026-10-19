import { registerRootComponent } from 'expo';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
import type { Stage } from './src/screens/types';
import { C } from './src/theme';

type PublicScreen = 'welcome' | 'login' | 'register';
type Tab = 'home' | 'earnings' | 'settings';
type DriverState = 'checking' | 'approved' | 'pending' | 'suspended' | 'error';

function Router() {
  const { user, loading, login, logout } = useAuth();
  const [publicScreen, setPublicScreen] = useState<PublicScreen>('welcome');
  const [stage, setStage] = useState<Stage | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [driver, setDriver] = useState<DriverState>('checking');
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
      setTab('home');
      setActiveOrderId(null);
    }
  }, [user]);

  // Called after the PIN step. Only rider accounts may use this app.
  const completeSignIn = async (res: { token: string; user: any }) => {
    setStage(null);
    if (res.user?.role !== 'driver') {
      Alert.alert('Not a rider account', 'This app is for Sokoni Hub riders. Customers use the Sokoni Hub app, and vendors use the web portal.');
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
      </View>
    );
  }

  if (driver === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Could not load your rider profile</Text>
        <Pressable onPress={loadDriver} accessibilityRole="button" style={styles.retry}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
        <Pressable onPress={signOut} accessibilityRole="button" style={{ marginTop: 14 }}>
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

  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: 'home', icon: '🏠', label: 'Home' },
    { id: 'earnings', icon: '💰', label: 'Earnings' },
    { id: 'settings', icon: '⚙️', label: 'Settings' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <ErrorBoundary key={tab}>
          {tab === 'home' && <Home onOpenDelivery={(id) => setActiveOrderId(id)} />}
          {tab === 'earnings' && <Earnings />}
          {tab === 'settings' && <Settings onLogout={signOut} />}
        </ErrorBoundary>
      </View>
      <View style={styles.tabBar}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(t.id)}
              style={styles.tabItem}
            >
              <View style={[styles.tabIconWrap, active && styles.tabActive]}>
                <Text style={styles.tabIcon}>{t.icon}</Text>
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
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
      <AuthProvider>
        <Router />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg, padding: 24 },
  container: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1 },
  errorTitle: { fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 14, textAlign: 'center' },
  retry: { backgroundColor: C.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 25 },
  retryText: { color: '#fff', fontWeight: '900' },
  link: { color: C.primary, fontWeight: '800' },
  tabBar: { flexDirection: 'row', backgroundColor: C.surface, borderTopWidth: 1, borderColor: C.border, paddingBottom: 18, paddingTop: 8 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabIconWrap: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  tabActive: { backgroundColor: C.primarySoft },
  tabIcon: { fontSize: 19 },
  tabLabel: { fontSize: 11, color: C.text2, marginTop: 3, fontWeight: '600' },
  tabLabelActive: { color: C.primary, fontWeight: '900' },
});

registerRootComponent(App);
