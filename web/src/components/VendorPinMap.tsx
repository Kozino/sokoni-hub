import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { PinValue } from './DeliveryPin';

// Vendor store-pin map. Uses a vector map with English place names (free, no API key),
// so vendors can read street and area names while placing their shop. Buyer maps are unchanged.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
// Doha city centre, used only until the vendor places or locates the pin.
const DOHA = { lng: 51.531, lat: 25.2854 };

export function VendorPinMap({
  value,
  onChange,
  error,
  emptyText = 'Tap the map to drop the pin on your shop entrance.',
}: {
  value: PinValue | null;
  onChange: (p: PinValue) => void;
  error?: string;
  emptyText?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState('');

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const center: [number, number] = value ? [value.longitude, value.latitude] : [DOHA.lng, DOHA.lat];
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center,
      zoom: value ? 16 : 13,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    // The base style prints the local (Arabic) name under the Latin one. Vendors need
    // English, so every place label uses the Latin-script name only.
    map.on('style.load', () => {
      for (const layer of map.getStyle().layers) {
        if (layer.type !== 'symbol') continue;
        const field = map.getLayoutProperty(layer.id, 'text-field');
        if (field === undefined) continue;
        if (!JSON.stringify(field).includes('name')) continue;
        map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]);
      }
    });

    const marker = new maplibregl.Marker({ color: '#033B2A', draggable: true });
    marker.on('dragend', () => {
      const ll = marker.getLngLat();
      onChangeRef.current({ latitude: ll.lat, longitude: ll.lng });
    });

    map.on('click', (e) => {
      onChangeRef.current({ latitude: e.lngLat.lat, longitude: e.lngLat.lng });
    });

    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // The map is created once; later pin changes are applied in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the marker and the view in step with the saved pin.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    if (!value) {
      marker.remove();
      return;
    }
    marker.setLngLat([value.longitude, value.latitude]).addTo(map);
    map.easeTo({ center: [value.longitude, value.latitude], zoom: Math.max(map.getZoom(), 16), duration: 400 });
  }, [value]);

  const locate = () => {
    if (!navigator.geolocation) {
      setLocErr('Your browser cannot share its location. Tap the map to place the pin.');
      return;
    }
    setLocating(true);
    setLocErr('');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onChangeRef.current({ latitude: p.coords.latitude, longitude: p.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocErr('We could not read your location. Allow location access, or tap the map to place the pin.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  return (
    <div>
      <div
        ref={containerRef}
        style={{ height: 300, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border, #d9ded9)' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <span className="muted" style={{ fontSize: '.85rem' }}>
          {value
            ? `Pin set at ${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}. Drag it or tap the map to adjust.`
            : emptyText}
        </span>
        <button type="button" className="btn btn-outline btn-sm" onClick={locate} disabled={locating}>
          {locating ? 'Locating…' : 'Use my location'}
        </button>
      </div>
      {locErr && <div style={{ marginTop: 8, color: 'var(--danger, #b42318)', fontSize: '.85rem' }}>{locErr}</div>}
      {error && <div style={{ color: 'var(--danger, #b42318)', fontSize: '.85rem', marginTop: 6 }}>{error}</div>}
    </div>
  );
}
