import { createNavigationContainerRef } from '@react-navigation/native';

/** The one navigation handle: lets code outside a screen (the toast, notification taps, links) move around the app. */
export const navigationRef = createNavigationContainerRef<any>();
