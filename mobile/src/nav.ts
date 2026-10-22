/** Route names and the navigation callbacks `App.tsx` passes to every screen. */
export type Screen =
  | 'welcome' | 'home' | 'browse' | 'services' | 'cart' | 'account' | 'login' | 'register' | 'pin' | 'pinsetup' | 'forgot'
  | 'listing' | 'store' | 'checkout' | 'orders' | 'bookings' | 'track' | 'booking' | 'support' | 'saved' | 'notifications' | 'legal';

/** Push a screen on top of the current one (back returns here). */
export type Go = (screen: Screen, params?: Record<string, any>) => void;

/** Switch bottom-tab sections: replaces the stack so Back never walks through every tab you visited. */
export type TabTo = (screen: Screen, params?: Record<string, any>) => void;

export type NavProps = { go: Go; back: () => void; tab: TabTo; done?: () => void };

/** Which bottom-nav item is lit for a screen. */
export type TabKey = 'home' | 'browse' | 'services' | 'cart' | 'account' | 'none';
