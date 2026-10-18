/** Stage sign-in and order data shapes shared by the rider screens. */
export type Stage =
  | { kind: 'pin'; token: string; name?: string }
  | { kind: 'setup'; token: string; needsEmail: boolean; name?: string };

export type OrderItem = { title: string; qty: number };

export type Order = {
  id: string;
  code: string;
  status: string;
  total: number | string;
  delivery_fee: number | string;
  delivery_address: string;
  city: string;
  contact_name: string | null;
  contact_phone: string | null;
  note: string | null;
  created_at: string;
  business_name: string;
  pickup_address: string | null;
  vendor_phone: string | null;
  items: OrderItem[];
  delivery_proof_url?: string | null;
};
