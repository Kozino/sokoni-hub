/**
 * No credentials belong in a mobile application. These are public origins only.
 * Keep the Render origin until the api.sokonihub.qa custom domain is live, then
 * set EXPO_PUBLIC_API_URL in the EAS/Expo build environment for the next build.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://sokoni-hub.onrender.com').replace(/\/$/, '');

/** The existing Netlify site is used for legal/support pages during rollout. */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'https://sokoni-hub.netlify.app').replace(/\/$/, '');

export const SUPPORT_WHATSAPP = '97466046431';
export const SUPPORT_EMAIL = 'support@sokonihub.qa';
