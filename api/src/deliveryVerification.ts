import { one } from './db';

export type VerificationSettings = { auto_complete_hours: number; geofence_metres: number };

const DEFAULTS: VerificationSettings = { auto_complete_hours: 24, geofence_metres: 150 };

/** Reads the admin-editable window and geofence, falling back to safe defaults. */
export async function verificationSettings(): Promise<VerificationSettings> {
  const row = await one<{ value: any }>(`select value from system_settings where key = 'delivery_verification'`);
  const v = row?.value ?? {};
  const hours = Number(v.auto_complete_hours);
  const metres = Number(v.geofence_metres);
  return {
    auto_complete_hours: Number.isFinite(hours) && hours >= 1 && hours <= 168 ? hours : DEFAULTS.auto_complete_hours,
    geofence_metres: Number.isFinite(metres) && metres >= 30 && metres <= 1000 ? metres : DEFAULTS.geofence_metres,
  };
}

/** Great-circle distance in metres between two lat/lng points. */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
