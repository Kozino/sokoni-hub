import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../api';
import { WEB_URL } from '../config';
import { Banner, Btn, Card, EmptyState, Group, Icon, Pill, SubBar } from '../ui/kit';
import { C, Tone, TONES } from '../theme';
import { fw } from '../ui/type';
import type { Vendor } from '../providers/VendorContext';
import { dohaDay, qar } from '../format';

export type Wallet = {
  wallet_available: number | string;
  wallet_pending: number | string;
  bank_iban?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
};

export type Transaction = { id: string; amount: number | string; type: string; description?: string | null; created_at: string };

type Listing = {
  id: string;
  title: string;
  kind: 'product' | 'service';
  status: 'draft' | 'active' | 'paused' | 'removed';
  price: number | string | null;
  unit?: string | null;
  category_name?: string | null;
};

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
export function fmtWhen(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} · ${hh}:${mm}`;
}

/** Money coming in (held or released to the balance) is green. Withdrawals go out, so they are amber. */
function txStyle(type: string): { icon: 'arrow-down-left' | 'arrow-up-right' | 'document-text'; tone: Tone } {
  if (type === 'escrow_credit' || type === 'escrow_release') return { icon: 'arrow-down-left', tone: 'green' };
  if (type === 'withdrawal') return { icon: 'arrow-up-right', tone: 'amber' };
  return { icon: 'document-text', tone: 'slate' };
}

/** Industry-style wallet: available balance first, then pending and payout details, then one clear action. */
export function WalletCard({ wallet, error, onWithdraw }: { wallet: Wallet | null; error: string; onWithdraw: () => void }) {
  const iban = wallet?.bank_iban ? `•••• ${wallet.bank_iban.replace(/\s/g, '').slice(-4)}` : null;
  return (
    <LinearGradient colors={['#00735C', '#005A48', '#00402F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wallet}>
      <View style={styles.walletTop}>
        <Text style={styles.walletLabel}>Available balance</Text>
        <View style={styles.walletChip}>
          <Icon name="banknotes" size={14} color="#FFFFFF" />
          <Text style={styles.walletChipText}>QAR</Text>
        </View>
      </View>
      {wallet ? (
        <Text style={styles.walletValue}>{qar(wallet.wallet_available)}</Text>
      ) : error ? (
        <Text style={styles.walletError}>{error}</Text>
      ) : (
        <ActivityIndicator color="#FFFFFF" style={{ alignSelf: 'flex-start', marginVertical: 6 }} />
      )}
      {wallet ? (
        <View style={styles.walletSplit}>
          <View style={styles.walletCol}>
            <Text style={styles.walletSmall}>Pending</Text>
            <Text style={styles.walletSmallValue}>{qar(wallet.wallet_pending)}</Text>
          </View>
          <View style={styles.walletCol}>
            <Text style={styles.walletSmall}>Payout account</Text>
            <Text style={styles.walletSmallValue} numberOfLines={1}>
              {iban ? `${iban}${wallet.bank_name ? ` · ${wallet.bank_name}` : ''}` : 'Not added'}
            </Text>
          </View>
        </View>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Withdraw to your bank" onPress={onWithdraw} style={({ pressed }) => [styles.withdraw, { opacity: pressed ? 0.85 : 1 }]}>
        <Text style={styles.withdrawText}>Withdraw to bank</Text>
        <Icon name="arrow-up-right" size={15} color="#005A48" />
      </Pressable>
    </LinearGradient>
  );
}

/** Transaction list rows. Pass a limit to show a preview. */
export function TxList({ rows, limit }: { rows: Transaction[]; limit?: number }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <Card padded={false}>
      {shown.map((t, idx) => {
        const st = txStyle(t.type);
        const tone = TONES[st.tone];
        return (
          <View key={t.id} style={[styles.txRow, idx < shown.length - 1 && styles.line]}>
            <View style={[styles.txIcon, { backgroundColor: tone.bg }]}>
              <Icon name={st.icon} size={14} color={tone.fg} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.txTitle} numberOfLines={2}>{t.description || TX_LABEL[t.type] || 'Transaction'}</Text>
              <Text style={styles.txMeta}>{fmtWhen(t.created_at)} · {dohaDay(t.created_at)}</Text>
            </View>
            <Text style={[styles.txAmount, { color: tone.fg }]}>{qar(t.amount)}</Text>
          </View>
        );
      })}
    </Card>
  );
}

export function AccountPages({
  page,
  onBack,
  vendor,
  wallet,
  walletError,
  transactions,
  transactionsError,
  onWithdraw,
}: {
  page: 'store' | 'services' | 'earnings';
  onWithdraw: () => void;
  onBack: () => void;
  vendor: Vendor | null;
  wallet: Wallet | null;
  walletError: string;
  transactions: Transaction[] | null;
  transactionsError: string;
}) {
  const title = page === 'store' ? 'Store details' : page === 'services' ? 'Services & products' : 'Earnings & payouts';
  return (
    <View style={styles.wrap}>
      <SubBar title={title} onBack={onBack} />
      {page === 'store' ? <StoreDetails vendor={vendor} /> : null}
      {page === 'services' ? <Catalogue /> : null}
      {page === 'earnings' ? (
        <Earnings wallet={wallet} walletError={walletError} transactions={transactions} transactionsError={transactionsError} onWithdraw={onWithdraw} />
      ) : null}
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
    <ScrollView contentContainerStyle={styles.body}>
      <Card padded={false}>
        {rows.map(([label, value], idx) => (
          <View key={label} style={[styles.info, idx < rows.length - 1 && styles.line]}>
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
    <ScrollView contentContainerStyle={styles.body}>
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
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
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

function Earnings({
  wallet,
  walletError,
  transactions,
  transactionsError,
  onWithdraw,
}: {
  onWithdraw: () => void;
  wallet: Wallet | null;
  walletError: string;
  transactions: Transaction[] | null;
  transactionsError: string;
}) {
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <WalletCard wallet={wallet} error={walletError} onWithdraw={onWithdraw} />
      <Text style={styles.sectionLabel}>All transactions</Text>
      {transactionsError ? <Banner tone="error">{transactionsError}</Banner> : null}
      {!transactions && !transactionsError ? <ActivityIndicator color={C.primary} /> : null}
      {transactions && transactions.length === 0 ? (
        <Card>
          <Text style={styles.note}>No transactions yet.</Text>
        </Card>
      ) : null}
      {transactions && transactions.length > 0 ? <TxList rows={transactions} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: { padding: 12, gap: 12, paddingBottom: 32 },
  pad: { padding: 12 },
  line: { borderBottomWidth: 1, borderBottomColor: C.borderSoft },
  info: { paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  infoLabel: { fontSize: 10, ...fw('800'), color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  infoValue: { fontSize: 13, color: C.text, lineHeight: 18 },
  infoEmpty: { color: C.muted, fontStyle: 'italic' },
  note: { fontSize: 11, color: C.muted, lineHeight: 16 },
  listing: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  listingTitle: { fontSize: 13, ...fw('700'), color: C.text },
  listingMeta: { fontSize: 11, color: C.muted, ...fw('600') },
  sectionLabel: { fontSize: 10, ...fw('800'), color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: 2 },

  wallet: { borderRadius: 16, padding: 14, gap: 8 },
  walletTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  walletLabel: { fontSize: 11, ...fw('700'), color: '#CDEEE3' },
  walletChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)' },
  walletChipText: { fontSize: 10, ...fw('800'), color: '#FFFFFF' },
  walletValue: { fontSize: 26, ...fw('800'), color: '#FFFFFF', letterSpacing: -0.4 },
  walletError: { fontSize: 12, color: '#FFE4D6', lineHeight: 17 },
  walletSplit: { flexDirection: 'row', gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)' },
  walletCol: { flex: 1, minWidth: 0, gap: 2 },
  walletSmall: { fontSize: 10, ...fw('700'), color: '#CDEEE3' },
  walletSmallValue: { fontSize: 12, ...fw('800'), color: '#FFFFFF' },
  withdraw: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 11, backgroundColor: '#FFFFFF', marginTop: 4 },
  withdrawText: { fontSize: 13, ...fw('800'), color: '#005A48' },

  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  txIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: 13, ...fw('700'), color: C.text },
  txMeta: { fontSize: 10, color: C.muted, marginTop: 1, ...fw('600') },
  txAmount: { fontSize: 13, ...fw('800') },
});
