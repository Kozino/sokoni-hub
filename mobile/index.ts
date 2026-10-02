import { registerRootComponent } from 'expo';
import * as SplashScreen from 'expo-splash-screen';

import App from './App';

// Keep the native splash visible until the app has read its saved state (see App.tsx), then fade it out.
SplashScreen.setOptions({ duration: 250, fade: true });
SplashScreen.preventAutoHideAsync().catch(() => {});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
