import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../api';
import { Button, Card, Notice, ScreenHeader } from '../../components/UI';
import { errorText } from '../../format';
import { C } from '../../theme';
import type { DriverProfile } from './types';

export function BankDetails({ driver, onBack, onSaved }: { driver: DriverProfile; onBack: () => void; onSaved: (d: DriverProfile) => void }) {
  const [bankName, setBankName] = useState(driver.bank_name ?? '');
  const [accountName, setAccountName] = useState(driver.bank_account_name ?? '');
  const [iban, setIban] = useState(driver.bank_iban ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (bankName.trim().length < 2 || accountName.trim().length < 2) {
      return Alert.alert('Bank details', 'Enter your bank name and the account holder name.');
    }
    const cleanIban = iban.replace(/\s+/g, '');
    if (cleanIban.length < 10) return Alert.alert('IBAN', 'Enter the IBAN from your bank statement.');
    setBusy(true);
    try {
      const res = await api.patch<{ driver: DriverProfile }>('/drivers/me', {
        bank_name: bankName.trim(),
        bank_account_name: accountName.trim(),
        bank_iban: cleanIban,
      });
      onSaved(res.driver);
      setSaved(true);
    } catch (e) {
      Alert.alert('Could not save', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, value: string, onChange: (t: string) => void, extra: object = {}) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={(t) => { onChange(t); setSaved(false); }} placeholderTextColor={C.muted} style={styles.input} {...extra} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Bank information" subtitle="Where your earnings are paid" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Notice>Use an account in your own name. The account holder must match your Qatar ID.</Notice>
        <View style={{ height: 14 }} />
        <Card>
          {field('Bank name', bankName, setBankName, { placeholder: 'e.g. Qatar National Bank' })}
          {field('Account holder name', accountName, setAccountName, { placeholder: 'As on your bank account' })}
          {field('IBAN', iban, setIban, { placeholder: 'QA00 XXXX 0000 0000 0000 0000 000', autoCapitalize: 'characters' })}
        </Card>
        {saved ? <View style={{ marginTop: 14 }}><Notice>Bank details saved.</Notice></View> : null}
        <View style={{ marginTop: 18 }}>
          <Button title="Save bank details" onPress={save} loading={busy} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 18, paddingBottom: 32 },
  label: { fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 7 },
  input: { minHeight: 50, borderRadius: 12, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, fontSize: 15, color: C.text },
});
