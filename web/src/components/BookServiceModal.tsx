/**
 * Booking request for a service listing.
 *
 * Services do not go through the cart: there is no stock, nothing is delivered,
 * and a "from QAR 50" price cannot produce an honest checkout total. The buyer
 * states a preferred time, we record it so the vendor and admin can see the
 * demand, and then we hand off to WhatsApp where the conversation actually
 * happens. The booking code ties the two together.
 */

import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Modal, Field, Alert } from './ui';
import { money } from '../lib/format';

interface Props {
  open: boolean;
  onClose: () => void;
  listing: {
    id: string; title: string; price: number | string; currency: string;
    price_type?: string; duration_mins?: number | null;
    business_name?: string | null; whatsapp?: string | null;
  };
}

/** Local datetime string for <input type="datetime-local">, rounded to the next hour. */
function defaultSlot() {
  const d = new Date();
  d.setHours(d.getHours() + 25, 0, 0, 0); // tomorrow-ish, on the hour
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BookServiceModal({ open, onClose, listing }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [when, setWhen] = useState(defaultSlot());
  const [flexible, setFlexible] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ code: string; whatsapp: string | null } | null>(null);

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await api.post<{ booking: { code: string }; whatsapp: string | null }>('/bookings', {
        listing_id: listing.id,
        contact_name: name.trim(),
        contact_phone: phone.trim(),
        contact_email: email.trim(),
        // An empty preferred_at is meaningful: "call me, I'm flexible".
        preferred_at: flexible ? '' : new Date(when).toISOString(),
        preferred_note: note.trim() || undefined,
      });
      setDone({ code: r.booking.code, whatsapp: r.whatsapp });
      // Open WhatsApp straight away while the click is still trusted, so the
      // browser does not treat it as a blocked pop-up.
      if (r.whatsapp) window.open(r.whatsapp, '_blank', 'noopener');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not send your request. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const close = () => { setDone(null); setErr(''); onClose(); };

  if (done) {
    return (
      <Modal open={open} title="Booking requested" onClose={close}
        footer={<button className="btn btn-primary" onClick={close}>Done</button>}>
        <Alert kind="success">
          Your request has been sent to {listing.business_name || 'the provider'}.
        </Alert>
        <p className="mt-2">
          Your booking reference is <strong>{done.code}</strong>. Keep it — you can use it
          with your phone number to check the status at any time.
        </p>
        <p className="hint mt-1">
          Nothing has been charged. {listing.business_name || 'The provider'} will confirm the
          time with you on WhatsApp, and payment is arranged directly with them.
        </p>
        {done.whatsapp && (
          <a className="btn btn-wa btn-block mt-2" href={done.whatsapp} target="_blank" rel="noreferrer">
            Open WhatsApp
          </a>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title={`Book: ${listing.title}`}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}
            disabled={busy || name.trim().length < 2 || phone.trim().length < 7}>
            {busy ? 'Sending…' : 'Request booking'}
          </button>
        </>
      }
    >
      {err && <Alert kind="error">{err}</Alert>}

      <p className="hint">
        {listing.price_type && listing.price_type !== 'fixed'
          ? <>The advertised price is <strong>{money(Number(listing.price), listing.currency)}</strong> ({listing.price_type}). The final price is agreed with the provider.</>
          : <>Advertised at <strong>{money(Number(listing.price), listing.currency)}</strong>. Nothing is charged now.</>}
        {listing.duration_mins ? ` Usually takes about ${listing.duration_mins} minutes.` : ''}
      </p>

      <Field label="Your name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Amina Yusuf" />
      </Field>

      <Field label="WhatsApp number" hint="The provider will contact you on this number.">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+974 3333 4444" />
      </Field>

      <Field label="Email (optional)">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </Field>

      <Field label="Preferred date and time"
        hint="A request, not a confirmation — the provider will agree the final time with you.">
        <input type="datetime-local" value={when} disabled={flexible}
          min={new Date().toISOString().slice(0, 16)}
          onChange={(e) => setWhen(e.target.value)} />
      </Field>

      <label className="row" style={{ gap: 8, alignItems: 'center', marginTop: -4 }}>
        <input type="checkbox" checked={flexible} onChange={(e) => setFlexible(e.target.checked)} />
        <span style={{ fontSize: '.88rem' }}>I'm flexible — just contact me</span>
      </label>

      <Field label="Anything they should know? (optional)">
        <textarea rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)}
          placeholder="Hair length, preferred style, where you are based…" />
      </Field>
    </Modal>
  );
}
