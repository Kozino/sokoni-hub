/** All booking inputs/display use Qatar time, never the visitor's OS timezone. */
export const qDate = (d = new Date()) =>
  new Date(d.getTime() + 10800000).toISOString().slice(0, 10);
export const qInput = (iso?: string | null) =>
  new Date((iso ? +new Date(iso) : Date.now() + 86400000) + 10800000)
    .toISOString()
    .slice(0, 16);
export const qISO = (input: string) =>
  new Date(input + ":00+03:00").toISOString();
export const addDays = (date: string, n: number) =>
  new Date(+new Date(date + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export const qTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Qatar",
    hour: "2-digit",
    minute: "2-digit",
  });
export const qWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Qatar",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export interface Booking {
  id: string;
  code: string;
  status: string;
  listing_title: string;
  duration_mins: number | null;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  preferred_note: string | null;
  preferred_at: string | null;
  scheduled_at: string | null;
  slot_starts_at: string | null;
  slot_ends_at: string | null;
  location_type: "vendor" | "home";
  address: string | null;
  vendor_note: string | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  created_at: string;
  first_viewed_at: string | null;
  quoted_price: string | null;
  quoted_price_type: string | null;
  currency: string;
  business_name: string;
  vendor_whatsapp: string | null;
  vendor_address: string | null;
  can_cancel?: boolean;
  cancel_deadline?: string | null;
}
export interface TimeOff {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}
export interface Settings {
  auto_accept: boolean;
  offers_at_vendor: boolean;
  offers_home_service: boolean;
  home_service_notes: string | null;
  cancel_notice_hours: number;
  buffer_mins: number;
  slot_step_mins: number;
  min_notice_hours: number;
  max_advance_days: number;
}
export interface Hours {
  weekday: number;
  opens: string;
  closes: string;
}
export interface Availability {
  settings: Settings;
  hours: Hours[];
  time_off: TimeOff[];
  configured: boolean;
}
export interface Slots {
  mode: "calendar" | "request";
  slots: { start: string; end: string; label: string }[];
  duration_mins: number;
  options: Settings & { vendor_address: string | null };
  today: string;
}
export const live = (s: string) =>
  ["new", "contacted", "confirmed"].includes(s);
export const tone = (s: string): "gold" | "green" | "red" | "blue" | "grey" =>
  (
    ({
      new: "gold",
      contacted: "blue",
      confirmed: "green",
      completed: "grey",
      cancelled: "red",
      no_show: "red",
    }) as const
  )[s] || "grey";
export const calendarURL = (code: string, phone: string) =>
  `${(import.meta.env.VITE_API_URL || "").replace(/\/$/, "")}/api/bookings/ics?${new URLSearchParams({ code, phone })}`;
