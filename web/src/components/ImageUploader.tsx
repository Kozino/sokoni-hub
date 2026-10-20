import PrivateDocument from './PrivateDocument';
import { useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_EDGE = 1600;

/** Shrink large phone photos in the browser so uploads are fast on weak signal. PDFs and small images pass through. */
async function compress(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 400 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}

export default function ImageUploader({
  value, onChange, max = 6, label = 'Upload images', purpose,
}: { value: string[]; onChange: (urls: string[]) => void; max?: number; label?: string; purpose?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [manual, setManual] = useState('');
  const isKyc = purpose === 'kyc';
  // The server only accepts JPEG, PNG and WebP (it re-encodes them), so PDFs are not offered.
  const accept = 'image/png,image/jpeg,image/webp';
  const free = max - value.length;

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr(''); setBusy(true);
    try {
      const picked = Array.from(files).slice(0, free);
      const prepared: File[] = [];
      for (const f of picked) {
        const okType = accept.split(',').includes(f.type);
        if (!okType) throw new ApiError(400, `"${f.name}" is not a supported file. Use ${isKyc ? 'a photo' : 'a JPG, PNG or WebP photo'}.`);
        const out = await compress(f);
        if (out.size > MAX_BYTES) throw new ApiError(400, `"${f.name}" is ${(out.size / 1048576).toFixed(1)} MB. The limit is 5 MB. Try a smaller photo.`);
        prepared.push(out);
      }
      const r = await api.upload(prepared, purpose);
      onChange([...value, ...r.urls].slice(0, max));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Upload failed. Check your connection and try again.');
    } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };

  return (
    <div>
      <button type="button" className="dropzone dropzone-btn" disabled={busy || free <= 0}
        aria-describedby="uploader-help" onClick={() => ref.current?.click()}>
        {busy ? 'Uploading…' : free <= 0 ? 'Maximum reached. Remove one to add another.' : `📷 ${label}. Tap or press Enter to choose`}
      </button>
      <span id="uploader-help" className="muted" style={{ display: 'block', fontSize: '.8rem', marginTop: 4 }}>
        JPG, PNG or WebP · up to {max} · 5 MB each. Large photos are shrunk automatically.
      </span>
      {busy && <progress aria-label="Uploading" style={{ width: '100%', marginTop: 6 }} />}
      <input ref={ref} type="file" accept={accept} multiple={max > 1} hidden tabIndex={-1} onChange={(e) => pick(e.target.files)} />
      {err && <div className="err" role="alert" style={{ color: 'var(--danger)', fontSize: '.8rem', marginTop: 6 }}>{err}</div>}

      {!isKyc && <div className="row mt-1" style={{ gap: 6 }}>
        <input aria-label="Image URL" placeholder="…or paste an image URL" value={manual} onChange={(e) => setManual(e.target.value)} />
        <button type="button" className="btn btn-outline btn-sm" onClick={() => {
          if (/^https?:\/\//.test(manual)) { onChange([...value, manual].slice(0, max)); setManual(''); }
        }}>Add</button>
      </div>}

      {value.length > 0 && (
        <div className="gallery mt-2">
          {value.map((src, i) => (
            <div key={i} className="g-item">
              <div>{isKyc ? <PrivateDocument value={src} /> : <img src={src} alt={`Uploaded image ${i + 1}`} />}</div>
              <button type="button" aria-label={`Remove image ${i + 1}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
