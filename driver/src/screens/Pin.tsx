import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BackspaceIcon, CheckIcon } from 'react-native-heroicons/outline';
import { api, ApiError } from '../api';
import { BrandBlock, Button, Field, Notice, Topbar } from '../components/AuthUI';
import { C } from '../theme';
import type { Stage } from './types';

export function Pin({ stage, onBack, onDone }: { stage: Stage; onBack: () => void; onDone: (res: { token: string; user: any }) => void }) {
  const setup = stage.kind === 'setup';
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  // Setup asks for the PIN twice, so a typo cannot lock the rider out.
  const [firstPin, setFirstPin] = useState<string | null>(null);

  const press = (key: string) => {
    if (key === 'back') return setPin((v) => v.slice(0, -1));
    if (pin.length < 4) setPin((v) => v + key);
  };

  const submit = async () => {
    if (pin.length !== 4) return Alert.alert('Enter your PIN', 'Your PIN must contain exactly four digits.');
    if (setup && firstPin === null) {
      setFirstPin(pin);
      setPin('');
      return;
    }
    if (setup && pin !== firstPin) {
      Alert.alert('PINs do not match', 'Enter the same four digits both times.');
      setFirstPin(null);
      setPin('');
      return;
    }
    setBusy(true);
    try {
      const res = setup
        ? await api.post<any>('/auth/pin/setup', { setup_token: stage.token, pin, ...(stage.needsEmail && email ? { email: email.trim() } : {}) })
        : await api.post<any>('/auth/login/pin', { pin_token: stage.token, pin });
      onDone(res);
    } catch (e) {
      Alert.alert(setup ? 'Could not save PIN' : 'PIN not accepted', e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Topbar onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <BrandBlock
          title={setup ? 'Create Security PIN' : 'Enter Security PIN'}
          intro={setup ? (firstPin === null ? 'Choose a unique 4-digit PIN for future sign-ins.' : 'Enter the same PIN again to confirm.') : 'Enter the four-digit PIN that protects your driver account.'}
        />

        <View style={styles.card}>
          {setup && stage.needsEmail ? (
            <Field label="Recovery email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
          ) : null}

          <View style={styles.boxes}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.box, { borderColor: i < pin.length ? C.primary : C.border }]}>
                <Text style={styles.dot}>{pin[i] ? '•' : ''}</Text>
              </View>
            ))}
          </View>

          <Notice>Your PIN is checked securely on Sokoni Hub. We never store the digits on this device.</Notice>

          <Button variant="primary" loading={busy} onPress={submit}>{setup ? (firstPin === null ? 'Next' : 'Confirm PIN') : 'Verify and continue'}</Button>

          <View style={styles.keypad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'].map((key) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={key === 'back' ? 'Delete digit' : key === 'ok' ? 'Submit PIN' : key}
                onPress={() => (key === 'ok' ? submit() : press(key))}
                style={[styles.key, { backgroundColor: key === 'ok' ? C.primarySoft : C.surface }]}
              >
                {key === 'back' ? <BackspaceIcon size={23} color={C.text} /> : key === 'ok' ? <CheckIcon size={25} color={C.primary} /> : (
                  <Text style={[styles.keyText, { color: C.text }]}>{key}</Text>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  card: { marginHorizontal: 16, marginTop: 24, borderRadius: 22, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: 16 },
  boxes: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 16 },
  box: { height: 55, width: 55, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  dot: { fontSize: 26, color: C.primary, fontWeight: '900' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, justifyContent: 'space-between', marginTop: 18 },
  key: { width: '30.5%', height: 50, borderRadius: 15, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 24, fontWeight: '800' },
});
