import { useState } from 'react';
import { Field } from './ui';

type Props = { slug: string; businessName: string };

const SITE =
  (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, '') ||
  window.location.origin;

export default function ShareStorePanel({ slug, businessName }: Props) {
  const link = `${SITE}/s/${slug}?ref=vendor-share`;
  const qrLink = `${SITE}/s/${slug}?ref=qr`;
  const message = `Order from ${businessName} on Sokoni Hub. See what's in stock and place your order here: ${link}`;

  // No local QR generation, no npm dependency. api.qrserver.com is a free,
  // unauthenticated public QR image service: it receives the plain qrLink URL
  // as a query param and returns a PNG. That URL is already meant to be
  // public (it's what gets printed/shared), so this leaks nothing sensitive
  // — but it does mean a third party's server sees the link on each render.
  // Swap this for a self-hosted generator later if that's a concern.
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${encodeURIComponent(qrLink)}`;

  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy your store link', link);
    }
  }

  return (
    <div className="card">
      <div className="card-head"><h4>Share your store</h4></div>
      <div className="card-body">
        <p style={{ color: 'var(--muted)', fontSize: '.88rem', marginTop: 0 }}>
          Put this link in your WhatsApp Business profile, status, or catalog. Customers who open
          it land on your store and can order without an account.
        </p>

        <Field label="Your store link">
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
        </Field>

        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={copyLink}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <a className="btn btn-wa btn-sm" target="_blank" rel="noreferrer"
             href={`https://wa.me/?text=${encodeURIComponent(message)}`}>
            Send on WhatsApp
          </a>
          {canNativeShare && (
            <button type="button" className="btn btn-outline btn-sm"
              onClick={() => navigator.share({ title: businessName, text: message }).catch(() => {})}>
              More ways to share
            </button>
          )}
        </div>

        <div className="row mt-2" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <img src={qr} alt={`QR code for ${businessName}`} width={140} height={140}
               style={{ borderRadius: 8, background: '#fff' }} loading="lazy" />
          <div>
            <p style={{ color: 'var(--muted)', fontSize: '.85rem', margin: '0 0 8px', maxWidth: '32ch' }}>
              Print this for your stall or shop. Scans are counted separately from shared links.
            </p>
            {/* Cross-origin image: most browsers open it in a new tab rather
                than force-saving it, since `download` only works reliably
                same-origin. Good enough for "right-click, save image". */}
            <a className="btn btn-outline btn-sm" href={qr} target="_blank" rel="noreferrer"
               download={`${slug}-qr.png`}>
              Download QR code
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
