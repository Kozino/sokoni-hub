import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { Camera, CameraType } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';

export function ActiveDelivery({ orderId, onComplete, onCancel }: { orderId: string; onComplete: () => void; onCancel: () => void }) {
  const [step, setStep] = useState<'pickup' | 'transit' | 'proof'>('pickup');
  const [cameraPermission, requestPermission] = Camera.useCameraPermissions();
  const [camera, setCamera] = useState<Camera | null>(null);

  const mockOrder = {
    id: orderId,
    vendor: { name: 'Mama Africa Store', address: 'Doha Festival City', phone: '+974 5555 1111' },
    buyer: { name: 'Sarah M.', address: 'Building 12, Street 8, Al Wakra', phone: '+974 5555 2222' }
  };

  const openNav = (addr: string) => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(addr)}`);
  const call = (num: string) => Linking.openURL(`tel:${num}`);

  if (step === 'proof') {
    if (!cameraPermission) return <View />;
    if (!cameraPermission.granted) {
      return (
        <SafeAreaView style={styles.container}>
          <Text style={{ textAlign: 'center', marginTop: 100 }}>We need your permission to show the camera</Text>
          <TouchableOpacity onPress={requestPermission} style={styles.actionBtn}><Text style={styles.actionBtnText}>Grant Permission</Text></TouchableOpacity>
        </SafeAreaView>
      );
    }

    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Camera style={{ flex: 1 }} type={CameraType.back} ref={setCamera}>
          <View style={{ flex: 1, justifyContent: 'flex-end', padding: 30 }}>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', padding: 15, borderRadius: 10, marginBottom: 20 }}>
              <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16 }}>Take a clear photo of the package at the door</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setStep('transit')}><Text style={{ color: '#fff', fontSize: 18 }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity 
                style={{ width: 70, height: 70, backgroundColor: '#fff', borderRadius: 35, borderWidth: 4, borderColor: '#ccc' }}
                onPress={() => {
                  // Mock picture taken
                  setTimeout(() => {
                    alert('Proof of delivery uploaded successfully!');
                    onComplete();
                  }, 1000);
                }}
              />
              <View style={{ width: 50 }} />
            </View>
          </View>
        </Camera>
      </View>
    );
  }

  const isTransit = step === 'transit';
  const target = isTransit ? mockOrder.buyer : mockOrder.vendor;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{isTransit ? 'Deliver to Buyer' : 'Pick up Order'}</Text>
        <Text style={styles.orderId}>{mockOrder.id}</Text>
      </View>

      <View style={styles.mapMock}>
        <Text style={{ color: '#999' }}>Live Navigation Map</Text>
      </View>

      <View style={styles.bottomSheet}>
        <Text style={styles.destLabel}>{isTransit ? 'DROPOFF AT' : 'PICKUP AT'}</Text>
        <Text style={styles.destName}>{target.name}</Text>
        <Text style={styles.destAddr}>{target.address}</Text>

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => call(target.phone)}>
            <Text style={styles.iconBtnText}>📞 Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { flex: 2, backgroundColor: '#111' }]} onPress={() => openNav(target.address)}>
            <Text style={[styles.iconBtnText, { color: '#fff' }]}>🗺 Navigate</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={styles.actionBtn} 
          onPress={() => isTransit ? setStep('proof') : setStep('transit')}
        >
          <Text style={styles.actionBtnText}>{isTransit ? 'Confirm Delivery (Camera)' : 'I have picked up the order'}</Text>
        </TouchableOpacity>
        
        {!isTransit && (
          <TouchableOpacity style={{ marginTop: 15 }} onPress={onCancel}>
            <Text style={{ color: '#DC2626', textAlign: 'center', fontWeight: '600' }}>Cancel Delivery</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold' },
  orderId: { fontSize: 14, color: '#666', backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  mapMock: { flex: 1, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  bottomSheet: { backgroundColor: '#fff', padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 20 },
  destLabel: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', marginBottom: 4 },
  destName: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 4 },
  destAddr: { fontSize: 15, color: '#666', marginBottom: 20 },
  btnRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  iconBtn: { flex: 1, backgroundColor: '#F3F4F6', padding: 14, borderRadius: 12, alignItems: 'center' },
  iconBtnText: { fontSize: 16, fontWeight: '600', color: '#111' },
  actionBtn: { backgroundColor: '#126D4B', padding: 18, borderRadius: 12, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});
