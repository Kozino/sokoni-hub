import { registerRootComponent } from 'expo';
import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/providers/AuthContext';
import { Login } from './src/screens/Login';
import { Register } from './src/screens/Register';
import { Home } from './src/screens/Home';
import { Earnings } from './src/screens/Earnings';
import { Settings } from './src/screens/Settings';
import { ActiveDelivery } from './src/screens/ActiveDelivery';

function Router() {
  const { user, loading } = useAuth();
  const [screen, setScreen] = useState<'login' | 'register' | 'home' | 'earnings' | 'settings' | 'delivery'>('home');
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#126D4B" /></View>;
  }

  if (!user) {
    if (screen === 'register') return <Register onNav={setScreen} />;
    return <Login onNav={setScreen} />;
  }

  // Bottom Tab Bar for Main Screens
  const BottomNav = () => (
    <View style={styles.tabBar}>
      <TabButton icon="🏠" label="Home" active={screen === 'home'} onPress={() => setScreen('home')} />
      <TabButton icon="💰" label="Earnings" active={screen === 'earnings'} onPress={() => setScreen('earnings')} />
      <TabButton icon="⚙️" label="Settings" active={screen === 'settings'} onPress={() => setScreen('settings')} />
    </View>
  );

  return (
    <View style={styles.container}>
      {screen === 'home' && <Home onStartDelivery={(id) => { setActiveOrderId(id); setScreen('delivery'); }} />}
      {screen === 'earnings' && <Earnings />}
      {screen === 'settings' && <Settings onLogout={() => setScreen('login')} />}
      
      {screen === 'delivery' && activeOrderId && (
        <ActiveDelivery orderId={activeOrderId} onComplete={() => setScreen('home')} onCancel={() => setScreen('home')} />
      )}

      {screen !== 'delivery' && <BottomNav />}
    </View>
  );
}

const TabButton = ({ icon, label, active, onPress }: any) => (
  <View style={styles.tabItem} onTouchEnd={onPress}>
    <View style={[styles.tabIconWrap, active && styles.tabActive]}><React.Text style={styles.tabIcon}>{icon}</React.Text></View>
    <React.Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</React.Text>
  </View>
);

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <AuthProvider>
        <Router />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#F8F8FD' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee', paddingBottom: Platform.OS === 'ios' ? 24 : 10, paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabIconWrap: { padding: 8, borderRadius: 20 },
  tabActive: { backgroundColor: '#E8F5E9' },
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: 11, color: '#666', marginTop: 4, fontWeight: '500' },
  tabLabelActive: { color: '#126D4B', fontWeight: '700' }
});

registerRootComponent(App);
