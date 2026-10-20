import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BuildingLibraryIcon, DocumentArrowUpIcon, QuestionMarkCircleIcon, ArrowRightOnRectangleIcon, TruckIcon, KeyIcon, TrashIcon } from 'react-native-heroicons/outline';
import { api } from '../api';
import { useAuth } from '../providers/AuthContext';
import { Badge, Card, Notice, ScreenHeader } from '../components/UI';
import { errorText } from '../format';
import { C } from '../theme';
import { SettingsRow } from './settings/SettingsRow';
import { VehicleDetails } from './settings/VehicleDetails';
import { BankDetails } from './settings/BankDetails';
import { Documents } from './settings/Documents';
import { HelpSupport } from './settings/HelpSupport';
import { ChangePin } from './settings/ChangePin';
import { DeleteAccount } from './settings/DeleteAccount';
import type { DriverProfile } from './settings/types';

type Page = 'home' | 'vehicle' | 'bank' | 'documents' | 'help' | 'pin' | 'delete';

export function Settings({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  const [page, setPage] = useState<Page>('home');
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ driver: DriverProfile }>('/drivers/me');
      setDriver(res.driver);
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const back = () => setPage('home');

  if (page === 'vehicle' && driver) return <VehicleDetails driver={driver} onBack={back} onSaved={(d) => { setDriver(d); }} />;
  if (page === 'bank' && driver) return <BankDetails driver={driver} onBack={back} onSaved={(d) => { setDriver(d); }} />;
  if (page === 'documents' && driver) return <Documents driver={driver} onBack={back} onSaved={(d) => { setDriver(d); }} />;
  if (page === 'help') return <HelpSupport onBack={back} />;
  if (page === 'pin') return <ChangePin onBack={back} />;
  if (page === 'delete') return <DeleteAccount onBack={back} />;

  const vehicleSummary = driver ? `${driver.vehicle_type} · ${driver.license_plate}` : 'Loading…';
  const bankSummary = driver?.bank_iban ? `${driver.bank_name ?? 'Bank'} · •••• ${driver.bank_iban.slice(-4)}` : 'Add your bank for payouts';
  const docCount = driver ? Object.keys(driver.documents ?? {}).length : 0;
  const docSummary = `${docCount} of 3 uploaded`;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.pad}>
        {error ? <View style={{ marginBottom: 14 }}><Notice tone="error">{error}</Notice></View> : null}

        <Card style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.full_name ?? 'R').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.full_name ?? 'Rider'}</Text>
            <Text style={styles.phone}>{user?.phone ?? ''}</Text>
          </View>
          {driver ? <Badge label={driver.status === 'approved' ? 'Approved' : driver.status} tone={driver.status === 'approved' ? 'green' : 'gold'} /> : <ActivityIndicator color={C.primary} />}
        </Card>

        <Text style={styles.section}>Rider account</Text>
        <Card style={styles.group}>
          <SettingsRow icon={<TruckIcon size={20} color={C.primary} />} title="Vehicle details" subtitle={vehicleSummary} onPress={() => setPage('vehicle')} />
          <SettingsRow icon={<BuildingLibraryIcon size={20} color={C.primary} />} title="Bank information" subtitle={bankSummary} onPress={() => setPage('bank')} />
          <SettingsRow icon={<DocumentArrowUpIcon size={20} color={C.primary} />} title="Upload documents" subtitle={docSummary} onPress={() => setPage('documents')} />
          <SettingsRow icon={<KeyIcon size={20} color={C.primary} />} title="Change PIN" subtitle="Update your 4-digit security PIN" onPress={() => setPage('pin')} last />
        </Card>

        <Text style={styles.section}>Support</Text>
        <Card style={styles.group}>
          <SettingsRow icon={<QuestionMarkCircleIcon size={20} color={C.primary} />} title="Help & support" subtitle="Contact the Sokoni Hub team" onPress={() => setPage('help')} last />
        </Card>

        <Text style={styles.section}>Account</Text>
        <Card style={styles.group}>
          <SettingsRow icon={<TrashIcon size={20} color={C.danger} />} title="Delete account" subtitle="Request permanent deletion" onPress={() => setPage('delete')} danger last />
        </Card>

        <Text style={styles.section}>Session</Text>
        <Card style={styles.group}>
          <SettingsRow icon={<ArrowRightOnRectangleIcon size={20} color={C.danger} />} title="Sign out" onPress={onLogout} danger last />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 18, paddingBottom: 32 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  name: { fontSize: 17, fontWeight: '900', color: C.text },
  phone: { fontSize: 13, color: C.text2, marginTop: 2 },
  section: { fontSize: 13, fontWeight: '800', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 10 },
  group: { padding: 0, overflow: 'hidden' },
});
