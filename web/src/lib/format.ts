export const money = (v: string | number | null | undefined, currency = 'QAR') => {
  const n = Number(v ?? 0);
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
};

export const num = (v: string | number | null | undefined) => Number(v ?? 0).toLocaleString();

export const date = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const dateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const timeAgo = (s?: string | null) => {
  if (!s) return '—';
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date(s);
};

export const waLink = (phone: string, text: string) =>
  `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

export const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const priceLabel = (l: { price: string | number; currency: string; price_type?: string; unit?: string | null }) => {
  const base = money(l.price, l.currency);
  if (l.price_type === 'from') return `From ${base}`;
  if (l.price_type === 'hourly') return `${base}/hr`;
  if (l.price_type === 'per_kg') return `${base}/kg`;
  if (l.unit) return `${base} / ${l.unit}`;
  return base;
};
