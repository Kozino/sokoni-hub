import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { api, ApiError } from '../api';
import { WEB_URL } from '../config';
import { checkPush, enablePush, openNotificationSettings, PushState } from '../usePushToken';
import { Banner, Btn, Card, Group, Icon, Pill, Row, ScreenHeader } from '../ui/kit';
import { C, TONES, Tone } from '../theme';
import { fw } from '../ui/type';
import { useVendor, Vendor } from '../providers/VendorContext';
import { qar, initialsOf } from '../format';
import { AccountPages } from './AccountPages';

type Page = 'home' | 'store' | 'services' | 'earnings';

type Wallet = { wallet_available: number | string; wallet_pending: number | string; bank_iban?: string | null; bank_name?: string | null; bank_account_name?: string | null };

const VERIFY_LABEL: Record<Vendor['status'], { label: string; tone: Tone; icon: 'check-badge' | 'clock' | 'x-circle' | 'no-symbol' }> = {
  verified: { label: 'Verified', tone: 'green', icon: 'check-badge' },
  pending: { label: 'Pending verification', tone: 'amber', icon: 'clock' },
  rejected: { label: 'Not approved', tone: 'red', icon: 'x-circle' },
  suspended: { label: 'Suspended', tone: 'red', icon: 'no-symbol' },
};

export function Account({ onSignOut }: { onSignOut: () => void }) {
  const { vendor, setVendor, go } = useVendor();
  const [page, setPage] = useState<Page>('home');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletError, setWalletError] = useState('');
  const [listings, setListings] = useState<{ kind: string; status: string }[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [push, setPush] = useState<PushState | null>(null);

  useEffect(() => {
    void checkPush().then(setPush).catch(() => {});
  }, []);

  useEffect(() => {
    api.get<{ wallet: Wallet }>('/wallet')
      .then((r) => setWallet(r.wallet))
      .catch((e: any) => setWalletError(e?.message || 'Could not load your balance.'));
    api.get<{ listings: { kind: string; status: string }[] }>('/listings/mine/all')
      .then((r) => setListings(r.listings))
      .catch(() => setListings([]));
  }, []);

  const fixPush = async () => {
    if (push?.canOpenSettings) return openNotificationSettings();
    setPush(await enablePush());
  };

  const toggleAlerts = async (enabled: boolean) => {
    if (!vendor) return;
    const previous = vendor.alerts_enabled;
    setVendor({ ...vendor, alerts_enabled: enabled });
    setSaving(true);
    setError('');
    try {
      await api.put('/vendors/me/alerts', { enabled });
    } catch (e: any) {
      setVendor({ ...vendor, alerts_enabled: previous }); // Put the switch back if the change did not save.
      setError(e instanceof ApiError ? e.message : 'Could not change alerts. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You will need your password or PIN to sign in again.', [
      { text: 'Stay signed in', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: onSignOut },
    ]);
  };

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const name = vendor?.business_name || 'Your store';
  const status = vendor ? VERIFY_LABEL[vendor.status] : null;
  const services = (listings || []).filter((l) => l.kind === 'service' && l.status !== 'removed').length;
  const products = (listings || []).filter((l) => l.kind === 'product' && l.status !== 'removed').length;
  const iban = wallet?.bank_iban ? `•••• ${wallet.bank_iban.replace(/\s/g, '').slice(-4)}` : null;

  if (page !== 'home') {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Account" subtitle={name} />
        <AccountPages page={page} onBack={() => setPage('home')} vendor={vendor} wallet={wallet} walletError={walletError} />
      </View>
    );
  }

  if (!vendor) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Vendor Profile" subtitle="Business settings, catalog & payouts" />
        <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Vendor Profile" subtitle="Business settings, catalog & payouts" />

      <ScrollView style={styles.frame} contentContainerStyle={styles.body}>
        {error ? <Banner tone="error">{error}</Banner> : null}

        <Card style={styles.profile}>
          <View style={styles.profileTop}>
            {vendor.logo_url ? (
              <Image source={{ uri: vendor.logo_url }} style={styles.logo} />
            ) : (
              <View style={styles.logoFallback}>
                <Text style={styles.logoInitials}>{initialsOf(name)}</Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={styles.name} numberOfLines={2}>{name}</Text>
              <Text style={styles.idLine} numberOfLines={1}>
                {vendor.city ? `${vendor.city}, ${vendor.country || 'Qatar'}` : vendor.country || 'Qatar'}
              </Text>
              {status ? <Pill label={status.label} tone={status.tone} icon={status.icon} /> : null}
            </View>
          </View>
          <View style={styles.ratingBar}>
            <Icon name="star" size={18} color={C.gold} solid />
            {Number(vendor.rating_count || 0) > 0 ? (
              <Text style={styles.ratingText}>
                {Number(vendor.rating_avg || 0).toFixed(1)} <Text style={styles.ratingMuted}>({vendor.rating_count} {vendor.rating_count === 1 ? 'review' : 'reviews'})</Text>
              </Text>
            ) : (
              <Text style={styles.ratingMuted}>No reviews yet</Text>
            )}
          </View>
        </Card>

        <Card>
          <View style={styles.sectionHead}>
            <View style={styles.sectionIcon}>
              <Icon name="banknotes" size={18} color={TONES.green.fg} />
            </View>
            <Text style={styles.sectionTitle}>Earnings & payouts</Text>
          </View>
          {wallet ? (
            <View style={styles.balanceRow}>
              <View style={styles.balanceTile}>
                <Text style={styles.balanceLabel}>Available balance</Text>
                <Text style={styles.balanceValue}>{qar(wallet.wallet_available).replace('QAR ', '')}</Text>
                <Text style={styles.balanceUnit}>QAR · ready to withdraw</Text>
              </View>
              <View style={[styles.balanceTile, styles.balanceTileAlt]}>
                <Text style={styles.balanceLabel}>Pending</Text>
                <Text style={styles.balanceValue}>{qar(wallet.wallet_pending).replace('QAR ', '')}</Text>
                <Text style={styles.balanceUnit}>QAR · held until delivery</Text>
              </View>
            </View>
          ) : walletError ? (
            <Banner tone="error">{walletError}</Banner>
          ) : (
            <ActivityIndicator color={C.primary} />
          )}
          {iban ? <Text style={styles.ibanLine}>Payout account {iban}{wallet?.bank_name ? ` · ${wallet.bank_name}` : ''}</Text> : null}
          <View style={styles.sectionButtons}>
            <Btn label="Withdraw on the website" variant="primary" icon="banknotes" onPress={() => Linking.openURL(WEB_URL)} />
            <Btn label="Transactions" variant="secondary" icon="document-text" onPress={() => setPage('earnings')} />
          </View>
        </Card>

        <Group label="Store configuration">
          <Row icon="building-storefront" tone="amber" title="Store details" subtitle="Description, address and location" onPress={() => setPage('store')} />
          <Row
            icon="sparkles"
            tone="violet"
            title="Services & products"
            subtitle={listings === null ? 'Loading…' : `${services} ${services === 1 ? 'service' : 'services'} · ${products} ${products === 1 ? 'product' : 'products'}`}
            onPress={() => setPage('services')}
          />
          <Row icon="calendar-days" tone="brand" title="Availability" subtitle="Working hours, closures and booking rules" onPress={() => go('availability')} />
        </Group>

        <Group label="Alerts">
          <Row
            icon="bell"
            tone="brand"
            title="Order and booking alerts"
            subtitle={vendor.alerts_enabled ? 'Sound alerts for new orders, bookings and cancellations' : 'Off. You will not hear about new orders or bookings on this phone.'}
            right={<Switch accessibilityLabel="Order and booking alerts" value={vendor.alerts_enabled} disabled={saving} onValueChange={toggleAlerts} trackColor={{ true: C.primary }} />}
          />
          <Row
            icon="bell-alert"
            tone="slate"
            title="Phone notifications"
            subtitle={push ? push.message : 'Checking this phone…'}
            onPress={push && push.state !== 'ready' ? fixPush : undefined}
            right={push && push.state !== 'ready' ? <Text style={styles.fix}>{push.canOpenSettings ? 'Open settings' : 'Turn on'}</Text> : undefined}
          />
        </Group>

        <Group label="Help & legal">
          <Row icon="information-circle" tone="slate" title="Help & support" subtitle="Contact Sokoni Hub through the website" onPress={() => Linking.openURL(`${WEB_URL}/support`)} />
          <Row icon="document-text" tone="slate" title="Terms of vendor partnership" subtitle="Read the terms on the website" onPress={() => Linking.openURL(`${WEB_URL}/terms`)} />
        </Group>

        <Group label="About">
          <Row icon="cog-6-tooth" tone="slate" title="App version" right={<Text style={styles.version}>{version}</Text>} />
        </Group>

        <Btn label="Sign out" variant="danger" icon="arrow-right-on-rectangle" onPress={confirmSignOut} />
        <Text style={styles.footer}>Sokoni Hub vendor app · {version}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  frame: { width: '100%', maxWidth: 760, alignSelf: 'center', flex: 1 },
  body: { padding: 16, gap: 22, paddingBottom: 40 },
  profile: { gap: 14 },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logo: { width: 64, height: 64, borderRadius: 20, backgroundColor: C.surface2 },
  logoFallback: { width: 64, height: 64, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  logoInitials: { color: '#FFFFFF', fontSize: 22, ...fw('800') },
  name: { fontSize: 19, ...fw('800'), color: C.text },
  idLine: { fontSize: 13, color: C.muted, ...fw('600') },
  ratingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: C.surface2 },
  ratingText: { fontSize: 15, ...fw('800'), color: C.text },
  ratingMuted: { fontSize: 13, color: C.muted, ...fw('600') },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  sectionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: TONES.green.bg, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16, ...fw('800'), color: C.text },
  balanceRow: { flexDirection: 'row', gap: 10 },
  balanceTile: { flex: 1, minWidth: 0, padding: 14, borderRadius: 16, backgroundColor: C.primarySoft, gap: 4 },
  balanceTileAlt: { backgroundColor: C.surface2 },
  balanceLabel: { fontSize: 12, ...fw('700'), color: C.text2 },
  balanceValue: { fontSize: 24, ...fw('800'), color: C.primaryDeep, letterSpacing: -0.4 },
  balanceUnit: { fontSize: 11, color: C.muted, ...fw('600') },
  ibanLine: { fontSize: 13, color: C.muted, marginTop: 12, ...fw('600') },
  sectionButtons: { gap: 10, marginTop: 14 },
  fix: { fontSize: 14, color: C.primary, ...fw('800') },
  version: { fontSize: 14, color: C.muted, ...fw('600') },
  footer: { textAlign: 'center', fontSize: 12, color: C.muted, ...fw('600') },
});
