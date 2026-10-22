import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, ApiError } from '../api';
import { Banner, Btn, Card, Icon, SubBar } from '../ui/kit';
import { C } from '../theme';
import { fw } from '../ui/type';
import { qar } from '../format';

/**
 * Request a payout to the vendor's bank account through POST /wallet/payout.
 * The server re-checks the balance, the IBAN and any open Sokoni Hub bills, and its messages are shown as they are.
 */
export function WithdrawSheet({
  visible,
  available,
  bankLabel,
  hasBank,
  onClose,
  onDone,
}: {
  visible: boolean;
  available: number;
  bankLabel: string;
  hasBank: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const value = Number(amount.replace(/,/g, '').trim());
  const valid = amount.trim() !== '' && Number.isFinite(value) && value > 0 && value <= available;

  const close = () => {
    setAmount('');
    setError('');
    onClose();
  };

  const submit = async () => {
    setError('');
    if (!hasBank) {
      setError('Add your bank IBAN on the Sokoni Hub website first, then come back to withdraw.');
      return;
    }
    if (!(value > 0)) {
      setError('Enter an amount greater than 0.');
      return;
    }
    if (value > available) {
      setError(`That is more than your available balance of ${qar(available)}.`);
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ message?: string }>('/wallet/payout', { amount: Number(value.toFixed(2)) });
      setAmount('');
      onDone(res?.message || 'Payout requested successfully.');
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : e?.message || 'Could not request the payout. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="pageSheet">
      <View style={styles.screen}>
        <SubBar title="Withdraw" onBack={close} />
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={styles.label}>Available to withdraw</Text>
            <Text style={styles.big}>{qar(available)}</Text>
            <Text style={styles.small}>Paid to: {hasBank ? bankLabel : 'No bank account added yet'}</Text>
          </Card>

          {!hasBank ? <Banner tone="error">Add your bank IBAN on the Sokoni Hub website first. You can then withdraw from here.</Banner> : null}

          <Card>
            <Text style={styles.label}>Amount (QAR)</Text>
            <View style={styles.inputRow}>
              <TextInput
                accessibilityLabel="Amount in QAR"
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9.,]/g, ''))}
                placeholder="0.00"
                placeholderTextColor={C.muted}
                keyboardType="decimal-pad"
                editable={hasBank && !busy}
                style={styles.input}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Withdraw full available balance"
                disabled={!hasBank || available <= 0 || busy}
                onPress={() => setAmount(available.toFixed(2))}
                style={[styles.allBtn, (!hasBank || available <= 0) && { opacity: 0.4 }]}
              >
                <Text style={styles.allText}>All</Text>
              </Pressable>
            </View>
            {error ? <Banner tone="error">{error}</Banner> : null}
          </Card>

          <Btn
            label="Request payout"
            icon="arrow-up-right"
            onPress={submit}
            loading={busy}
            disabled={!hasBank || !valid || busy}
          />
          <Text style={styles.note}>
            Payouts go to the bank account on your profile. Booking fees you owe Sokoni Hub are taken from your balance first.
          </Text>
          <View style={styles.hint}>
            <Icon name="shield-check" size={14} color={C.primary} />
            <Text style={styles.hintText}>The amount is checked again on the server before it is sent.</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 12, gap: 12, paddingBottom: 32 },
  label: { fontSize: 10, ...fw('800'), color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  big: { fontSize: 22, ...fw('800'), color: C.text, marginTop: 2 },
  small: { fontSize: 11, color: C.text2, marginTop: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  input: { flex: 1, height: 40, borderRadius: 11, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, paddingHorizontal: 12, fontSize: 15, ...fw('800'), color: C.text },
  allBtn: { height: 40, paddingHorizontal: 14, borderRadius: 11, backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.primaryLine, alignItems: 'center', justifyContent: 'center' },
  allText: { fontSize: 12, ...fw('800'), color: C.primaryDeep },
  note: { fontSize: 11, color: C.muted, lineHeight: 16 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hintText: { fontSize: 11, color: C.text2, flex: 1 },
});
