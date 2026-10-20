import * as FileSystem from 'expo-file-system';
import { api, ApiError } from './api';

/**
 * A delivery the rider has confirmed at the door but that has not reached the server yet
 * (weak signal, tunnel, basement car park). It is written to the phone first, so it survives
 * an app restart, and is retried until the server accepts it.
 */
export type PendingDelivery = {
  orderId: string;
  proofUri: string;
  lat: number;
  lng: number;
  cashCollected: boolean;
  /** Set once the photo upload succeeds, so a retry never uploads the same photo twice. */
  proofUrl?: string;
};

const file = (orderId: string) => `${FileSystem.documentDirectory ?? ''}pending-delivery-${orderId}.json`;

export const pendingDelivery = {
  async load(orderId: string): Promise<PendingDelivery | null> {
    try {
      const info = await FileSystem.getInfoAsync(file(orderId));
      if (!info.exists) return null;
      return JSON.parse(await FileSystem.readAsStringAsync(file(orderId))) as PendingDelivery;
    } catch { return null; }
  },
  async save(p: PendingDelivery) {
    try { await FileSystem.writeAsStringAsync(file(p.orderId), JSON.stringify(p)); } catch { /* best effort */ }
  },
  async clear(orderId: string) {
    await FileSystem.deleteAsync(file(orderId), { idempotent: true }).catch(() => {});
  },
};

/** Upload the photo (once), then complete the delivery. Throws ApiError; status 0 means "no connection". */
export async function sendDelivery(p: PendingDelivery): Promise<void> {
  let proofUrl = p.proofUrl;
  if (!proofUrl) {
    const form = new FormData();
    form.append('files', { uri: p.proofUri, name: 'proof.jpg', type: 'image/jpeg' } as any);
    const upload = await api.post<{ urls: string[] }>('/uploads', form);
    proofUrl = upload.urls?.[0];
    if (!proofUrl) throw new ApiError(500, 'The photo could not be uploaded. Please try again.');
    p.proofUrl = proofUrl;
    await pendingDelivery.save(p);
  }
  await api.post(`/drivers/orders/${p.orderId}/complete`, {
    proof_url: proofUrl, lat: p.lat, lng: p.lng,
    // The rider confirmed they collected the cash. The server should record it against their cash balance.
    ...(p.cashCollected ? { cash_collected: true } : {}),
  });
}

export const isOffline = (e: unknown) => e instanceof ApiError && e.status === 0;
