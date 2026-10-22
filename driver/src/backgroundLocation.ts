/**
 * Background location for riders (QC item 14).
 *
 * While a rider is online, their position is sent to Sokoni Hub even when the app is in the
 * background or the screen is off. On Android this runs as a foreground service with a
 * visible notification; on iOS it uses the background location mode.
 *
 * This module must be imported once at app start, so the task is defined before it runs.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api } from './api';

export const RIDER_LOCATION_TASK = 'sokoni-rider-location';

TaskManager.defineTask(RIDER_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
  const latest = locations[locations.length - 1];
  if (!latest) return;
  try {
    await api.post('/drivers/status', {
      is_online: true,
      lat: latest.coords.latitude,
      lng: latest.coords.longitude,
    });
  } catch {
    // The next location update retries.
  }
});

/**
 * Starts background tracking. Asks for permission if needed.
 * Returns false when the rider has not allowed location, so the caller can explain why.
 */
export async function startRiderTracking(): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return false;
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') return false;
  return startTaskIfNeeded();
}

/** Restarts tracking after the app opens, only if the rider already allowed it. Never prompts. */
export async function resumeRiderTracking(): Promise<void> {
  try {
    const foreground = await Location.getForegroundPermissionsAsync();
    const background = await Location.getBackgroundPermissionsAsync();
    if (foreground.status === 'granted' && background.status === 'granted') {
      await startTaskIfNeeded();
    }
  } catch {
    // Tracking resumes the next time the rider goes online.
  }
}

async function startTaskIfNeeded(): Promise<boolean> {
  if (await Location.hasStartedLocationUpdatesAsync(RIDER_LOCATION_TASK)) return true;
  await Location.startLocationUpdatesAsync(RIDER_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 20000,
    distanceInterval: 50,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Sokoni Driver',
      notificationBody: 'Sharing your location while you are online.',
      notificationColor: '#0F7B5F',
    },
  });
  return true;
}

/** Stops background tracking (going offline, or signing out). */
export async function stopRiderTracking(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(RIDER_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(RIDER_LOCATION_TASK);
    }
  } catch {
    // Already stopped.
  }
}
