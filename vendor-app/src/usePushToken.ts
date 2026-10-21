import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Where the last Expo push token is kept, so sign-out can remove it from the server. */
export const PUSH_TOKEN_KEY = 'sokoni.vendor.pushToken';

/**
 * Android channel for order and booking alerts. Must match the API's channelId.
 * Android fixes a channel's sound the first time it is created, so the sound change uses a new id.
 */
export const VENDOR_CHANNEL_ID = 'vendor-alerts-loud';

/** Bundled alert tone (assets/sounds/order_alert.wav). The API sends the same file name. */
export const ALERT_SOUND = 'order_alert.wav';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushState = {
  state: 'ready' | 'off' | 'denied' | 'unavailable';
  message: string;
  canOpenSettings: boolean;
  token: string;
};

const state = (s: PushState['state'], message: string, canOpenSettings = false, token = ''): PushState => ({ state: s, message, canOpenSettings, token });

/** Creates the loud alert channel. Safe to call every time the app starts. */
export async function ensureAlertChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(VENDOR_CHANNEL_ID, {
    name: 'Order and booking alerts',
    description: 'New orders, new bookings and cancellations. Plays a loud alert tone.',
    importance: Notifications.AndroidImportance.MAX,
    sound: ALERT_SOUND,
    // Alarm usage plays on the alarm volume, which is much louder than normal notifications.
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
    vibrationPattern: [0, 700, 250, 700, 250, 700],
    lightColor: '#FC7800',
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });
}

async function fetchToken(): Promise<PushState> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    return state('unavailable', 'This build is not linked to an Expo project, so it cannot receive alerts. Rebuild after running "npx eas init" in the vendor app.');
  }
  try {
    const res = await Notifications.getExpoPushTokenAsync({ projectId });
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, res.data);
    return state('ready', 'Alerts are on for this phone.', false, res.data);
  } catch (e: any) {
    return state('unavailable', `This phone could not register for alerts. ${e?.message ?? ''}`.trim());
  }
}

/** Reads the current state without asking the user anything. */
export async function checkPush(): Promise<PushState> {
  if (!Device.isDevice) return state('unavailable', 'Alerts need a real phone. Simulators cannot receive them.');
  await ensureAlertChannel();
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    return state('off', 'Notifications are off for Sokoni Vendor, so you will not hear new orders or bookings.', !canAskAgain);
  }
  return fetchToken();
}

/** Asks for permission if the app can, then registers the phone. */
export async function enablePush(): Promise<PushState> {
  if (!Device.isDevice) return state('unavailable', 'Alerts need a real phone. Simulators cannot receive them.');
  await ensureAlertChannel();
  let perm = await Notifications.getPermissionsAsync();
  if (perm.status !== 'granted' && perm.canAskAgain) {
    perm = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
  }
  if (perm.status !== 'granted') {
    return state('denied', 'Notifications are off for Sokoni Vendor. Turn them on in your phone settings.', true);
  }
  return fetchToken();
}

/** Opens this app's notification settings so the vendor can switch them on. */
export function openNotificationSettings(): void {
  void Linking.openSettings();
}

/** Returns this phone's Expo push token once it is registered ('' otherwise). Used by the app shell. */
export function usePushToken(): string {
  const [token, setToken] = useState('');
  useEffect(() => {
    enablePush()
      .then((r) => {
        if (r.token) setToken(r.token);
      })
      .catch(() => {});
  }, []);
  return token;
}
