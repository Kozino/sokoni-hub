export type Screen = 'welcome' | 'home' | 'browse' | 'cart' | 'account' | 'login' | 'register' | 'pin' | 'pinsetup' | 'forgot' | 'listing' | 'store' | 'checkout' | 'orders' | 'bookings' | 'track' | 'booking' | 'support' | 'saved' | 'notifications' | 'legal';
export type Nav = { screen: Screen; params?: Record<string, any>; id?: number };
