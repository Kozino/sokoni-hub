import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, ApiError } from '../api';
import { BrandBlock, Button, Field, normalizeQatarPhone, PhoneField, Topbar, Notice } from '../components/AuthUI';
import { C } from '../theme';

const VEHICLES = ['Motorcycle', 'Car', 'Van'] as const;
type Vehicle = (typeof VEHICLES)[number];

export function Register({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [vehicle, setVehicle] = useState<Vehicle>('Motorcycle');
  const [plate, setPlate] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async () => {
    const digits = normalizeQatarPhone(phone);
    if (name.trim().length < 2) return Alert.alert('Full name', 'Enter your full name.');
    if (digits.length !== 11) return Alert.alert('Phone number', 'Enter a valid 8-digit Qatar mobile number.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return Alert.alert('Email', 'Enter a valid email address.');
    if (password.length < 12) return Alert.alert('Password', 'Your password must be at least 12 characters.');
    if (!/^\d{4}$/.test(pin)) return Alert.alert('PIN', 'Your PIN must be exactly four digits.');
    if (plate.trim().length < 2) return Alert.alert('Vehicle', 'Enter your licence plate or vehicle ID.');

    setBusy(true);
    try {
      const res = await api.post<any>('/auth/register', {
        full_name: name.trim(),
        phone: digits,
        email: email.trim().toLowerCase(),
        password,
        pin,
        role: 'driver',
        vehicle_type: vehicle,
        license_plate: plate.trim(),
      });
      if (res.verification_required) setSentTo(res.email ?? email.trim());
      else onDone();
    } catch (e) {
      Alert.alert('Application not sent', e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Topbar onBack={onBack} />
        <View style={styles.success}>
          <View style={styles.successIcon}><Text style={{ fontSize: 34 }}>📧</Text></View>
          <Text style={styles.successTitle}>Check your email</Text>
          <Text style={styles.successText}>We sent a verification link to {sentTo}. Verify your email, then sign in. Our team will review your rider application before you can go online.</Text>
          <Button variant="primary" onPress={onDone} style={{ alignSelf: 'stretch' }}>Back to sign in</Button>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
      <Topbar onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <BrandBlock title="Apply to Drive" subtitle="Join the Sokoni Hub fleet" intro="Tell us a little about you and your vehicle. Every rider is verified before going online." />

        <View style={styles.card}>
          <Field label="Full name" value={name} onChangeText={setName} placeholder="As on your ID" autoComplete="name" />

          <Text style={styles.label}>Mobile number</Text>
          <PhoneField value={phone} onChangeText={setPhone} />

          <Field label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 12 characters" autoComplete="new-password" />
          <Field label="4-digit PIN" value={pin} onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4} placeholder="Used for quick sign-in" />

          <Text style={styles.label}>Vehicle type</Text>
          <View style={styles.chips}>
            {VEHICLES.map((v) => (
              <Pressable key={v} accessibilityRole="button" onPress={() => setVehicle(v)} style={[styles.chip, vehicle === v && styles.chipActive]}>
                <Text style={[styles.chipText, vehicle === v && styles.chipTextActive]}>{v}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ height: 15 }} />
          <Field label="Licence plate / vehicle ID" value={plate} onChangeText={setPlate} autoCapitalize="characters" placeholder="e.g. 12345 ABC" />

          <Notice>Your PIN and password are never stored on this device.</Notice>

          <Button variant="gold" loading={busy} onPress={submit}>Submit application</Button>
          <View style={{ height: 10 }} />
          <Button variant="secondary" onPress={onBack}>I already have an account</Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  card: { marginHorizontal: 17, marginTop: 24, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: 16 },
  label: { fontSize: 12, fontWeight: '900', marginBottom: 7, color: C.text },
  chips: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  chip: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', backgroundColor: C.field },
  chipActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
  chipText: { fontWeight: '700', color: C.text2 },
  chipTextActive: { color: C.primary },
  success: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 14 },
  successIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 24, fontWeight: '900', color: C.text },
  successText: { fontSize: 15, lineHeight: 22, color: C.text2, textAlign: 'center', marginBottom: 12 },
});
