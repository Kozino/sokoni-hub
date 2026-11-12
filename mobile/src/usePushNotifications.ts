import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Where the last Expo push token is kept, so sign-out can remove it from the server. */
export const PUSH_TOKEN_KEY = 'sokoni.pushToken';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Registers for push and reports taps. `onOpen` receives the data a tapped notification carried (an offer's `link`,
 * or an order's `status`), including the tap that launched the app from closed.
 */
export function usePushNotifications(onOpen?: (data: unknown) => void) {
  const [expoPushToken, setExpoPushToken] = useState('');
  const open = useRef(onOpen);
  open.current = onOpen;
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        setExpoPushToken(token);
        void AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    // A tap while the app is open or in the background.
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      open.current?.(response.notification.request.content.data);
    });
    // The tap that launched the app from closed. The opener holds it until the app is ready to show it.
    try {
      void Promise.resolve(Notifications.getLastNotificationResponseAsync?.()).then((response) => {
        if (response) open.current?.(response.notification.request.content.data);
      }).catch(() => {});
    } catch { /* not available on this platform (the web preview): nothing to open */ }

    return () => {
      if (notificationListener.current) {
        notificationListener.current?.remove();
      }
      if (responseListener.current) {
        responseListener.current?.remove();
      }
    };
  }, []);

  return { expoPushToken, notification };
}

async function registerForPushNotificationsAsync() {
  let token;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
    // Offer campaigns use their own channel so they can be switched off in system settings without silencing order updates.
    await Notifications.setNotificationChannelAsync('offers', {
      name: 'Offers & updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#05663F',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return null;
    }
    
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
      if (!projectId) {
        // Fallback for bare workflows or local dev
      }
      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data;
    } catch {
      // The token fetch can fail (for example when offline). The next launch tries again.
    }
  } else {
    // Must use physical device for Push Notifications
  }

  return token;
}
