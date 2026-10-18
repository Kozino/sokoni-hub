import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CheckIcon } from 'react-native-heroicons/outline';
import { api } from '../../api';
import { Button, Card, Notice, ScreenHeader } from '../../components/UI';
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
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Vehicle details" subtitle="Used to match you with suitable orders" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.label}>Vehicle type</Text>
          <View style={styles.options}>
            {VEHICLES.map((v) => {
              const on = vehicle === v;
              return (
                <Pressable key={v} accessibilityRole="button" onPress={() => { setVehicle(v); setSaved(false); }} style={[styles.option, on && styles.optionOn]}>
                  {on ? <CheckIcon size={16} color={C.primary} /> : null}
                  <Text style={[styles.optionText, on && { color: C.primary }]}>{v}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { marginTop: 18 }]}>Licence plate / vehicle ID</Text>
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
        {saved ? <View style={{ marginTop: 14 }}><Notice>Vehicle details saved.</Notice></View> : null}
        <View style={{ marginTop: 18 }}>
          <Button title="Save changes" onPress={save} loading={busy} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 18, paddingBottom: 32 },
  label: { fontSize: 13, fontWeight: '800', color: C.text },
  hint: { fontSize: 12, color: C.text2, marginTop: 3, marginBottom: 8 },
  options: { flexDirection: 'row', gap: 10, marginTop: 10 },
  option: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
  optionOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  optionText: { fontSize: 14, fontWeight: '800', color: C.text2 },
  input: { marginTop: 8, minHeight: 50, borderRadius: 12, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, fontSize: 15, color: C.text },
});
