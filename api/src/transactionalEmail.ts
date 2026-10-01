/* Transactional email templates. These are deliberately table-light and use
   inline CSS so they render consistently in Gmail, Outlook, and mobile apps. */

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));

const qatarDate = (value?: string | Date | null) => value
  ? new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Qatar',
  }).format(new Date(value))
  : 'To be agreed';

const statusText = (status: string) => status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function shell(title: string, lead: string, content: string, action?: { label: string; href: string }) {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#edf4f0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#18322a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #d8e6df">
    <tr><td style="background:#006c56;padding:26px 30px 22px;color:#ffffff">
      <div style="font-size:25px;font-weight:800;letter-spacing:-.5px">Sokoni<span style="color:#ff9b35">Hub</span></div>
      <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;opacity:.82;margin-top:5px">Marketplace notifications</div>
    </td></tr>
    <tr><td style="padding:30px">
      <h1 style="margin:0 0 10px;font-size:23px;line-height:1.25;color:#004e40">${esc(title)}</h1>
      <p style="margin:0 0 22px;line-height:1.55;color:#49645a">${esc(lead)}</p>
      ${content}
      ${action ? `<p style="margin:25px 0 4px"><a href="${esc(action.href)}" style="display:inline-block;background:#006c56;border-radius:7px;color:#ffffff;padding:12px 17px;text-decoration:none;font-weight:700">${esc(action.label)}</a></p>` : ''}
    </td></tr>
    <tr><td style="border-top:1px solid #d8e6df;padding:17px 30px;color:#6d7e76;font-size:12px;line-height:1.45">
      Sokoni Hub · Doha, Qatar<br>For your security, never share your password, PIN, or verification links.
    </td></tr>
  </table></body></html>`;
}

const bookingDetails = (b: { code: string; listing_title: string; business_name: string; scheduled_at?: string | Date | null; slot_starts_at?: string | Date | null; location_type?: string | null }) => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f4f8f6;border:1px solid #d8e6df;border-radius:8px">
    <tr><td style="padding:13px 15px;border-bottom:1px solid #d8e6df;color:#6d7e76;font-size:12px">REFERENCE</td><td style="padding:13px 15px;border-bottom:1px solid #d8e6df;text-align:right;font-weight:700">${esc(b.code)}</td></tr>
    <tr><td style="padding:13px 15px;border-bottom:1px solid #d8e6df;color:#6d7e76;font-size:12px">SERVICE</td><td style="padding:13px 15px;border-bottom:1px solid #d8e6df;text-align:right;font-weight:700">${esc(b.listing_title)}</td></tr>
    <tr><td style="padding:13px 15px;border-bottom:1px solid #d8e6df;color:#6d7e76;font-size:12px">PROVIDER</td><td style="padding:13px 15px;border-bottom:1px solid #d8e6df;text-align:right">${esc(b.business_name)}</td></tr>
    <tr><td style="padding:13px 15px;color:#6d7e76;font-size:12px">TIME · QATAR</td><td style="padding:13px 15px;text-align:right">${esc(qatarDate(b.slot_starts_at || b.scheduled_at))}${b.location_type === 'home' ? ' · Home visit' : b.location_type === 'vendor' ? ' · At provider' : ''}</td></tr>
  </table>`;

export function verificationEmail(verificationUrl: string) {
  return shell(
    'Verify your email address',
    'Welcome to Sokoni Hub. Confirm this email address before signing in to your new account.',
    '<p style="margin:0;line-height:1.55">This verification link expires in 24 hours. If you did not create a Sokoni Hub account, you can safely ignore this email.</p>',
    { label: 'Verify email address', href: verificationUrl },
  );
}

export function bookingCustomerEmail(
  b: { code: string; listing_title: string; business_name: string; scheduled_at?: string | Date | null; slot_starts_at?: string | Date | null; location_type?: string | null },
  status: string,
  trackUrl: string,
  note?: string | null,
) {
  const message: Record<string, string> = {
    new: 'Your booking request has been received. The provider will review it shortly.',
    contacted: 'The provider has reviewed your booking and may contact you with the next steps.',
    confirmed: 'Good news — your booking is confirmed.',
    rescheduled: 'Your booking time has been updated. Please review the new time below.',
    completed: 'Your booking has been marked as completed. Thank you for using Sokoni Hub.',
    cancelled: 'This booking has been cancelled. See the booking details below.',
    no_show: 'This booking has been marked as a no-show. Contact the provider if you believe this is incorrect.',
  };
  return shell(
    `Booking ${statusText(status)}`,
    message[status] || 'There is an update to your booking.',
    `${bookingDetails(b)}${note ? `<p style="margin:18px 0 0;padding:12px 14px;background:#fff8ec;border-left:3px solid #ff7a00;line-height:1.5"><strong>Provider note:</strong> ${esc(note)}</p>` : ''}`,
    { label: 'Track booking', href: trackUrl },
  );
}

export function bookingVendorEmail(b: { code: string; listing_title: string; business_name: string; contact_name: string; contact_phone: string; contact_email?: string | null; scheduled_at?: string | Date | null; slot_starts_at?: string | Date | null; location_type?: string | null }, dashboardUrl: string) {
  return shell(
    'New booking request',
    `${b.contact_name} has requested ${b.listing_title}.`,
    `${bookingDetails(b)}<p style="margin:18px 0 0;line-height:1.6"><strong>Customer:</strong> ${esc(b.contact_name)}<br><strong>Phone:</strong> ${esc(b.contact_phone)}${b.contact_email ? `<br><strong>Email:</strong> ${esc(b.contact_email)}` : ''}</p>`,
    { label: 'Open booking inbox', href: dashboardUrl },
  );
}

export function orderCustomerEmail(o: { code: string; business_name: string; total: string | number; currency: string; status: string }, trackUrl: string) {
  return shell(
    o.status === 'pending' ? 'Order received' : `Order ${statusText(o.status)}`,
    o.status === 'pending'
      ? `Your order with ${o.business_name} has been received.`
      : `Your order with ${o.business_name} is now ${statusText(o.status).toLowerCase()}.`,
    `<p style="margin:0;line-height:1.65"><strong>Order:</strong> ${esc(o.code)}<br><strong>Store:</strong> ${esc(o.business_name)}<br><strong>Total:</strong> ${esc(o.currency)} ${Number(o.total).toFixed(2)}</p>`,
    { label: 'Track order', href: trackUrl },
  );
}

export function orderVendorEmail(o: { code: string; contact_name: string; contact_phone: string; total: string | number; currency: string }, dashboardUrl: string) {
  return shell(
    'New customer order',
    `${o.contact_name} has placed a new order.`,
    `<p style="margin:0;line-height:1.65"><strong>Order:</strong> ${esc(o.code)}<br><strong>Customer:</strong> ${esc(o.contact_name)}<br><strong>Phone:</strong> ${esc(o.contact_phone)}<br><strong>Total:</strong> ${esc(o.currency)} ${Number(o.total).toFixed(2)}</p>`,
    { label: 'Open orders', href: dashboardUrl },
  );
}
