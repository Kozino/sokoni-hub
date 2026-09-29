import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Field } from './ui';

type Props = { slug: string; businessName: string };

const SITE =
  (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, '') ||
  window.location.origin;

export default function ShareStorePanel({ slug, businessName }: Props) {
  const link = `${SITE}/s/${slug}?ref=vendor-share`;
  const qrLink = `${SITE}/s/${slug}?ref=qr`;
  const message = `Order from ${businessName} on Sokoni Hub. See what's in stock and place your order here: ${link}`;

  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(qrLink, { width: 640, margin: 2, errorCorrectionLevel: 'M' })
      .then((url: string) => { if (!cancelled) setQr(url); })
      .catch(() => { /* QR is optional; the link still works */ });
    return () => { cancelled = true; };
  }, [qrLink]);

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

        {qr && (
          <div className="row mt-2" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <img src={qr} alt={`QR code for ${businessName}`} width={140} height={140}
                 style={{ borderRadius: 8, background: '#fff' }} />
            <div>
              <p style={{ color: 'var(--muted)', fontSize: '.85rem', margin: '0 0 8px', maxWidth: '32ch' }}>
                Print this for your stall or shop. Scans are counted separately from shared links.
              </p>
              <a className="btn btn-outline btn-sm" href={qr} download={`${slug}-qr.png`}>Download QR code</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
