import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import {
  ArrowRightOnRectangleIcon,
  BuildingLibraryIcon,
  CheckBadgeIcon,
  ChevronRightIcon,
  DocumentArrowUpIcon,
  DocumentTextIcon,
  KeyIcon,
  QuestionMarkCircleIcon,
  ShieldCheckIcon,
  TrashIcon,
  TruckIcon,
} from 'react-native-heroicons/outline';
import { api } from '../api';
import { useAuth } from '../providers/AuthContext';
import { Badge, Card, DriverTopbar, Notice, PageHeading } from '../components/UI';
import { errorText } from '../format';
import { C } from '../theme';
import { SettingsRow } from './settings/SettingsRow';
import { VehicleDetails } from './settings/VehicleDetails';
import { BankDetails } from './settings/BankDetails';
import { Documents } from './settings/Documents';
import { HelpSupport } from './settings/HelpSupport';
import { ChangePin } from './settings/ChangePin';
import { DeleteAccount } from './settings/DeleteAccount';
import { DOCUMENT_KEYS, type DriverProfile } from './settings/types';

type Page = 'home' | 'vehicle' | 'bank' | 'documents' | 'help' | 'pin' | 'delete';

export function Settings({ online, onLogout }: { online?: boolean; onLogout: () => void }) {
  const { user } = useAuth();
  const [page, setPage] = useState<Page>('home');
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ driver: DriverProfile }>('/drivers/me');
      setDriver(res.driver);
      setError('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const back = () => setPage('home');

  if (page === 'vehicle' && driver) return <VehicleDetails driver={driver} onBack={back} onSaved={(d) => setDriver(d)} />;
  if (page === 'bank' && driver) return <BankDetails driver={driver} onBack={back} onSaved={(d) => setDriver(d)} />;
  if (page === 'documents' && driver) return <Documents driver={driver} onBack={back} onSaved={(d) => setDriver(d)} />;
  if (page === 'help') return <HelpSupport onBack={back} />;
  if (page === 'pin') return <ChangePin onBack={back} />;
  if (page === 'delete') return <DeleteAccount onBack={back} />;

  const docCount = driver ? DOCUMENT_KEYS.filter((doc) => !!driver.documents?.[doc.key]).length : 0;
  const bankSummary = driver?.bank_iban ? `${driver.bank_name ?? 'Bank'} · •••• ${driver.bank_iban.slice(-4)}` : 'Add your bank for payouts';

  return (
    <View style={styles.page}>
      <DriverTopbar online={driver?.is_online ?? online} name={user?.full_name} />
      <ScrollView
        contentContainerStyle={styles.pad}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}
      >
        <PageHeading
          eyebrow="COURIER PORTAL"
          title="Driver Profile & Settings"
          subtitle="Vehicle, licence, payout details & delivery preferences"
          right={driver ? <Badge label={driver.is_online ? 'Active & ready' : 'Approved'} /> : undefined}
        />

        {error ? <View style={{ marginBottom: 14 }}><Notice tone="error">{error}</Notice></View> : null}

        <Card style={styles.profile}>
          <View style={styles.profileTop}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{(user?.full_name ?? 'D').charAt(0).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>{user?.full_name ?? 'Driver'}</Text>
                {driver?.status === 'approved' ? <CheckBadgeIcon size={18} color={C.primary} /> : null}
              </View>
              <Text style={styles.phone}>{user?.phone ? (user.phone.startsWith('+') ? user.phone : `+${user.phone}`) : 'Sokoni Hub logistics partner'}</Text>
              <Text style={styles.driverId} numberOfLines={1}>{driver ? `Driver ID · ${driver.id.slice(0, 8).toUpperCase()}` : 'Loading driver ID…'}</Text>
            </View>
            {!driver ? <ActivityIndicator color={C.primary} /> : null}
          </View>
          <View style={styles.profileStatus}>
            <ShieldCheckIcon size={17} color={C.primary} />
            <Text style={styles.profileStatusText}>{driver?.status === 'approved' ? 'Verified & approved logistics partner' : 'Checking driver verification…'}</Text>
          </View>
        </Card>

        <SectionHeading icon={<TruckIcon size={20} color={C.primary} />} title="Vehicle & equipment" action="Edit" onPress={() => driver && setPage('vehicle')} />
        <Card>
          <Pressable accessibilityRole="button" onPress={() => driver && setPage('vehicle')} style={({ pressed }) => [styles.vehicleBox, pressed && { opacity: 0.65 }]}>
            <View style={styles.vehicleIcon}><TruckIcon size={25} color={C.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Registered vehicle</Text>
              <Text style={styles.vehicleName}>{driver ? driver.vehicle_type : 'Loading…'}</Text>
              <Text style={styles.fieldSub}>Used to match suitable delivery orders</Text>
            </View>
            <View style={styles.plateBox}>
              <Text style={styles.plateLabel}>QATAR PLATE</Text>
              <Text style={styles.plateValue}>{driver?.license_plate || '—'}</Text>
            </View>
          </Pressable>
        </Card>

        <SectionHeading icon={<ShieldCheckIcon size={20} color={C.primary} />} title="Legal & compliance" meta={`${docCount} of ${DOCUMENT_KEYS.length} received`} />
        <Card style={styles.group}>
          {DOCUMENT_KEYS.map((doc, index) => {
            const uploaded = !!driver?.documents?.[doc.key];
            return (
              <Pressable key={doc.key} accessibilityRole="button" onPress={() => driver && setPage('documents')} style={({ pressed }) => [styles.docRow, index < DOCUMENT_KEYS.length - 1 && styles.rowBorder, pressed && { backgroundColor: C.surface2 }]}>
                <View style={[styles.docIcon, uploaded && { backgroundColor: C.primarySoft }]}><DocumentTextIcon size={20} color={uploaded ? C.primary : C.text2} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docTitle}>{doc.label}</Text>
                  <Text style={styles.docSub}>{!driver ? 'Checking document record…' : uploaded ? 'Document securely uploaded' : 'Upload required for your records'}</Text>
                </View>
                <Badge label={!driver ? 'Loading' : uploaded ? 'Received' : 'Required'} tone={!driver ? 'grey' : uploaded ? 'green' : 'gold'} />
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="button" onPress={() => driver && setPage('documents')} style={({ pressed }) => [styles.manageDocs, pressed && { opacity: 0.65 }]}>
            <DocumentArrowUpIcon size={17} color={C.primary} />
            <Text style={styles.manageDocsText}>Manage documents</Text>
            <ChevronRightIcon size={16} color={C.primary} />
          </Pressable>
        </Card>

        <SectionHeading icon={<BuildingLibraryIcon size={20} color={C.primary} />} title="Payout & security" />
        <Card style={styles.group}>
          <SettingsRow icon={<BuildingLibraryIcon size={20} color={C.primary} />} title="Bank information" subtitle={bankSummary} onPress={() => driver && setPage('bank')} />
          <SettingsRow icon={<KeyIcon size={20} color={C.primary} />} title="Change security PIN" subtitle="Update your 4-digit sign-in PIN" onPress={() => setPage('pin')} last />
        </Card>

        <SectionHeading icon={<QuestionMarkCircleIcon size={20} color={C.primary} />} title="Driver support" />
        <Card style={styles.group}>
          <SettingsRow icon={<QuestionMarkCircleIcon size={20} color={C.primary} />} title="Help & WhatsApp dispatch" subtitle="Contact the Sokoni Hub driver team" onPress={() => setPage('help')} last />
        </Card>

        <Card style={[styles.group, { marginTop: 18 }]}>
          <SettingsRow icon={<TrashIcon size={20} color={C.danger} />} title="Delete driver account" subtitle="Request permanent account deletion" onPress={() => setPage('delete')} danger last />
        </Card>

        <Pressable accessibilityRole="button" onPress={onLogout} style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.65 }]}>
          <ArrowRightOnRectangleIcon size={19} color={C.danger} />
          <Text style={styles.signOutText}>Sign out of driver account</Text>
        </Pressable>
        <Text style={styles.version}>Sokoni Logistics Driver{Constants.expoConfig?.version ? ` · v${Constants.expoConfig.version}` : ''} · Qatar</Text>
      </ScrollView>
    </View>
  );
}

function SectionHeading({ icon, title, meta, action, onPress }: { icon: React.ReactNode; title: string; meta?: string; action?: string; onPress?: () => void }) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionIcon}>{icon}</View>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}><Text style={styles.sectionAction}>{action}</Text></Pressable>
      ) : meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16, paddingBottom: 32 },
  profile: { padding: 16 },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 58, height: 58, borderRadius: 19, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 23, fontWeight: '900' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { flexShrink: 1, fontSize: 18, fontWeight: '900', color: C.text, letterSpacing: -0.25 },
  phone: { fontSize: 12, color: C.text2, marginTop: 3 },
  driverId: { fontSize: 10, color: C.text2, marginTop: 4, fontWeight: '600' },
  profileStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.primarySoft, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, marginTop: 14 },
  profileStatusText: { flex: 1, color: C.primary, fontSize: 11, fontWeight: '700' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 22, marginBottom: 10, paddingHorizontal: 2 },
  sectionIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '900', color: C.text, letterSpacing: -0.15 },
  sectionMeta: { color: C.text2, fontSize: 10, fontWeight: '700' },
  sectionAction: { color: C.primary, fontSize: 11, fontWeight: '900', padding: 4 },
  vehicleBox: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  vehicleIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { color: C.text2, fontSize: 10, fontWeight: '600' },
  vehicleName: { color: C.text, fontSize: 15, fontWeight: '900', marginTop: 3 },
  fieldSub: { color: C.text2, fontSize: 10, lineHeight: 14, marginTop: 3 },
  plateBox: { backgroundColor: C.infoSoft, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'flex-end', maxWidth: 110 },
  plateLabel: { color: C.text2, fontSize: 8, fontWeight: '700' },
  plateValue: { color: C.text, fontSize: 13, fontWeight: '900', marginTop: 3 },
  group: { padding: 0, overflow: 'hidden' },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  docIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  docTitle: { color: C.text, fontSize: 13, fontWeight: '800' },
  docSub: { color: C.text2, fontSize: 10, marginTop: 3 },
  manageDocs: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, backgroundColor: C.primarySoft },
  manageDocsText: { color: C.primary, fontSize: 11, fontWeight: '900' },
  signOut: { minHeight: 52, borderRadius: 16, backgroundColor: C.dangerSoft, marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  signOutText: { color: C.danger, fontSize: 13, fontWeight: '900' },
  version: { color: C.text2, fontSize: 10, textAlign: 'center', marginTop: 18 },
});
