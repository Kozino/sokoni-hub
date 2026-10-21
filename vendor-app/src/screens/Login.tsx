import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, ApiError } from '../api';
import { BrandBlock, Button, Field, normalizeQatarPhone, PhoneField, Topbar } from '../components/AuthUI';
import { C } from '../theme';
import type { Stage } from './types';
import { fw } from '../ui/type';

export function Login({ onStage }: { onStage: (stage: Stage) => void }) {
  const [phoneMode, setPhoneMode] = useState(true);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!identifier.trim() || !password) {
      return Alert.alert('Enter your details', `Enter your ${phoneMode ? 'phone number' : 'email address'} and password.`);
    }
    const value = phoneMode ? normalizeQatarPhone(identifier) : identifier.trim();
    setBusy(true);
    try {
      const res = await api.post<any>('/auth/login', { identifier: value, password });
      if (res.pin_required) onStage({ kind: 'pin', token: res.pin_token, name: res.full_name });
      else if (res.pin_setup_required) onStage({ kind: 'setup', token: res.setup_token, needsEmail: !!res.needs_email, name: res.full_name });
      else Alert.alert('Sign-in unavailable', 'This account needs to finish setup on the Sokoni Hub website.');
    } catch (e) {
      Alert.alert('Sign-in failed', e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
      <Topbar />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <BrandBlock title="Welcome Back!" subtitle="Karibu tena • Kaabo • Nno" intro="Sign in to your vendor account to receive orders and bookings." />

        <View style={styles.card}>
          <View style={styles.modeToggle}>
            <Pressable accessibilityRole="button" onPress={() => setPhoneMode(true)} style={[styles.mode, phoneMode && styles.modeActive]}>
              <Text style={[styles.modeText, phoneMode && styles.modeTextActive]}>Qatar Phone</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setPhoneMode(false)} style={[styles.mode, !phoneMode && styles.modeActive]}>
              <Text style={[styles.modeText, !phoneMode && styles.modeTextActive]}>Email Address</Text>
            </Pressable>
          </View>

          {phoneMode ? (
            <>
              <Text style={styles.label}>Mobile Number</Text>
              <PhoneField value={identifier} onChangeText={setIdentifier} />
            </>
          ) : (
            <Field label="Email Address" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
          )}

          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder="Your secure password" />

          <View style={styles.note}>
            <Text style={styles.noteText}>After your password, we will ask for your four-digit PIN.</Text>
          </View>

          <Button variant="gold" loading={busy} onPress={submit}>Sign In to Sokoni Vendor</Button>

        </View>

        <Text style={styles.footer}>Riders use the Sokoni Driver app. Customers use the Sokoni Hub app.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  card: { marginHorizontal: 17, marginTop: 27, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: 16, shadowColor: '#17291F', shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 },
  modeToggle: { height: 47, borderRadius: 24, padding: 4, flexDirection: 'row', backgroundColor: C.surface2, marginBottom: 19 },
  mode: { flex: 1, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  modeActive: { backgroundColor: C.primary },
  modeText: { fontSize: 13, ...fw('900'), color: C.text2 },
  modeTextActive: { color: '#fff' },
  label: { fontSize: 12, ...fw('900'), marginBottom: 7, color: C.text },
  note: { backgroundColor: C.primarySoft, borderRadius: 12, padding: 12, marginBottom: 4 },
  noteText: { fontSize: 13, color: C.primary, ...fw('600') },
  footer: { textAlign: 'center', fontSize: 12, marginTop: 24, color: C.text2, textDecorationLine: 'underline' },
});
