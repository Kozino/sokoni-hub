import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BanknotesIcon, CheckCircleIcon, ReceiptPercentIcon, WalletIcon } from 'react-native-heroicons/outline';
import { api } from '../api';
import { useAuth } from '../providers/AuthContext';
import { Badge, Card, DriverTopbar, EmptyState, Notice, PageHeading, SectionTitle, Stat } from '../components/UI';
import { dateTime, errorText, money, statusLabel } from '../format';
import { C } from '../theme';

type Trip = { id: string; code: string; status: string; delivery_fee: number; created_at: string; business_name: string };
type Summary = { total: number; trips: number; today: number; trips_today: number };
type Ledger = { cash_held: number; fee_owed: number };

export function Earnings({ online }: { online?: boolean }) {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ summary: Summary; recent: Trip[]; ledger?: { cash_held: number | null; fee_owed: number | null } }>('/drivers/earnings');
      setLedger({ cash_held: Number(res.ledger?.cash_held ?? 0), fee_owed: Number(res.ledger?.fee_owed ?? 0) });
      setSummary({
        ...res.summary,
        total: Number(res.summary.total),
        today: Number(res.summary.today),
        trips: Number(res.summary.trips),
        trips_today: Number(res.summary.trips_today),
      });
      setTrips(res.recent.map((t) => ({ ...t, delivery_fee: Number(t.delivery_fee) })));
      setError('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.page}>
      <DriverTopbar online={online} name={user?.full_name} />
      <ScrollView
        contentContainerStyle={styles.pad}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}
      >
        <PageHeading
          title="Driver Earnings"
          subtitle="Track completed trips, delivery fees & cash settlement"
          right={<Badge label="Live ledger" />}
        />

        {loading ? <View style={styles.center}><ActivityIndicator color={C.primary} /><Text style={styles.loadingText}>Loading your earnings…</Text></View> : null}
        {error ? <View style={{ marginBottom: 14 }}><Notice tone="error">{error}</Notice></View> : null}

        {summary ? (
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <View style={styles.heroTitleRow}>
                <View style={styles.heroIcon}><BanknotesIcon size={21} color="#fff" /></View>
                <View>
                  <Text style={styles.heroEyebrow}>TOTAL DELIVERY EARNINGS</Text>
                  <Text style={styles.heroSub}>Recorded from completed handoffs</Text>
                </View>
              </View>
              <View style={styles.heroBadge}><View style={styles.heroBadgeDot} /><Text style={styles.heroBadgeText}>Up to date</Text></View>
            </View>
            <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>{money(summary.total)}</Text>
            <View style={styles.statRow}>
              <Stat label="Today" value={money(summary.today)} />
              <Stat label="Completed trips" value={String(summary.trips)} />
              <Stat label="Trips today" value={String(summary.trips_today)} />
            </View>
          </View>
        ) : null}

        {ledger ? (
          <Card style={styles.ledgerCard}>
            <View style={styles.cardHeading}>
              <View style={styles.cardHeadingIcon}><WalletIcon size={20} color={C.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Cash & settlement</Text>
                <Text style={styles.cardSub}>Your current driver ledger</Text>
              </View>
            </View>
            <View style={styles.ledgerGrid}>
              <View style={styles.ledgerMetric}>
                <Text style={styles.ledgerLabel}>Cash to hand in</Text>
                <Text style={styles.ledgerValue}>{money(ledger.cash_held)}</Text>
                <Text style={styles.ledgerNote}>Collected on delivery</Text>
              </View>
              <View style={styles.ledgerDivider} />
              <View style={styles.ledgerMetric}>
                <Text style={styles.ledgerLabel}>Fees owed to you</Text>
                <Text style={[styles.ledgerValue, { color: C.primary }]}>{money(ledger.fee_owed)}</Text>
                <Text style={styles.ledgerNote}>Not yet paid out</Text>
              </View>
            </View>
            {ledger.cash_held > 0 ? <View style={{ marginTop: 12 }}><Notice tone="warning">Please hand in the cash shown above through the Sokoni Hub settlement process.</Notice></View> : null}
          </Card>
        ) : null}

        {summary ? (
          <>
            <SectionTitle meta="All completed trips">Trip & fee breakdown</SectionTitle>
            <Card style={styles.breakdownCard}>
              <BreakdownRow icon={<ReceiptPercentIcon size={20} color={C.primary} />} label="Standard delivery fees" note={`${summary.trips} completed ${summary.trips === 1 ? 'trip' : 'trips'}`} value={money(summary.total)} />
              <View style={styles.rowDivider} />
              <BreakdownRow icon={<BanknotesIcon size={20} color={C.gold} />} label="Average fee per trip" note="Calculated from completed trips" value={money(summary.trips ? summary.total / summary.trips : 0)} />
            </Card>
          </>
        ) : null}

        <SectionTitle meta={trips.length ? `${trips.length} shown` : undefined}>Recent activity</SectionTitle>

        {!loading && !error && trips.length === 0 ? (
          <EmptyState icon={<ReceiptPercentIcon size={30} color={C.primary} />} title="No trips yet" text="Completed deliveries will appear here with their live fee and handoff status." />
        ) : null}

        {trips.map((trip) => (
          <Card key={trip.id} style={styles.trip}>
            <View style={styles.tripIcon}><CheckCircleIcon size={21} color={C.primary} /></View>
            <View style={styles.tripMain}>
              <View style={styles.tripNameRow}>
                <Text style={styles.tripBiz} numberOfLines={1}>{trip.business_name}</Text>
                <View style={styles.tripCode}><Text style={styles.tripCodeText} numberOfLines={1}>{trip.code}</Text></View>
              </View>
              <Text style={styles.tripMeta}>{dateTime(trip.created_at)}</Text>
              <Text style={styles.tripStatus}>{statusLabel(trip.status)}</Text>
            </View>
            <Text style={styles.tripAmount}>+{money(trip.delivery_fee)}</Text>
          </Card>
        ))}

        {!loading && !error ? <Text style={styles.footer}>Earnings and ledger balances come directly from your Sokoni Hub driver account.</Text> : null}
      </ScrollView>
    </View>
  );
}

function BreakdownRow({ icon, label, note, value }: { icon: React.ReactNode; label: string; note: string; value: string }) {
  return (
    <View style={styles.breakdownRow}>
      <View style={styles.breakdownIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.breakdownLabel}>{label}</Text>
        <Text style={styles.breakdownNote}>{note}</Text>
      </View>
      <Text style={styles.breakdownValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16, paddingBottom: 32 },
  center: { paddingVertical: 34, alignItems: 'center', gap: 10 },
  loadingText: { color: C.text2, fontSize: 12 },
  hero: { backgroundColor: C.primary, borderRadius: 24, padding: 19, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  heroIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' },
  heroEyebrow: { color: 'rgba(255,255,255,0.76)', fontWeight: '900', fontSize: 9, letterSpacing: 0.8 },
  heroSub: { color: 'rgba(255,255,255,0.65)', fontSize: 10, marginTop: 4 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 7 },
  heroBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#9EE8C3' },
  heroBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  heroValue: { color: '#fff', fontSize: 34, lineHeight: 43, fontWeight: '900', letterSpacing: -0.9, marginTop: 20 },
  statRow: { flexDirection: 'row', gap: 12, marginTop: 17, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.16)' },
  ledgerCard: { marginTop: 12 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardHeadingIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '900' },
  cardSub: { color: C.text2, fontSize: 11, marginTop: 2 },
  ledgerGrid: { flexDirection: 'row', alignItems: 'stretch', marginTop: 15, backgroundColor: C.infoSoft, borderRadius: 15, padding: 13 },
  ledgerMetric: { flex: 1, minWidth: 0 },
  ledgerDivider: { width: 1, backgroundColor: C.border, marginHorizontal: 12 },
  ledgerLabel: { color: C.text2, fontSize: 10, fontWeight: '700' },
  ledgerValue: { color: C.text, fontSize: 15, fontWeight: '900', marginTop: 5 },
  ledgerNote: { color: C.text2, fontSize: 9, marginTop: 3 },
  breakdownCard: { paddingVertical: 6 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  breakdownIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.infoSoft, alignItems: 'center', justifyContent: 'center' },
  breakdownLabel: { color: C.text, fontSize: 13, fontWeight: '800' },
  breakdownNote: { color: C.text2, fontSize: 10, lineHeight: 15, marginTop: 3 },
  breakdownValue: { color: C.primary, fontSize: 13, fontWeight: '900' },
  rowDivider: { height: 1, backgroundColor: C.border, marginLeft: 48 },
  trip: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9, paddingVertical: 13, paddingHorizontal: 13 },
  tripIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  tripMain: { flex: 1, minWidth: 0 },
  tripNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tripBiz: { flexShrink: 1, fontSize: 13, fontWeight: '900', color: C.text },
  tripCode: { maxWidth: 82, backgroundColor: C.infoSoft, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  tripCodeText: { color: C.text2, fontSize: 8, fontWeight: '700' },
  tripMeta: { fontSize: 10, color: C.text2, marginTop: 4 },
  tripStatus: { fontSize: 9, color: C.primary, fontWeight: '700', marginTop: 2 },
  tripAmount: { fontSize: 12, fontWeight: '900', color: C.primary },
  footer: { color: C.text2, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 14, paddingHorizontal: 12 },
});
