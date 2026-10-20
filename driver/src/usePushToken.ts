import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Where the last Expo push token is kept, so sign-out can remove it from the server. */
export const PUSH_TOKEN_KEY = 'sokoni.pushToken';

/** Android channel for delivery-job alerts. Channel sound is fixed when a channel is first created,
 *  so this is a new id: installs that already have the old 'default' channel still get the sound. */
export const JOB_CHANNEL_ID = 'delivery-jobs';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Returns this device's Expo push token once permission is granted ('' otherwise). */
export function usePushToken(): string {
  const [token, setToken] = useState('');
  useEffect(() => {
    registerForPush()
      .then((t) => {
        if (!t) return;
        setToken(t);
        void AsyncStorage.setItem(PUSH_TOKEN_KEY, t);
      })
      .catch(() => {});
  }, []);
  return token;
}

async function registerForPush(): Promise<string> {
  if (!Device.isDevice) return '';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync(JOB_CHANNEL_ID, {
      name: 'Delivery jobs',
      description: 'New delivery jobs near you',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 300, 200, 300],
      lightColor: '#FF7A00',
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return '';
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const res = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return res.data;
}
