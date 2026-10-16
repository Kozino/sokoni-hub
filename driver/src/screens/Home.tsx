import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Alert, Platform } from 'react-native';
import { useAuth } from '../providers/AuthContext';
import * as Location from 'expo-location';

export function Home({ onStartDelivery }: { onStartDelivery: (orderId: string) => void }) {
  const { user } = useAuth();
  const [online, setOnline] = useState(false);
  const [incomingOrder, setIncomingOrder] = useState<any>(null);

  useEffect(() => {
    (async () => {
      if (online) {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Location permission is required to go online.');
          setOnline(false);
          return;
        }
      }
    })();
  }, [online]);

  // Mock an incoming order after 5 seconds of being online
  useEffect(() => {
    if (online) {
      const timer = setTimeout(() => {
        setIncomingOrder({
          id: 'ORD-8821X',
          vendorName: 'Mama Africa Store',
          pickup: 'Doha Festival City',
          dropoff: 'Al Wakra',
          distance: '4.2 km',
          fee: 'QAR 15.00'
        });
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setIncomingOrder(null);
    }
  }, [online]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.full_name.split(' ')[0]}</Text>
          <Text style={styles.statusText}>{online ? 'Searching for orders...' : 'You are offline'}</Text>
        </View>
        <View style={styles.toggleWrap}>
          <Text style={[styles.toggleLabel, { color: online ? '#126D4B' : '#666' }]}>{online ? 'ONLINE' : 'OFFLINE'}</Text>
          <Switch value={online} onValueChange={setOnline} trackColor={{ true: '#126D4B', false: '#ccc' }} />
        </View>
      </View>

      <View style={styles.mapMock}>
        <Text style={{ color: '#999' }}>Live Map View</Text>
      </View>

      {incomingOrder && (
        <View style={styles.orderPopup}>
          <View style={styles.orderHeader}>
            <Text style={styles.newAlert}>🔔 NEW DELIVERY</Text>
            <Text style={styles.fee}>{incomingOrder.fee}</Text>
          </View>
          
          <View style={styles.routeBox}>
            <View style={styles.dotLine} />
            <View style={styles.routeItem}>
              <Text style={styles.routeLabel}>PICKUP</Text>
              <Text style={styles.routeText}>{incomingOrder.vendorName}</Text>
              <Text style={styles.routeSub}>{incomingOrder.pickup}</Text>
            </View>
            <View style={styles.routeItem}>
              <Text style={styles.routeLabel}>DROPOFF</Text>
              <Text style={styles.routeText}>{incomingOrder.dropoff}</Text>
              <Text style={styles.routeSub}>{incomingOrder.distance} away</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnReject]} onPress={() => setIncomingOrder(null)}>
              <Text style={styles.btnTextReject}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnAccept]} onPress={() => onStartDelivery(incomingOrder.id)}>
              <Text style={styles.btnTextAccept}>Accept Delivery</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8FD' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  greeting: { fontSize: 20, fontWeight: 'bold', color: '#111' },
  statusText: { fontSize: 14, color: '#666', marginTop: 4 },
  toggleWrap: { alignItems: 'center' },
  toggleLabel: { fontSize: 12, fontWeight: '800', marginBottom: 4 },
  mapMock: { flex: 1, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  
  orderPopup: { position: 'absolute', bottom: 20, left: 20, right: 20, backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  newAlert: { backgroundColor: '#FEF3C7', color: '#B45309', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, fontSize: 12, fontWeight: '800', overflow: 'hidden' },
  fee: { fontSize: 20, fontWeight: '800', color: '#126D4B' },
  
  routeBox: { backgroundColor: '#F9FAFB', padding: 16, borderRadius: 12, marginBottom: 20, marginLeft: 10 },
  dotLine: { position: 'absolute', left: -10, top: 20, bottom: 20, width: 2, backgroundColor: '#D1D5DB', borderStyle: 'dashed' },
  routeItem: { marginBottom: 16 },
  routeLabel: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', marginBottom: 2 },
  routeText: { fontSize: 16, fontWeight: '600', color: '#111' },
  routeSub: { fontSize: 13, color: '#666' },

  actions: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  btnReject: { backgroundColor: '#FEE2E2' },
  btnTextReject: { color: '#DC2626', fontWeight: '700', fontSize: 16 },
  btnAccept: { backgroundColor: '#126D4B' },
  btnTextAccept: { color: '#fff', fontWeight: '700', fontSize: 16 }
});
