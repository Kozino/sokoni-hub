import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BanknotesIcon, ReceiptPercentIcon } from 'react-native-heroicons/outline';
import { api } from '../api';
import { Card, EmptyState, Notice, ScreenHeader, Stat } from '../components/UI';
import { dateTime, errorText, money } from '../format';
import { C } from '../theme';

type Trip = { id: string; code: string; delivery_fee: number; created_at: string; business_name: string };
type Summary = { total: number; trips: number; today: number; trips_today: number };
type Ledger = { cash_held: number; fee_owed: number };

export function Earnings() {
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
      setSummary({ ...res.summary, total: Number(res.summary.total), today: Number(res.summary.today) });
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
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Earnings" subtitle="Delivery fees from completed trips" />
      <ScrollView
        contentContainerStyle={styles.pad}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}
      >
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={C.primary} /></View>
        ) : null}

        {error ? <View style={{ marginBottom: 14 }}><Notice tone="error">{error}</Notice></View> : null}

        {summary ? (
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}><BanknotesIcon size={22} color="#fff" /></View>
              <Text style={styles.heroLabel}>Total earned</Text>
            </View>
            <Text style={styles.heroValue}>{money(summary.total)}</Text>
            <View style={styles.statRow}>
              <Stat label="Today" value={money(summary.today)} />
              <Stat label="Trips" value={String(summary.trips)} />
              <Stat label="Trips today" value={String(summary.trips_today)} />
            </View>
          </View>
        ) : null}

        {ledger ? (
          <Card style={{ marginBottom: 14 }}>
            <Text style={styles.tripBiz}>Cash to hand to Sokoni Hub: {money(ledger.cash_held)}</Text>
            <Text style={styles.tripMeta}>
              Cash collected on delivery that you still need to hand in. Fees owed to you: {money(ledger.fee_owed)}.
            </Text>
          </Card>
        ) : null}

        <Text style={styles.section}>Recent trips</Text>

        {!loading && !error && trips.length === 0 ? (
          <EmptyState
            icon={<ReceiptPercentIcon size={30} color={C.primary} />}
            title="No trips yet"
            text="Completed deliveries will appear here with their fee."
          />
        ) : null}

        {trips.map((t) => (
          <Card key={t.id} style={styles.trip}>
            <View style={{ flex: 1 }}>
              <Text style={styles.tripBiz} numberOfLines={1}>{t.business_name}</Text>
              <Text style={styles.tripMeta}>{t.code} · {dateTime(t.created_at)}</Text>
            </View>
            <Text style={styles.tripAmount}>+{money(t.delivery_fee)}</Text>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 18, paddingBottom: 32 },
  center: { paddingVertical: 30, alignItems: 'center' },
  hero: { backgroundColor: C.primary, borderRadius: 22, padding: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: 14 },
  heroValue: { color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: -0.8, marginTop: 14 },
  statRow: { flexDirection: 'row', gap: 12, marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  section: { fontSize: 13, fontWeight: '800', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 24, marginBottom: 10 },
  trip: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10, paddingVertical: 14 },
  tripBiz: { fontSize: 15, fontWeight: '800', color: C.text },
  tripMeta: { fontSize: 12, color: C.text2, marginTop: 3 },
  tripAmount: { fontSize: 15, fontWeight: '900', color: C.primary },
});
