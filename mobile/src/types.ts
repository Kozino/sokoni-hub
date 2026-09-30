export type Role = 'buyer' | 'vendor' | 'admin';
export type ThemeName = 'light' | 'dark';
export type ListingKind = 'product' | 'service';
export type FulfilmentMode = 'pickup' | 'delivery';
export type PaymentMethod = 'cash_on_delivery' | 'whatsapp' | 'bank_transfer';

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
}

export interface CartQuote {
  vendors: CartQuoteVendor[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  currency: string;
}

export interface Order {
  id: string;
  code: string;
  vendor_id: string;
  status: string;
  payment_method: PaymentMethod;
  subtotal: number | string;
  delivery_fee: number | string;
  total: number | string;
  currency: string;
  contact_name: string;
  contact_phone: string;
  delivery_address: string;
  city: string;
  country: string;
  note: string | null;
  fulfilment_mode?: FulfilmentMode;
  created_at: string;
  business_name?: string;
  whatsapp?: string;
  whatsapp_url?: string;
  vendor?: { business_name: string; whatsapp: string };
  items?: { id?: string; title: string; qty: number; unit: string | null; line_total: number | string }[];
}

export interface Booking {
  id: string;
  code: string;
  status: string;
  listing_title?: string;
  business_name?: string;
  created_at: string;
  preferred_at?: string | null;
  scheduled_at?: string | null;
  slot_starts_at?: string | null;
  location_type?: 'vendor' | 'home';
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
