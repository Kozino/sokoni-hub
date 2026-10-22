import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, type LatLng } from 'react-native-maps';
import * as Location from 'expo-location';
import { Icon } from './icons';
import { Button, Notice, Text } from './ui';
import { useTheme } from './providers';

export type DeliveryPinValue = { latitude: number; longitude: number };

// Doha city centre, used only until the customer shares a location.
const DOHA: LatLng = { latitude: 25.2854, longitude: 51.531 };

type Props = {
  value: DeliveryPinValue | null;
  error?: string;
  onConfirm: (pin: DeliveryPinValue, suggestedAddress: string) => void;
};

/**
 * Asks the customer to confirm where the rider should deliver. The pin can be
 * set from the device GPS, by tapping the map, or by dragging the marker. Nothing
 * is saved until the customer presses Confirm.
 */
export function DeliveryPin({ value, error, onConfirm }: Props) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<LatLng | null>(value);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const confirmed = !!value && !!draft && value.latitude === draft.latitude && value.longitude === draft.longitude;

  const useCurrent = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert(
          'Location is off',
          'Allow location for Sokoni Hub in your phone settings, or drop the pin on the map instead.',
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Open settings', onPress: () => void Linking.openSettings() }],
        );
        return;
      }
      const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setDraft({ latitude: here.coords.latitude, longitude: here.coords.longitude });
    } catch {
      Alert.alert('Could not find you', 'Move the pin on the map to your door instead.');
    } finally {
      setLocating(false);
    }
  };

  const confirm = async () => {
    if (!draft) return;
    setSaving(true);
    let suggestion = '';
    try {
      // Reverse geocoding only suggests text. The customer still types or edits the address.
      const [place] = await Location.reverseGeocodeAsync({ latitude: draft.latitude, longitude: draft.longitude });
      if (place) {
        suggestion = Array.from(new Set([place.street || place.name, place.district || place.subregion, place.city].filter(Boolean) as string[])).join(', ');
      }
    } catch {
      // Offline or unavailable: the pin is still valid without a suggested address.
    }
    onConfirm({ latitude: draft.latitude, longitude: draft.longitude }, suggestion);
    setSaving(false);
  };

  const center = draft ?? value ?? DOHA;

  return (
    <View style={[styles.wrap, error ? { borderColor: colors.danger, borderWidth: 1, padding: 8 } : null]}>
      <Text style={[styles.hint, { color: colors.text2 }]}>
        Tap the map or drag the pin to your building entrance. The rider uses this exact point.
      </Text>

      <View style={[styles.mapBox, { borderColor: colors.border }]}>
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={{ ...center, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
          onPress={(event) => setDraft(event.nativeEvent.coordinate)}
          showsUserLocation={false}
          toolbarEnabled={false}
        >
          {draft ? (
            <Marker
              coordinate={draft}
              draggable
              onDragEnd={(event) => setDraft(event.nativeEvent.coordinate)}
              anchor={{ x: 0.5, y: 1 }}
              pinColor={colors.primary}
            />
          ) : null}
        </MapView>
      </View>

      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={() => void useCurrent()} disabled={locating} style={[styles.chip, { borderColor: colors.primary }]}>
          <Icon name="location" size={13} color={colors.primary} />
          <Text style={[styles.chipText, { color: colors.primary }]}>{locating ? 'Finding you…' : 'Use my location'}</Text>
        </Pressable>
        {confirmed ? (
          <View style={[styles.chip, { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }]}>
            <Icon name="checkmark-circle" size={13} color={colors.primary} />
            <Text style={[styles.chipText, { color: colors.primary }]}>Pin confirmed</Text>
          </View>
        ) : null}
      </View>

      {draft && !confirmed ? (
        <Button onPress={() => void confirm()} loading={saving} style={{ marginTop: 8, minHeight: 38 }}>Confirm this location</Button>
      ) : null}
      {error ? <View style={{ marginTop: 10 }}><Notice type="warning">{error}</Notice></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 12 },
  hint: { fontSize: 10.5, lineHeight: 15 },
  mapBox: { height: 150, borderRadius: 12, overflow: 'hidden', borderWidth: 1, marginTop: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 10.5, fontWeight: '600' },
});
