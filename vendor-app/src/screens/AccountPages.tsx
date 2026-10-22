import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { WEB_URL } from '../config';
import { Banner, Btn, Card, EmptyState, Group, Icon, Pill } from '../ui/kit';
import { C, Tone } from '../theme';
import { fw } from '../ui/type';
import type { Vendor } from '../providers/VendorContext';
import { dohaDay, qar } from '../format';

type Wallet = { wallet_available: number | string; wallet_pending: number | string };

type Listing = {
  id: string;
  title: string;
  kind: 'product' | 'service';
  status: 'draft' | 'active' | 'paused' | 'removed';
  price: number | string | null;
  unit?: string | null;
  category_name?: string | null;
};

type Transaction = { id: string; amount: number | string; type: string; description?: string | null; created_at: string };

const LISTING_STATUS: Record<Listing['status'], { label: string; tone: Tone }> = {
  active: { label: 'Live', tone: 'green' },
  paused: { label: 'Paused', tone: 'amber' },
  draft: { label: 'Draft', tone: 'slate' },
  removed: { label: 'Removed', tone: 'red' },
};

const TX_LABEL: Record<string, string> = {
  escrow_credit: 'Order payment held',
  escrow_release: 'Released to balance',
  withdrawal: 'Withdrawal',
  refund: 'Refund',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "22 Oct · 14:05" in Doha time. Fixed UTC+3, so no Intl time-zone support is needed. */
function fmtWhen(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} · ${hh}:${mm}`;
}

export function AccountPages({
  page,
  onBack,
  vendor,
  wallet,
  walletError,
}: {
  page: 'store' | 'services' | 'earnings';
  onBack: () => void;
  vendor: Vendor | null;
  wallet: Wallet | null;
  walletError: string;
}) {
  const title = page === 'store' ? 'Store details' : page === 'services' ? 'Services & products' : 'Earnings & payouts';
  return (
    <View style={styles.wrap}>
      <View style={styles.subBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to account" onPress={onBack} style={styles.back} hitSlop={8}>
          <Icon name="chevron-left" size={22} color={C.text} />
        </Pressable>
        <Text style={styles.subTitle}>{title}</Text>
      </View>
      {page === 'store' ? <StoreDetails vendor={vendor} /> : null}
      {page === 'services' ? <Catalogue /> : null}
      {page === 'earnings' ? <Earnings wallet={wallet} walletError={walletError} /> : null}
    </View>
  );
}

function StoreDetails({ vendor }: { vendor: Vendor | null }) {
  if (!vendor) return <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />;
  const rows: [string, string | null | undefined][] = [
    ['Business name', vendor.business_name],
    ['Description', vendor.description],
    ['Country', vendor.country],
    ['City', vendor.city],
    ['Address', vendor.address],
  ];
  return (
    <ScrollView style={styles.frame} contentContainerStyle={styles.body}>
      <Card padded={false}>
        {rows.map(([label, value], idx) => (
          <View key={label} style={[styles.infoRow, idx < rows.length - 1 && styles.infoRowLine]}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={[styles.infoValue, !value && styles.infoEmpty]}>{value || 'Not added yet'}</Text>
          </View>
        ))}
      </Card>
      <Text style={styles.note}>To change these details, use the Sokoni Hub website.</Text>
      <Btn label="Edit on the website" variant="secondary" icon="pencil-square" onPress={() => Linking.openURL(WEB_URL)} />
    </ScrollView>
  );
}

function Catalogue() {
  const [items, setItems] = useState<Listing[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ listings: Listing[] }>('/listings/mine/all')
      .then((r) => setItems(r.listings.filter((l) => l.status !== 'removed')))
      .catch((e: any) => setError(e?.message || 'Could not load your listings.'));
  }, []);

  if (error) return <View style={styles.pad}><Banner tone="error">{error}</Banner></View>;
  if (!items) return <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />;

  const services = items.filter((l) => l.kind === 'service');
  const products = items.filter((l) => l.kind === 'product');

  return (
    <ScrollView style={styles.frame} contentContainerStyle={styles.body}>
      {items.length === 0 ? (
        <EmptyState icon="sparkles" title="Nothing listed yet" body="Your services and products appear here once they are added on the Sokoni Hub website." />
      ) : null}
      {services.length ? <ListingGroup label="Services" items={services} /> : null}
      {products.length ? <ListingGroup label="Products" items={products} /> : null}
      {items.length ? <Text style={styles.note}>Listings are edited on the Sokoni Hub website.</Text> : null}
      <Btn label="Edit on the website" variant="secondary" icon="pencil-square" onPress={() => Linking.openURL(WEB_URL)} />
    </ScrollView>
  );
}

function ListingGroup({ label, items }: { label: string; items: Listing[] }) {
  return (
    <Group label={label}>
      {items.map((l) => {
        const st = LISTING_STATUS[l.status];
        return (
          <View key={l.id} style={styles.listing}>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={styles.listingTitle} numberOfLines={2}>{l.title}</Text>
              <Text style={styles.listingMeta} numberOfLines={2}>
                {l.category_name ? `${l.category_name} · ` : ''}
                {l.price !== null && l.price !== undefined ? `${qar(l.price)}${l.unit ? ` / ${l.unit}` : ''}` : 'No price set'}
              </Text>
            </View>
            <Pill label={st.label} tone={st.tone} />
          </View>
        );
      })}
    </Group>
  );
}

function Earnings({ wallet, walletError }: { wallet: Wallet | null; walletError: string }) {
  const [rows, setRows] = useState<Transaction[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ transactions: Transaction[] }>('/wallet/transactions')
      .then((r) => setRows(r.transactions))
      .catch((e: any) => setError(e?.message || 'Could not load transactions.'));
  }, []);

  return (
    <ScrollView style={styles.frame} contentContainerStyle={styles.body}>
      {walletError ? <Banner tone="error">{walletError}</Banner> : null}
      {wallet ? (
        <View style={styles.balanceRow}>
          <View style={styles.balanceTile}>
            <Text style={styles.balanceLabel}>Available</Text>
            <Text style={styles.balanceValue}>{qar(wallet.wallet_available)}</Text>
          </View>
          <View style={[styles.balanceTile, styles.balanceAlt]}>
            <Text style={styles.balanceLabel}>Pending</Text>
            <Text style={styles.balanceValue}>{qar(wallet.wallet_pending)}</Text>
          </View>
        </View>
      ) : null}
      <Btn label="Withdraw on the website" variant="primary" icon="banknotes" onPress={() => Linking.openURL(WEB_URL)} />

      <Text style={styles.sectionLabel}>Recent transactions</Text>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {!rows && !error ? <ActivityIndicator color={C.primary} /> : null}
      {rows && rows.length === 0 ? (
        <Card>
          <Text style={styles.note}>No transactions yet.</Text>
        </Card>
      ) : null}
      {rows && rows.length > 0 ? (
        <Card padded={false}>
          {rows.map((t, idx) => (
            <View key={t.id} style={[styles.txRow, idx < rows.length - 1 && styles.infoRowLine]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.txTitle} numberOfLines={2}>{t.description || TX_LABEL[t.type] || 'Transaction'}</Text>
                <Text style={styles.txMeta}>{fmtWhen(t.created_at)} · {dohaDay(t.created_at)}</Text>
              </View>
              <Text style={styles.txAmount}>{qar(t.amount)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  subBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.borderSoft },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2 },
  subTitle: { fontSize: 17, ...fw('800'), color: C.text },
  frame: { width: '100%', maxWidth: 760, alignSelf: 'center', flex: 1 },
  body: { padding: 16, gap: 16, paddingBottom: 40 },
  pad: { padding: 16 },
  infoRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 4 },
  infoRowLine: { borderBottomWidth: 1, borderBottomColor: C.borderSoft },
  infoLabel: { fontSize: 12, ...fw('700'), color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  infoValue: { fontSize: 15, color: C.text, lineHeight: 21 },
  infoEmpty: { color: C.muted, fontStyle: 'italic' },
  note: { fontSize: 13, color: C.muted, lineHeight: 19 },
  listing: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  listingTitle: { fontSize: 15, ...fw('700'), color: C.text },
  listingMeta: { fontSize: 13, color: C.muted, ...fw('600') },
  balanceRow: { flexDirection: 'row', gap: 10 },
  balanceTile: { flex: 1, minWidth: 0, padding: 14, borderRadius: 16, backgroundColor: C.primarySoft, gap: 4 },
  balanceAlt: { backgroundColor: C.surface2 },
  balanceLabel: { fontSize: 12, ...fw('700'), color: C.text2 },
  balanceValue: { fontSize: 17, ...fw('800'), color: C.primaryDeep },
  sectionLabel: { fontSize: 12, ...fw('800'), color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: 4 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  txTitle: { fontSize: 15, ...fw('700'), color: C.text },
  txMeta: { fontSize: 12, color: C.muted, marginTop: 2, ...fw('600') },
  txAmount: { fontSize: 15, ...fw('800'), color: C.text },
});
