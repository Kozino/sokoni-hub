import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { AnimatedRegion, Marker, Polyline } from 'react-native-maps';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../providers';
import { Text } from '../ui';

const DOHA = { latitude: 25.2854, longitude: 51.531 };

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const MAP_STYLE = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

/** Bike facing right by default; rotated so it points along the direction of travel. */
function RiderMarker({ heading, color }: { heading: number; color: string }) {
  return (
    <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[styles.riderDot, { backgroundColor: color, transform: [{ rotate: `${heading - 90}deg` }] }]}>
        <Svg width={28} height={28} viewBox="0 0 24 24">
          <Circle cx={6} cy={16} r={3.5} stroke="#FFFFFF" strokeWidth={2} fill="none" />
          <Circle cx={18} cy={16} r={3.5} stroke="#FFFFFF" strokeWidth={2} fill="none" />
          <Path d="M6 16 L10 9 L15 9 L18 16 M10 9 L12 16 L6 16" stroke="#FFFFFF" strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={15} cy={5} r={2} fill="#FFFFFF" />
        </Svg>
      </View>
    </View>
  );
}

/** House icon marking the customer's confirmed delivery point. */
function DestinationMarker({ color }: { color: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[styles.destDot, { backgroundColor: color }]}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d="M3 11 L12 4 L21 11 V20 H14.5 V14.5 H9.5 V20 H3 Z" fill="#FFFFFF" strokeLinejoin="round" />
        </Svg>
      </View>
      <View style={[styles.destTip, { borderTopColor: color }]} />
    </View>
  );
}

function TrackMap({ driver, destination, live }: {
  driver: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  live: boolean;
}) {
  const { colors } = useTheme();
  const mapRef = useRef<MapView>(null);
  const start = driver ?? destination ?? { lat: DOHA.latitude, lng: DOHA.longitude };
  const position = useRef(new AnimatedRegion({ latitude: start.lat, longitude: start.lng, latitudeDelta: 0, longitudeDelta: 0 })).current;
  const [trail, setTrail] = useState<{ latitude: number; longitude: number }[]>([]);
  const [heading, setHeading] = useState(0);
  const previous = useRef<{ lat: number; lng: number } | null>(null);
  const driverLat = driver?.lat;
  const driverLng = driver?.lng;
  const destLat = destination?.lat;
  const destLng = destination?.lng;

  // Glide the bike between position updates, turn it only when it really moved,
  // and keep the rider and the delivery point in view together.
  useEffect(() => {
    if (driverLat === undefined || driverLng === undefined) return;
    const next = { lat: driverLat, lng: driverLng };
    const prev = previous.current;
    if (!prev) {
      position.setValue({ latitude: next.lat, longitude: next.lng, latitudeDelta: 0, longitudeDelta: 0 });
    } else {
      if (prev.lat === next.lat && prev.lng === next.lng) return;
      if (metres(prev, next) > 3) setHeading(bearing(prev, next));
      position.timing({ latitude: next.lat, longitude: next.lng, duration: 900, useNativeDriver: false } as any).start();
    }
    previous.current = next;
    setTrail((points) => [...points.slice(-39), { latitude: next.lat, longitude: next.lng }]);
    const coords = [{ latitude: next.lat, longitude: next.lng }];
    if (destLat !== undefined && destLng !== undefined) coords.push({ latitude: destLat, longitude: destLng });
    if (coords.length > 1) {
      mapRef.current?.fitToCoordinates(coords, { edgePadding: { top: 80, right: 60, bottom: 180, left: 60 }, animated: true });
    } else {
      mapRef.current?.animateToRegion({ latitude: next.lat, longitude: next.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 900);
    }
  }, [driverLat, driverLng, destLat, destLng, position]);

  // Before any rider has reported a position, frame the delivery point alone.
  useEffect(() => {
    if (driverLat !== undefined || destLat === undefined || destLng === undefined) return;
    mapRef.current?.animateToRegion({ latitude: destLat, longitude: destLng, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 600);
  }, [driverLat, destLat, destLng]);

  const initial = { latitude: start.lat, longitude: start.lng, latitudeDelta: 0.012, longitudeDelta: 0.012 };

  return (
    <View style={[styles.mapBox, { backgroundColor: colors.surface2 }]}>
      <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={initial} customMapStyle={MAP_STYLE} showsCompass={false} toolbarEnabled={false}>
        {trail.length > 1 ? <Polyline coordinates={trail} strokeColor={colors.primary} strokeWidth={4} /> : null}
        {destination ? (
          <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false} title="Delivery point">
            <DestinationMarker color={colors.text} />
          </Marker>
        ) : null}
        {driver ? (
          <Marker.Animated coordinate={position as any} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={true} title="Your rider">
            <RiderMarker heading={heading} color={colors.primary} />
          </Marker.Animated>
        ) : null}
      </MapView>
      {live ? (
        <View style={styles.liveBadge}>
          <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
          <Text style={styles.liveText}>Live</Text>
        </View>
      ) : null}
    </View>
  );
}


export const metersBetween = metres;
export { TrackMap };

const styles = StyleSheet.create({
  mapBox: { height: 250, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  liveBadge: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, elevation: 3 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 12, fontWeight: '800', color: '#111827' },
  riderDot: { width: 46, height: 46, borderRadius: 23, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
  destDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', elevation: 4 },
  destTip: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -1 },
});
