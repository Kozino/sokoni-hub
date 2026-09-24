export type Role = 'buyer' | 'vendor' | 'admin';
export type VendorStatus = 'pending' | 'verified' | 'rejected' | 'suspended';
export type ListingKind = 'product' | 'service';
export type ListingStatus = 'draft' | 'pending_review' | 'active' | 'paused' | 'rejected' | 'removed';
export type OrderStatus = 'pending' | 'confirmed' | 'dispatched' | 'delivered' | 'cancelled';
export type PaymentMethod = 'cash_on_delivery' | 'whatsapp' | 'bank_transfer';
export type FulfilmentMode = 'pickup' | 'delivery';
export type ComplaintStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';

export interface User {
  id: string; full_name: string; phone: string; email: string | null;
  role: Role; is_active?: boolean; created_at?: string;
}

export interface Vendor {
  id: string; user_id?: string; business_name: string; slug: string;
  description: string | null; whatsapp: string; country: string; city: string;
  address: string | null; logo_url: string | null; id_document_url: string | null;
  status: VendorStatus; rejection_reason: string | null; verified_at: string | null;
  rating_avg: number; rating_count: number; created_at: string;
  lat?: number | string | null; lng?: number | string | null;
  /** Present on the public directory when the buyer shared a location. */
  distance_km?: number | string | null;
  offers_pickup?: boolean; offers_delivery?: boolean;
  delivery_fee?: number | string | null; free_delivery_over?: number | string | null;
  pickup_address?: string | null; delivery_notes?: string | null;
  owner_name?: string; owner_phone?: string; owner_email?: string;
  listings?: number | Listing[]; open_complaints?: number;
}

export interface Category { id: string; name: string; slug: string; kind: ListingKind; is_banned?: boolean; sort?: number }

export interface Listing {
  id: string; vendor_id: string; category_id: string; kind: ListingKind;
  title: string; slug: string; description: string | null;
  price: string | number; currency: string;
  quantity: number | null; unit: string | null;
  weight_kg: string | number | null; volume_l: string | number | null;
  duration_mins: number | null; service_area: string | null;
  price_type: string; images: string[]; status: ListingStatus;
  /** Set by an admin when a listing is rejected during review. */
  rejection_reason?: string | null;
  views: number; created_at: string; updated_at?: string;
  category_name?: string; category_slug?: string;
  business_name?: string; vendor_slug?: string; vendor_city?: string;
  vendor_country?: string; rating_avg?: number; rating_count?: number;
  whatsapp?: string; vendor_logo?: string | null;
}

export interface OrderItem { id?: string; listing_id?: string; title: string; unit_price: string | number; qty: number; unit: string | null; line_total: string | number }

export interface Order {
  id: string; code: string; vendor_id: string; status: OrderStatus;
  payment_method: PaymentMethod; subtotal: string | number; delivery_fee: string | number;
  total: string | number; currency: string; contact_name: string; contact_phone: string;
  delivery_address: string; city: string; country: string; note: string | null;
  fulfilment_mode?: FulfilmentMode;
  created_at: string; items?: OrderItem[]; business_name?: string;
  whatsapp_url?: string; vendor?: { business_name: string; whatsapp: string };
}

/** One message in the admin <-> vendor thread on a complaint. */
export interface ComplaintMessage {
  id: string;
  complaint_id?: string;
  author_role: 'admin' | 'vendor';
  author_name?: string | null;
  body: string;
  created_at: string;
}

export interface Complaint {
  id: string; code: string; subject: string; body: string; status: ComplaintStatus;
  admin_note: string | null; created_at: string; resolved_at: string | null;
  reporter_name: string | null; reporter_phone: string | null;
  business_name?: string; listing_title?: string; order_code_ref?: string;
  vendor_id?: string | null;
  messages?: ComplaintMessage[];
}

export interface CartItem {
  listing_id: string; title: string; price: number; currency: string;
  qty: number; unit: string | null; image?: string;
  vendor_id: string; vendor_name: string; kind: ListingKind; max?: number | null;
}

/** A vendor's self-managed delivery policy. The platform never sets these. */
export interface DeliverySettings {
  vendor_id?: string;
  offers_pickup: boolean;
  offers_delivery: boolean;
  delivery_fee: number | string;
  free_delivery_over: number | string | null;
  delivery_radius_km: number | string | null;
  pickup_address: string | null;
  delivery_notes: string | null;
}

/** Per-vendor line of a checkout quote, as returned by POST /orders/quote. */
export interface VendorQuote {
  vendor_id: string; vendor_name: string;
  subtotal: number; delivery_fee: number; total: number; currency: string;
  mode: FulfilmentMode;
  offers_pickup: boolean; offers_delivery: boolean;
  free_delivery_over: number | null;
  pickup_address: string | null; delivery_notes: string | null;
  /** Set when the chosen mode isn't available and was adjusted. */
  unavailable?: string;
}

export interface CartQuote {
  vendors: VendorQuote[];
  subtotal: number; delivery_fee: number; total: number; currency: string;
}
