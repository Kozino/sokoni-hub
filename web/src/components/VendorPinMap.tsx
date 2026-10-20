import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { PinValue } from './DeliveryPin';

/**
 * Vendor store-pin map (web only).
 *
 * First choice: Mapbox (needs VITE_MAPBOX_TOKEN, a public pk.* token). If the token is
 * missing or Mapbox refuses it, the picker falls back to the English MapLibre map below,
 * so vendors can always place the pin. Buyer maps are unchanged.
 */

const MAPBOX_TOKEN = ((import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) || '').trim();
const MAPBOX_STYLE = 'mapbox://styles/mapbox/streets-v12';
// Doha city centre, used only until the vendor places or locates the pin.
const DOHA = { lng: 51.531, lat: 25.2854 };


/* ------------------------------------------------------------------ */
/* Shared "Use my location" + readout, so both maps behave the same.   */
/* ------------------------------------------------------------------ */
function PinFooter({
  value,
  emptyText,
  onChange,
}: {
  value: PinValue | null;
  emptyText: string;
  onChange: (p: PinValue) => void;
}) {
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState('');
  const locate = () => {
    if (!navigator.geolocation) {
      setLocErr('Your browser cannot share its location. Tap the map to place the pin.');
      return;
    }
    setLocating(true);
    setLocErr('');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onChange({ latitude: p.coords.latitude, longitude: p.coords.longitude });
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
    <>
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
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Mapbox                                                               */
/* ------------------------------------------------------------------ */
function MapboxPinMap({ value, onChange, emptyText, onFail }: { value: PinValue | null; onChange: (p: PinValue) => void; emptyText: string; onFail: () => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const onFailRef = useRef(onFail);
  onChangeRef.current = onChange;
  onFailRef.current = onFail;

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const center: [number, number] = value ? [value.longitude, value.latitude] : [DOHA.lng, DOHA.lat];
    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: MAPBOX_STYLE,
        center,
        zoom: value ? 16 : 13,
        attributionControl: true,
      });
    } catch {
      onFailRef.current();
      return;
    }
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    // Vendors need English labels, not the Arabic script.
    map.on('style.load', () => {
      try {
        (map as any).setConfigProperty('basemap', 'language', 'en');
      } catch {
        /* older style: labels keep their default language */
      }
    });
    // A bad or restricted token shows up as an auth error on the map.
    map.on('error', (e: any) => {
      const status = e?.error?.status;
      if (status === 401 || status === 403) onFailRef.current();
    });

    const marker = new mapboxgl.Marker({ color: '#033B2A', draggable: true });
    if (value) marker.setLngLat(center).addTo(map);
    marker.on('dragend', () => {
      const ll = marker.getLngLat();
      onChangeRef.current({ latitude: ll.lat, longitude: ll.lng });
    });
    map.on('click', (e) => onChangeRef.current({ latitude: e.lngLat.lat, longitude: e.lngLat.lng }));

    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // The map is created once. Later pin changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div>
      <div ref={containerRef} style={{ height: 300, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border, #d9ded9)' }} />
      <PinFooter value={value} emptyText={emptyText} onChange={onChange} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* English vector map (fallback)                                        */
/* ------------------------------------------------------------------ */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

function MapLibrePinMap({ value, onChange, emptyText }: { value: PinValue | null; onChange: (p: PinValue) => void; emptyText: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);

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
    map.on('click', (e) => onChangeRef.current({ latitude: e.lngLat.lat, longitude: e.lngLat.lng }));

    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div>
      <div ref={containerRef} style={{ height: 300, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border, #d9ded9)' }} />
      <PinFooter value={value} emptyText={emptyText} onChange={onChange} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Public component                                                     */
/* ------------------------------------------------------------------ */
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
  const [mapboxFailed, setMapboxFailed] = useState(!MAPBOX_TOKEN);
  return (
    <div>
      {mapboxFailed ? (
        <MapLibrePinMap value={value} onChange={onChange} emptyText={emptyText} />
      ) : (
        <MapboxPinMap value={value} onChange={onChange} emptyText={emptyText} onFail={() => setMapboxFailed(true)} />
      )}
      {error && <div style={{ color: 'var(--danger, #b42318)', fontSize: '.85rem', marginTop: 6 }}>{error}</div>}
    </div>
  );
}
