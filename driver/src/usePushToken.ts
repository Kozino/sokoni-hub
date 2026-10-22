import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Where the last Expo push token is kept, so sign-out can remove it from the server. */
export const PUSH_TOKEN_KEY = 'sokoni.pushToken';

/**
 * A fresh channel id is intentional: Android freezes the sound and importance of an existing
 * channel. The driver API sends remote job alerts to this same id.
 */
export const JOB_CHANNEL_ID = 'delivery-jobs-v2';
export const DELIVERY_ALERT_SOUND = 'delivery_alert.wav';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

let channelSetup: Promise<void> | null = null;

/** Creates the audible driver-alert channel on Android, including on emulators. */
export function configureDeliveryNotifications(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!channelSetup) {
    channelSetup = Notifications.setNotificationChannelAsync(JOB_CHANNEL_ID, {
      name: 'Delivery job alerts',
      description: 'Audible alerts for new and released Sokoni delivery jobs',
      importance: Notifications.AndroidImportance.MAX,
      sound: DELIVERY_ALERT_SOUND,
      vibrationPattern: [0, 350, 180, 350, 180, 500],
      lightColor: '#F57C00',
      enableVibrate: true,
      enableLights: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.NOTIFICATION,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    }).then(() => undefined).catch((error) => {
      channelSetup = null;
      throw error;
    });
  }
  return channelSetup;
}

async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  return status === 'granted';
}

/**
 * Sends a real local notification through the same channel and custom tone used by job alerts.
 * This also works on an emulator, where a remote Expo push token may not be available.
 */
export async function scheduleDeliveryAlertTest(): Promise<void> {
  if (Platform.OS === 'web') throw new Error('Open the Android or iOS app to test notification audio.');
  await configureDeliveryNotifications();
  if (!(await ensureNotificationPermission())) {
    throw new Error('Notifications are disabled. Allow notifications for Sokoni Driver in your device settings, then try again.');
  }
  if (Platform.OS === 'android') {
    const channel = await Notifications.getNotificationChannelAsync(JOB_CHANNEL_ID);
    if (channel?.importance === Notifications.AndroidImportance.NONE || channel?.sound === null) {
      throw new Error('Delivery job alerts are silent or blocked. Enable sound for the Delivery job alerts channel in Android notification settings.');
    }
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Sokoni Driver alert test',
      body: 'Your delivery alert sound and vibration are working.',
      data: { alertTest: true },
      sound: DELIVERY_ALERT_SOUND,
      priority: Notifications.AndroidNotificationPriority.MAX,
      color: '#F57C00',
      vibrate: [0, 350, 180, 350],
    },
    trigger: { seconds: 2, channelId: JOB_CHANNEL_ID },
  });
}

/** Returns this device's Expo push token once permission is granted ('' otherwise). */
export function usePushToken(): string {
  const [token, setToken] = useState('');
  useEffect(() => {
    registerForPush()
      .then((value) => {
        if (!value) return;
        setToken(value);
        void AsyncStorage.setItem(PUSH_TOKEN_KEY, value);
      })
      .catch((error) => {
        // A missing development project id or emulator push service must not block the app.
        console.warn('[driver notifications] Push registration unavailable:', error instanceof Error ? error.message : error);
      });
  }, []);
  return token;
}

async function registerForPush(): Promise<string> {
  if (Platform.OS === 'web') return '';
  await configureDeliveryNotifications();
  if (!(await ensureNotificationPermission())) return '';
  // Local alert tests still work on emulators; remote push registration generally needs a device.
  if (!Device.isDevice) return '';
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const res = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return res.data;
}
