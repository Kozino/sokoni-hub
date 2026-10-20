import { registerRootComponent } from 'expo';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/providers/AuthContext';
import { api, setUnauthorizedHandler } from './src/api';
import { usePushToken } from './src/usePushToken';
import { Login } from './src/screens/Login';
import { Pin } from './src/screens/Pin';
import { Home } from './src/screens/Home';
import type { Stage } from './src/screens/types';
import { C } from './src/theme';

function Router() {
  const { user, loading, login, logout } = useAuth();
  const [stage, setStage] = useState<Stage | null>(null);
  const pushToken = usePushToken();

  // Register this phone for order and booking alerts once a vendor is signed in.
  useEffect(() => {
    if (!pushToken || !user) return;
    void api.post('/push/token', { token: pushToken, platform: Platform.OS === 'ios' ? 'ios' : 'android' }).catch(() => {});
  }, [pushToken, user?.id]);

  // A 401 from the API means the session ended (for example, the password changed on another device).
  useEffect(() => {
    setUnauthorizedHandler(() => void logout());
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  if (!user) {
    if (stage) {
      return (
        <Pin
          stage={stage}
          onBack={() => setStage(null)}
          onDone={async (res) => {
            setStage(null);
            if (res.user?.role !== 'vendor') {
              Alert.alert('Not a vendor account', 'This app is for Sokoni Hub vendors. Customers use the Sokoni Hub app, and riders use the rider app.');
              return;
            }
            await login(res.user, res.token);
          }}
        />
      );
    }
    return <Login onStage={setStage} />;
  }

  return <Home />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Router />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
});

registerRootComponent(App);
