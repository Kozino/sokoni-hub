import * as Haptics from 'expo-haptics';

// Light feedback for taps and a stronger "done" pulse. Failures (web, unsupported devices) are ignored.
export const tap = () => { void Haptics.selectionAsync().catch(() => {}); };
export const success = () => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };
