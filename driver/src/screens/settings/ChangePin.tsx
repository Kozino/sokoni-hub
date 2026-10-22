import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, authStorage } from '../../api';
import { Button, Card, Notice, ScreenHeader } from '../../components/UI';
import { errorText } from '../../format';
import { C } from '../../theme';

/** Rider changes the 4-digit security PIN. The current PIN is required, like the buyer app. */
export function ChangePin({ onBack }: { onBack: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const digits = (value: string) => value.replace(/\D/g, '').slice(0, 4);

  const save = async () => {
    if (current.length !== 4) return Alert.alert('Current PIN', 'Enter your current 4-digit PIN.');
    if (next.length !== 4) return Alert.alert('New PIN', 'Your new PIN must be exactly 4 digits.');
    if (next !== confirm) return Alert.alert('Mismatch', 'The new PINs do not match.');
    if (next === current) return Alert.alert('New PIN', 'Choose a PIN that is different from your current one.');
    setBusy(true);
    try {
      const res = await api.post<{ token?: string }>('/auth/pin/change', { current_pin: current, new_pin: next });
      // The server may return a refreshed session token. Keep the rider signed in on this device.
      if (res.token) await authStorage.save(res.token);
      setCurrent('');
      setNext('');
      setConfirm('');
      setSaved(true);
    } catch (e) {
      Alert.alert('Could not change PIN', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, value: string, onChange: (t: string) => void) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(t) => { onChange(digits(t)); setSaved(false); }}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={4}
        placeholder="••••"
        placeholderTextColor={C.muted}
        style={styles.input}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Change PIN" subtitle="Your 4-digit security PIN" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <View style={{ marginBottom: 12 }}><Notice>Choose a unique PIN and never share it with customers or merchants.</Notice></View>
        <Card>
          {field('Current PIN', current, setCurrent)}
          {field('New PIN', next, setNext)}
          {field('Confirm new PIN', confirm, setConfirm)}
        </Card>
        {saved ? <View style={{ marginTop: 14 }}><Notice>Your PIN has been changed.</Notice></View> : null}
        <View style={{ marginTop: 18 }}>
          <Button title="Update PIN" onPress={save} loading={busy} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 32 },
  label: { fontSize: 11, fontWeight: '900', color: C.text, marginBottom: 7 },
  input: { minHeight: 52, borderRadius: 14, backgroundColor: C.field, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, fontSize: 15, color: C.text, letterSpacing: 6 },
});
