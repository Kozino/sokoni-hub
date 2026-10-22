import { StyleSheet, View } from 'react-native';
import { useTheme } from '../providers';
import { Icon } from '../icons';
import { Text } from '../ui';

/** Web stand-in: native maps are not available in a browser, so show where the delivery point is. */
export function TrackMap({ driver, destination, live }: { driver: { lat: number; lng: number } | null; destination: { lat: number; lng: number } | null; live: boolean }) {
  const { colors } = useTheme();
  const point = driver ?? destination;
  return (
    <View style={[styles.box, { backgroundColor: colors.surface2 }]}>
      <Icon name="map" solid={false} size={30} color={colors.primary} />
      <Text style={{ color: colors.text2, fontSize: 11.5, fontWeight: '600', marginTop: 8 }}>{point ? `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}${live ? ' · live' : ''}` : 'Map available in the mobile app'}</Text>
    </View>
  );
}
export const metersBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000; const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const styles = StyleSheet.create({ box: { height: 200, borderRadius: 20, alignItems: 'center', justifyContent: 'center' } });
