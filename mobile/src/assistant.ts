import { api, ApiError, assistantGuest } from './api';
import type { CartItem } from './types';

export type AgentCard = {
  id: string;
  vendor_id: string;
  kind: 'product' | 'service';
  title: string;
  price: number;
  currency: string;
  quantity: number | null;
  unit: string | null;
  options: { name: string; price?: number }[];
  images: string[];
  business_name?: string;
  vendor_slug?: string;
  vendor_city?: string | null;
  category_name?: string | null;
};

export type AssistantAction =
  | { type: 'add_to_cart'; listing_id: string; qty: number; option?: string; title: string; price: number; currency: string; vendor_id: string; vendor_name: string; image?: string; kind: 'product'; unit?: string | null; max?: number }
  | { type: 'open_listing'; id: string }
  | { type: 'open_booking'; id: string }
  | { type: 'open_checkout'; vendor_id?: string }
  | { type: 'choose_option'; listing_id: string; title: string; options: { name: string; price?: number }[] };

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  cards?: AgentCard[];
  actions?: AssistantAction[];
  quote?: any;
  proposed_checkout?: boolean;
};

export type AssistantStatus = {
  enabled: boolean;
  voice_enabled: boolean;
  retention_days: number;
  stt_configured: boolean;
  llm_configured: boolean;
};

const cartPayload = (items: CartItem[]) =>
  items.filter((i) => i.kind !== 'service').map((i) => ({ listing_id: i.listing_id, qty: i.qty, ...(i.option ? { option: i.option } : {}) }));

export const assistantApi = {
  async ready() {
    await assistantGuest.load();
  },
  status() {
    return api.get<AssistantStatus>('/assistant/status');
  },
  thread() {
    return api.get<{ thread_id: string | null; messages: { id: string; role: 'user' | 'assistant'; content: string; cards?: AgentCard[]; actions?: AssistantAction[] }[] }>('/assistant/thread');
  },
  chat(body: { message: string; locale: string; city?: string; fulfilment_mode?: 'pickup' | 'delivery'; cart: CartItem[]; thread_id?: string | null }) {
    return api.post<{
      thread_id: string;
      message_id: string;
      text: string;
      locale: string;
      cards: AgentCard[];
      quote: any;
      actions: AssistantAction[];
      proposed_checkout: boolean;
    }>('/assistant/chat', {
      message: body.message,
      locale: body.locale,
      city: body.city || undefined,
      fulfilment_mode: body.fulfilment_mode,
      consent: true,
      cart: cartPayload(body.cart),
      ...(body.thread_id ? { thread_id: body.thread_id } : {}),
    });
  },
  clear() {
    return api.del<{ ok: boolean }>('/assistant/transcripts');
  },
  async transcribe(uri: string, locale: string) {
    await assistantGuest.load();
    const form = new FormData();
    form.append('audio', { uri, name: 'voice.m4a', type: 'audio/mp4' } as any);
    form.append('locale', locale);
    return api.postForm<{ text: string }>('/assistant/stt', form);
  },
};

export const errorText = (error: unknown, fallback: string) =>
  error instanceof ApiError || error instanceof Error ? error.message : fallback;
