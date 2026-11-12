export type Role = 'buyer' | 'vendor' | 'admin';
export type ThemeName = 'light' | 'dark';
export type ListingKind = 'product' | 'service';
export type FulfilmentMode = 'pickup' | 'delivery';
export type PaymentMethod = 'cash_on_delivery';

export interface User {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  role: Role;
  is_active?: boolean;
  created_at?: string;
}

export interface Vendor {
  id: string;
  business_name: string;
  slug: string;
  description: string | null;
  whatsapp: string;
  country: string;
  city: string;
  address: string | null;
  logo_url: string | null;
  status: 'pending' | 'verified' | 'rejected' | 'suspended';
  rejection_reason: string | null;
  verified_at: string | null;
  rating_avg: number | string;
  rating_count: number;
  created_at: string;
  lat?: number | string | null;
  lng?: number | string | null;
  offers_pickup?: boolean;
  offers_delivery?: boolean;
  delivery_fee?: number | string | null;
  free_delivery_over?: number | string | null;
  pickup_address?: string | null;
  delivery_notes?: string | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  kind: ListingKind;
}

export interface Listing {
  id: string;
  vendor_id: string;
  category_id: string;
  kind: ListingKind;
  title: string;
  slug: string;
  description: string | null;
  price: number | string;
  currency: string;
  quantity: number | null;
  unit: string | null;
  images: string[];
  status: string;
  options?: {name: string, price: number}[];
  duration_mins: number | null;
  service_area: string | null;
  price_type: string;
  category_name?: string;
  category_slug?: string;
  business_name?: string;
  vendor_slug?: string;
  vendor_city?: string;
  vendor_country?: string;
  vendor_logo?: string | null;
  whatsapp?: string;
  rating_avg?: number | string;
  rating_count?: number;
  vendor_rating_avg?: number | string;
  vendor_rating_count?: number;
}

export interface CartItem {
  listing_id: string;
  vendor_id: string;
  vendor_name: string;
  title: string;
  price: number;
  currency: string;
  image?: string;
  qty: number;
  max?: number;
  kind: ListingKind;
  option?: string;
  unit?: string | null;
}

export interface CartQuoteVendor {
  vendor_id: string;
  vendor_name: string;
  currency: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  mode: FulfilmentMode;
  offers_pickup: boolean;
  offers_delivery: boolean;
  pickup_address?: string | null;
  free_delivery_over?: number | null;
  unavailable?: string | null;
  /** Offers (platform-funded). `delivery_fee` stays the full fee; `total` is what the buyer pays. */
  discount?: number;
  delivery_discount?: number;
}

export type OfferKind = 'percent_off' | 'amount_off' | 'free_delivery' | 'delivery_percent_off' | 'delivery_amount_off';
export type OfferAccent = 'green' | 'orange' | 'violet' | 'sky' | 'rose' | 'amber';

/** One offer that was applied to a quote or an order. */
export interface AppliedOffer {
  offer_id: string;
  code: string | null;
  title: string;
  kind: OfferKind;
  goods_discount: number;
  delivery_discount: number;
}
/** "Add 40 QAR more for FREE delivery" */
export interface QuoteHint {
  offer_id: string;
  kind: OfferKind;
  title: string;
  text: string;
  needed: number;
  /** 0..1 */
  progress: number;
}

export interface CartQuote {
  vendors: CartQuoteVendor[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  currency: string;
  // Present when the app asks for offers and the server has them switched on.
  discount?: number;
  delivery_discount?: number;
  applied_offers?: AppliedOffer[];
  hints?: QuoteHint[];
  /** The code the buyer typed: whether it works, and a message when it does not. */
  promo?: { code: string; ok: boolean; message: string | null } | null;
}

/** An offer listed in the app (GET /offers). */
export interface Offer {
  id: string;
  code: string | null;
  /** True when nothing needs to be typed: it applies at checkout when the cart qualifies. */
  auto: boolean;
  title: string;
  description: string | null;
  kind: OfferKind;
  value: number;
  max_discount: number | null;
  min_subtotal: number;
  scope: 'all' | 'vendor' | 'category';
  fulfilment: 'any' | 'delivery' | 'pickup';
  first_order_only: boolean;
  ends_at: string;
  badge: string | null;
  accent: OfferAccent;
  target: { type: 'vendor' | 'category'; slug: string | null; name: string | null } | null;
  /** In-app destination, e.g. sokonihub://store/oriaku-foods */
  link: string;
}

export interface OrderLine {
  id?: string;
  listing_id?: string | null;
  title: string;
  qty: number;
  unit: string | null;
  unit_price?: number | string;
  line_total: number | string;
}

export interface OrderDriver {
  name: string;
  vehicle_type?: string | null;
  license_plate?: string | null;
  phone?: string | null;
}

export interface Order {
  id: string;
  code: string;
  vendor_id: string;
  status: string;
  options?: {name: string, price: number}[];
  payment_method: PaymentMethod;
  payment_status?: 'unpaid' | 'paid' | string;
  subtotal: number | string;
  delivery_fee: number | string;
  total: number | string;
  /** Platform-funded offers. Absent or 0 on an order placed without one. `total` is what the buyer pays. */
  discount?: number | string | null;
  delivery_discount?: number | string | null;
  promo_code?: string | null;
  offers_applied?: AppliedOffer[] | null;
  currency: string;
  contact_name: string;
  contact_phone: string;
  delivery_address: string;
  city: string;
  country: string;
  note: string | null;
  fulfilment_mode?: FulfilmentMode;
  created_at: string;
  updated_at?: string;
  delivered_at?: string | null;
  verify_by?: string | null;
  buyer_confirmed_at?: string | null;
  disputed_at?: string | null;
  dispute_reason?: string | null;
  receipt_number?: string | null;
  delivery_lat?: number | string | null;
  delivery_lng?: number | string | null;
  driver_lat?: number | string | null;
  driver_lng?: number | string | null;
  delivery_proof_url?: string | null;
  driver?: OrderDriver | null;
  business_name?: string;
  vendor_slug?: string;
  whatsapp?: string;
  vendor?: { business_name: string; whatsapp: string };
  items?: OrderLine[];
}

export interface Booking {
  id: string;
  code: string;
  status: string;
  options?: {name: string, price: number}[];
  listing_id?: string;
  listing_title?: string;
  listing_slug?: string;
  business_name?: string;
  vendor_id?: string;
  vendor_whatsapp?: string | null;
  vendor_city?: string | null;
  vendor_address?: string | null;
  created_at: string;
  preferred_at?: string | null;
  scheduled_at?: string | null;
  slot_starts_at?: string | null;
  slot_ends_at?: string | null;
  location_type?: 'vendor' | 'home';
  address?: string | null;
  preferred_note?: string | null;
  duration_mins?: number | null;
  quoted_price?: number | string | null;
  quoted_price_type?: string | null;
  currency?: string | null;
  contact_name?: string;
  contact_phone?: string;
  can_cancel?: boolean;
  cancel_deadline?: string | null;
}

export interface Review {
  id: string;
  rating: number;
  title?: string | null;
  comment?: string | null;
  created_at: string;
  buyer_name?: string | null;
  verified?: boolean;
  vendor_reply?: string | null;
}
