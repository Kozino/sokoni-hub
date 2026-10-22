import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CheckIcon, TruckIcon } from 'react-native-heroicons/outline';
import { api } from '../../api';
import { Badge, Button, Card, Notice, ScreenHeader } from '../../components/UI';
import { errorText } from '../../format';
import { C } from '../../theme';
import type { DriverProfile } from './types';

const VEHICLES = ['Motorcycle', 'Car', 'Van'] as const;

export function VehicleDetails({ driver, onBack, onSaved }: { driver: DriverProfile; onBack: () => void; onSaved: (d: DriverProfile) => void }) {
  const [vehicle, setVehicle] = useState<DriverProfile['vehicle_type']>(driver.vehicle_type);
  const [plate, setPlate] = useState(driver.license_plate ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (plate.trim().length < 2) return Alert.alert('Plate required', 'Enter your licence plate or vehicle ID.');
    setBusy(true);
    try {
      const res = await api.patch<{ driver: DriverProfile }>('/drivers/me', { vehicle_type: vehicle, license_plate: plate.trim() });
      onSaved(res.driver);
      setSaved(true);
    } catch (e) {
      Alert.alert('Could not save', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <ScreenHeader title="Vehicle & equipment" subtitle="Used to match you with suitable orders" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Card style={styles.summary}>
          <View style={styles.summaryIcon}><TruckIcon size={28} color={C.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryLabel}>REGISTERED VEHICLE</Text>
            <Text style={styles.summaryTitle}>{vehicle}</Text>
            <Text style={styles.summarySub}>Qatar plate · {plate.trim() || 'Not provided'}</Text>
          </View>
          <Badge label="Driver vehicle" />
        </Card>

        <Card style={{ marginTop: 12 }}>
          <Text style={styles.formTitle}>Vehicle details</Text>
          <Text style={styles.formSub}>Keep this information consistent with your vehicle registration.</Text>
          <Text style={[styles.label, { marginTop: 20 }]}>Vehicle type</Text>
          <View style={styles.options}>
            {VEHICLES.map((item) => {
              const selected = vehicle === item;
              return (
                <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { setVehicle(item); setSaved(false); }} style={[styles.option, selected && styles.optionOn]}>
                  {selected ? <CheckIcon size={15} color={C.primary} /> : null}
                  <Text style={[styles.optionText, selected && { color: C.primary }]} numberOfLines={1}>{item}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { marginTop: 20 }]}>Licence plate / vehicle ID</Text>
          <Text style={styles.hint}>As printed on your vehicle registration.</Text>
          <TextInput
            accessibilityLabel="Licence plate"
            value={plate}
            onChangeText={(t) => { setPlate(t); setSaved(false); }}
            autoCapitalize="characters"
            placeholder="e.g. 12345 ABC"
            placeholderTextColor={C.muted}
            style={styles.input}
          />
        </Card>
        {saved ? <View style={{ marginTop: 12 }}><Notice>Vehicle details saved to your driver profile.</Notice></View> : null}
        <Button title="Save vehicle details" onPress={save} loading={busy} style={{ marginTop: 16 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16, paddingBottom: 32 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryIcon: { width: 54, height: 54, borderRadius: 17, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { color: C.text2, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  summaryTitle: { color: C.text, fontSize: 18, fontWeight: '900', marginTop: 3 },
  summarySub: { color: C.text2, fontSize: 11, marginTop: 3 },
  formTitle: { color: C.text, fontSize: 16, fontWeight: '900' },
  formSub: { color: C.text2, fontSize: 11, lineHeight: 16, marginTop: 4 },
  label: { fontSize: 11, fontWeight: '900', color: C.text },
  hint: { fontSize: 11, color: C.text2, marginTop: 4, marginBottom: 8 },
  options: { flexDirection: 'row', gap: 8, marginTop: 10 },
  option: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, paddingHorizontal: 4 },
  optionOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  optionText: { flexShrink: 1, fontSize: 12, fontWeight: '800', color: C.text2 },
  input: { marginTop: 8, minHeight: 52, borderRadius: 14, backgroundColor: C.field, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, fontSize: 14, color: C.text },
});
