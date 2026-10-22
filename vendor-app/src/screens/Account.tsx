import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { api, ApiError } from '../api';
import { WEB_URL } from '../config';
import { checkPush, enablePush, openNotificationSettings, PushState } from '../usePushToken';
import { Banner, Btn, Card, Group, Icon, Pill, Row, ScreenHeader } from '../ui/kit';
import { C, Tone } from '../theme';
import { fw } from '../ui/type';
import { useVendor, Vendor } from '../providers/VendorContext';
import { initialsOf, qar } from '../format';
import { AccountPages, Transaction, TxList, Wallet, WalletCard } from './AccountPages';
import { WithdrawSheet } from './WithdrawSheet';
import { Support } from './Support';
import { LegalDoc } from './LegalDoc';
import { PRIVACY, TERMS } from '../legal/content';

type Page = 'home' | 'store' | 'services' | 'earnings' | 'support' | 'terms' | 'privacy';

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
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [transactionsError, setTransactionsError] = useState('');
  const [listings, setListings] = useState<{ kind: string; status: string }[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [push, setPush] = useState<PushState | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    void checkPush().then(setPush).catch(() => {});
  }, []);

  useEffect(() => {
    setWalletError('');
    setTransactionsError('');
    api.get<{ wallet: Wallet }>('/wallet')
      .then((r) => setWallet(r.wallet))
      .catch((e: any) => setWalletError(e?.message || 'Could not load your balance.'));
    api.get<{ transactions: Transaction[] }>('/wallet/transactions')
      .then((r) => setTransactions(r.transactions))
      .catch((e: any) => setTransactionsError(e?.message || 'Could not load transactions.'));
    api.get<{ listings: { kind: string; status: string }[] }>('/listings/mine/all')
      .then((r) => setListings(r.listings))
      .catch(() => setListings([]));
  }, [reloadKey]);

  const afterPayout = (message: string) => {
    setShowWithdraw(false);
    setNotice(message);
    setReloadKey((k) => k + 1);
  };

  const withdrawSheet = (
    <WithdrawSheet
      visible={showWithdraw}
      available={Number(wallet?.wallet_available || 0)}
      hasBank={!!wallet?.bank_iban}
      bankLabel={[wallet?.bank_name, wallet?.bank_iban ? `•••• ${wallet.bank_iban.replace(/\s/g, '').slice(-4)}` : ''].filter(Boolean).join(' · ')}
      onClose={() => setShowWithdraw(false)}
      onDone={afterPayout}
    />
  );

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

  if (page === 'support') {
    return (
      <View style={styles.screen}>
        <Support onBack={() => setPage('home')} onOpenLegal={(p) => setPage(p)} />
      </View>
    );
  }
  if (page === 'terms') return <View style={styles.screen}><LegalDoc doc={TERMS} onBack={() => setPage('support')} /></View>;
  if (page === 'privacy') return <View style={styles.screen}><LegalDoc doc={PRIVACY} onBack={() => setPage('support')} /></View>;

  if (page !== 'home') {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Vendor Profile" subtitle={name} />
        <AccountPages
          page={page}
          onBack={() => setPage('home')}
          vendor={vendor}
          wallet={wallet}
          walletError={walletError}
          transactions={transactions}
          transactionsError={transactionsError}
          onWithdraw={() => setShowWithdraw(true)}
        />
        {withdrawSheet}
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

      <ScrollView contentContainerStyle={styles.body}>
        {error ? <Banner tone="error">{error}</Banner> : null}

        <Card style={styles.profile}>
          {vendor.logo_url ? (
            <Image source={{ uri: vendor.logo_url }} style={styles.logo} />
          ) : (
            <View style={styles.logoFallback}>
              <Text style={styles.logoInitials}>{initialsOf(name)}</Text>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={styles.name} numberOfLines={2}>{name}</Text>
            <Text style={styles.idLine} numberOfLines={1}>
              {vendor.city ? `${vendor.city}, ${vendor.country || 'Qatar'}` : vendor.country || 'Qatar'}
            </Text>
            <View style={styles.badges}>
              {status ? <Pill label={status.label} tone={status.tone} icon={status.icon} /> : null}
              <View style={styles.ratingPill}>
                <Icon name="star" size={12} color={C.gold} solid />
                <Text style={styles.ratingText}>
                  {Number(vendor.rating_count || 0) > 0
                    ? `${Number(vendor.rating_avg || 0).toFixed(1)} (${vendor.rating_count})`
                    : 'No reviews yet'}
                </Text>
              </View>
            </View>
          </View>
        </Card>

        {notice ? <Banner tone="success" icon="check-badge">{notice}</Banner> : null}
        <WalletCard wallet={wallet} error={walletError} onWithdraw={() => { setNotice(''); setShowWithdraw(true); }} />

        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>Recent transactions</Text>
          <Text style={styles.link} onPress={() => setPage('earnings')} accessibilityRole="button">See all</Text>
        </View>
        {transactionsError ? <Banner tone="error">{transactionsError}</Banner> : null}
        {!transactions && !transactionsError ? <ActivityIndicator color={C.primary} /> : null}
        {transactions && transactions.length === 0 ? (
          <Card>
            <Text style={styles.note}>No transactions yet.</Text>
          </Card>
        ) : null}
        {transactions && transactions.length > 0 ? <TxList rows={transactions} limit={4} /> : null}

        <Group label="Store">
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
            tone="amber"
            title="Order and booking alerts"
            subtitle={vendor.alerts_enabled ? 'Sound alerts for new orders and bookings' : 'Off. You will not hear new orders or bookings.'}
            right={<Switch accessibilityLabel="Order and booking alerts" value={vendor.alerts_enabled} disabled={saving} onValueChange={toggleAlerts} trackColor={{ true: C.primary }} />}
          />
          <Row
            icon="bell-alert"
            tone={push && push.state === 'ready' ? 'green' : 'red'}
            title="Phone notifications"
            subtitle={push ? push.message : 'Checking this phone…'}
            onPress={push && push.state !== 'ready' ? fixPush : undefined}
            right={push && push.state !== 'ready' ? <Text style={styles.fix}>{push.canOpenSettings ? 'Settings' : 'Retry'}</Text> : undefined}
          />
        </Group>

        <Group label="Help & legal">
          <Row icon="information-circle" tone="blue" title="Help & support" subtitle="WhatsApp, email and phone" onPress={() => setPage('support')} />
          <Row icon="document-text" tone="brand" title={TERMS.title} subtitle="Read the full terms in the app" onPress={() => setPage('terms')} />
          <Row icon="lock-closed" tone="slate" title={PRIVACY.title} subtitle="How your information is used" onPress={() => setPage('privacy')} />
        </Group>

        <Group label="About">
          <Row icon="cog-6-tooth" tone="slate" title="App version" right={<Text style={styles.version}>{version}</Text>} />
        </Group>

        <Btn label="Sign out" variant="danger" icon="arrow-right-on-rectangle" onPress={confirmSignOut} />
        <Text style={styles.footer}>Sokoni Hub vendor app · {version}</Text>
      </ScrollView>
      {withdrawSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 12, gap: 12, paddingBottom: 32 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.surface2 },
  logoFallback: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  logoInitials: { color: '#FFFFFF', fontSize: 16, ...fw('800') },
  name: { fontSize: 15, ...fw('800'), color: C.text },
  idLine: { fontSize: 11, color: C.muted, ...fw('600') },
  badges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: C.goldSoft },
  ratingText: { fontSize: 11, ...fw('800'), color: C.goldText },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  sectionLabel: { fontSize: 10, ...fw('800'), color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: 2 },
  link: { fontSize: 12, ...fw('800'), color: C.primary, marginRight: 2 },
  note: { fontSize: 11, color: C.muted, lineHeight: 16 },
  fix: { fontSize: 12, color: C.primary, ...fw('800') },
  version: { fontSize: 12, color: C.muted, ...fw('600') },
  footer: { textAlign: 'center', fontSize: 10, color: C.muted, ...fw('600') },
});
