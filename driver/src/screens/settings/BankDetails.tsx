import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BuildingLibraryIcon, ShieldCheckIcon } from 'react-native-heroicons/outline';
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
    <View style={{ marginBottom: 15 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={(t) => { onChange(t); setSaved(false); }} placeholderTextColor={C.muted} style={styles.input} {...extra} />
    </View>
  );

  const cleanIban = iban.replace(/\s+/g, '');

  return (
    <View style={styles.page}>
      <ScreenHeader title="Bank information" subtitle="Where your driver earnings are paid" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <View style={styles.bankHero}>
          <View style={styles.bankHeroTop}>
            <View style={styles.bankIcon}><BuildingLibraryIcon size={23} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bankEyebrow}>DRIVER PAYOUT ACCOUNT</Text>
              <Text style={styles.bankName} numberOfLines={1}>{bankName.trim() || 'Bank details not added'}</Text>
            </View>
            <ShieldCheckIcon size={22} color="rgba(255,255,255,0.75)" />
          </View>
          <Text style={styles.accountName}>{accountName.trim() || 'Add the account holder name'}</Text>
          <View style={styles.ibanRow}>
            <Text style={styles.ibanLabel}>IBAN</Text>
            <Text style={styles.ibanValue}>{cleanIban ? `•••• ${cleanIban.slice(-4).toUpperCase()}` : 'Not provided'}</Text>
          </View>
        </View>

        <View style={{ marginVertical: 12 }}><Notice>Use an account in your own name. The account holder must match your Qatar ID.</Notice></View>

        <Card>
          <Text style={styles.formTitle}>Account details</Text>
          <Text style={styles.formSub}>These details are saved directly to your driver profile.</Text>
          <View style={{ height: 18 }} />
          {field('Bank name', bankName, setBankName, { placeholder: 'e.g. Qatar National Bank' })}
          {field('Account holder name', accountName, setAccountName, { placeholder: 'As on your bank account' })}
          {field('IBAN', iban, setIban, { placeholder: 'QA00 XXXX 0000 0000 0000 0000 000', autoCapitalize: 'characters' })}
        </Card>
        {saved ? <View style={{ marginTop: 12 }}><Notice>Bank details saved to your driver profile.</Notice></View> : null}
        <Button title="Save bank details" onPress={save} loading={busy} style={{ marginTop: 16 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16, paddingBottom: 32 },
  bankHero: { backgroundColor: C.primary, borderRadius: 22, padding: 18 },
  bankHeroTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  bankIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' },
  bankEyebrow: { color: 'rgba(255,255,255,0.68)', fontSize: 9, letterSpacing: 0.8, fontWeight: '900' },
  bankName: { color: '#fff', fontSize: 16, fontWeight: '900', marginTop: 4 },
  accountName: { color: '#fff', fontSize: 19, fontWeight: '900', marginTop: 24, letterSpacing: -0.3 },
  ibanRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.16)', paddingTop: 13, marginTop: 15 },
  ibanLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '800' },
  ibanValue: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  formTitle: { color: C.text, fontSize: 16, fontWeight: '900' },
  formSub: { color: C.text2, fontSize: 11, lineHeight: 16, marginTop: 4 },
  label: { fontSize: 11, fontWeight: '900', color: C.text, marginBottom: 7 },
  input: { minHeight: 52, borderRadius: 14, backgroundColor: C.field, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, fontSize: 14, color: C.text },
});
