/**
 * Public origins only. No secrets belong in the vendor app.
 * Website/legal links use https://sokonihub.qa.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://api.sokonihub.qa').replace(/\/$/, '');

export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'https://sokonihub.qa').replace(/\/$/, '');
