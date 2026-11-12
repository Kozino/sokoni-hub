/**
 * Opens an in-app link from anywhere: a tapped notification, an offer card, a `sokonihub://` address.
 *
 * Links that arrive before the app is ready (a notification tapped while the app was closed, or while the welcome
 * pages or sign-in check are still showing) are held and opened as soon as the navigator exists. Every link opens
 * with Home underneath it, so Back always has somewhere sensible to go.
 */
import { updateDraft } from './checkoutDraft';
import { cleanPromo } from './data';
import { resolveLink } from './links';
import { navigationRef } from './navRef';

let pending: string | null = null;
/** Set by the app shell: false until the welcome pages are done and the account check has finished. */
let appReady = false;

export function setLinksReady(ready: boolean) {
  appReady = ready;
  if (ready) flushPendingLink();
}

/** Opens `link` now if the app is ready, otherwise holds it. Returns false only for a link we do not recognise. */
export function openAppLink(link?: string | null): boolean {
  const target = resolveLink(link);
  if (!target) return false;
  if (!appReady || !navigationRef.isReady()) { pending = String(link); return true; }
  if (target.applyCode) updateDraft({ promo: cleanPromo(target.applyCode) });
  const route = { name: target.screen, params: target.params };
  navigationRef.reset(target.tab
    ? { index: 0, routes: [route] }
    : { index: 1, routes: [{ name: 'home' }, route] });
  return true;
}

export function flushPendingLink() {
  if (!pending || !appReady || !navigationRef.isReady()) return;
  const link = pending;
  pending = null;
  openAppLink(link);
}
