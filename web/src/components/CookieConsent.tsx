/**
 * Legacy component kept only so existing imports keep compiling.
 * The cookie banner and settings dialog now live in AnalyticsProvider
 * (src/analytics.tsx), which is mounted once at the app root. Rendering
 * nothing here avoids a duplicate banner.
 */
export function CookieConsent() {
  return null;
}

export default CookieConsent;
