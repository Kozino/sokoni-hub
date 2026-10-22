/**
 * What the buyer chose last time at checkout: delivery or pick-up, the delivery address and pin, and an
 * optional note for the seller. It is remembered on the phone so the Cart can show "Delivering to…"
 * and Checkout opens pre-filled. Nothing here is sent anywhere until an order is placed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import type { FulfilmentMode } from './types';

const KEY = 'sokoni_mobile_checkout_draft';

export type CheckoutDraft = {
  mode: FulfilmentMode;
  address: string;
  city: string;
  country: string;
  note: string;
  lat: number | null;
  lng: number | null;
};

const EMPTY: CheckoutDraft = { mode: 'delivery', address: '', city: '', country: 'Qatar', note: '', lat: null, lng: null };
let draft: CheckoutDraft = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const load = () => {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY).then((raw) => {
    if (!raw) return;
    try { draft = { ...EMPTY, ...JSON.parse(raw), ...pendingPatch }; pendingPatch = {}; emit(); } catch { /* ignore a corrupt draft */ }
  }).catch(() => {});
};
let pendingPatch: Partial<CheckoutDraft> = {};

export function updateDraft(patch: Partial<CheckoutDraft>) {
  draft = { ...draft, ...patch };
  if (!loaded) pendingPatch = { ...pendingPatch, ...patch };
  void AsyncStorage.setItem(KEY, JSON.stringify(draft)).catch(() => {});
  emit();
}
export const getDraft = () => draft;

/** Current draft plus an updater. */
export function useCheckoutDraft(): [CheckoutDraft, (patch: Partial<CheckoutDraft>) => void] {
  load();
  const value = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => draft,
    () => EMPTY,
  );
  return [value, updateDraft];
}
load();
