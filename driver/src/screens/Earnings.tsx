import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';

export function Earnings() {
  const history = [
    { id: '1', date: 'Today, 2:30 PM', order: 'ORD-8821X', amount: 'QAR 15.00' },
    { id: '2', date: 'Today, 1:15 PM', order: 'ORD-7742Y', amount: 'QAR 12.00' },
    { id: '3', date: 'Yesterday', order: 'ORD-1122Z', amount: 'QAR 18.00' },
    { id: '4', date: 'Yesterday', order: 'ORD-3344A', amount: 'QAR 15.00' },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Earnings</Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Available Balance</Text>
        <Text style={styles.summaryValue}>QAR 60.00</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>4</Text>
            <Text style={styles.statLabel}>Trips Today</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>4.9</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Recent Trips</Text>
      
      {history.map((h, i) => (
        <View key={h.id} style={[styles.historyRow, i === history.length - 1 && { borderBottomWidth: 0 }]}>
          <View>
            <Text style={styles.histOrder}>{h.order}</Text>
            <Text style={styles.histDate}>{h.date}</Text>
          </View>
          <Text style={styles.histAmount}>+{h.amount}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8FD' },
  header: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold' },
  
  summaryCard: { backgroundColor: '#126D4B', margin: 20, padding: 24, borderRadius: 16, shadowColor: '#126D4B', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  summaryLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  summaryValue: { color: '#fff', fontSize: 36, fontWeight: 'bold', marginBottom: 24 },
  
  statsRow: { flexDirection: 'row', gap: 20, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingTop: 20 },
  statBox: { flex: 1 },
  statNum: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  statLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 },

  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginHorizontal: 20, marginTop: 10, marginBottom: 16 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 20, marginHorizontal: 20, borderBottomWidth: 1, borderColor: '#F3F4F6' },
  histOrder: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 4 },
  histDate: { fontSize: 13, color: '#666' },
  histAmount: { fontSize: 16, fontWeight: 'bold', color: '#126D4B' }
});
