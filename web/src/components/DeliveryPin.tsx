import { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Alert } from './ui';

export type PinValue = { latitude: number; longitude: number };

// Doha city centre, used only until the customer places or shares a location.
const DOHA: PinValue = { latitude: 25.2854, longitude: 51.531 };

// A drawn pin instead of Leaflet's default image, so no image assets need to load.
const pinIcon = L.divIcon({
  className: 'delivery-pin-icon',
  iconSize: [34, 42],
  iconAnchor: [17, 42],
  html: '<svg width="34" height="42" viewBox="0 0 34 42" aria-hidden="true"><path d="M17 0C7.6 0 0 7.6 0 17c0 12.7 17 25 17 25s17-12.3 17-25C34 7.6 26.4 0 17 0z" fill="#033B2A"/><circle cx="17" cy="17" r="6.5" fill="#fff"/></svg>',
});

function ClickToPlace({ onPlace }: { onPlace: (p: PinValue) => void }) {
  useMapEvents({
    click(e) {
      onPlace({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    },
  });
  return null;
}

/* Keeps the map centred on the pin after it is placed, located or dragged. */
function FollowPin({ latitude, longitude }: { latitude?: number; longitude?: number }) {
  const map = useMap();
  useEffect(() => {
    if (latitude === undefined || longitude === undefined) return;
    map.setView([latitude, longitude], Math.max(map.getZoom(), 16));
  }, [latitude, longitude, map]);
  return null;
}

export function DeliveryPin({ value, onChange, error }: { value: PinValue | null; onChange: (p: PinValue) => void; error?: string }) {
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState('');
  const center = value ?? DOHA;

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
    <div>
      <div style={{ height: 300, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border, #d9ded9)' }}>
        <MapContainer center={[center.latitude, center.longitude]} zoom={value ? 16 : 13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <ClickToPlace onPlace={onChange} />
          {value && (
            <Marker
              position={[value.latitude, value.longitude]}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend(e) {
                  const ll = e.target.getLatLng();
                  onChange({ latitude: ll.lat, longitude: ll.lng });
                },
              }}
            />
          )}
          <FollowPin latitude={value?.latitude} longitude={value?.longitude} />
        </MapContainer>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <span className="muted" style={{ fontSize: '.85rem' }}>
          {value ? `Pin set at ${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}. Drag it or tap the map to adjust.` : 'Tap the map to drop the pin on your door.'}
        </span>
        <button type="button" className="btn btn-outline btn-sm" onClick={locate} disabled={locating}>
          {locating ? 'Locating…' : 'Use my location'}
        </button>
      </div>
      {locErr && <div style={{ marginTop: 8 }}><Alert kind="warn">{locErr}</Alert></div>}
      {error && <div style={{ color: 'var(--danger, #b42318)', fontSize: '.85rem', marginTop: 6 }}>{error}</div>}
    </div>
  );
}
