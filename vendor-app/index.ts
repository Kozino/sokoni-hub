import { registerRootComponent } from 'expo';

import App from './App';

// One registration, in one place. App.tsx used to call registerRootComponent
// itself while `main` pointed at expo/AppEntry.js, which registered it twice.
registerRootComponent(App);
