import { useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';

export default function ImageUploader({
  value, onChange, max = 6, label = 'Upload images',
}: { value: string[]; onChange: (urls: string[]) => void; max?: number; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [manual, setManual] = useState('');

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr(''); setBusy(true);
    try {
      const r = await api.upload(Array.from(files).slice(0, max - value.length));
      onChange([...value, ...r.urls].slice(0, max));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Upload failed. You can paste an image URL instead.');
    } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };

  return (
    <div>
      <div className="dropzone" onClick={() => ref.current?.click()}>
        {busy ? 'Uploading…' : `📷 ${label} — click to choose (max ${max}, 5MB each)`}
      </div>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => pick(e.target.files)} />
      {err && <div className="err" style={{ color: 'var(--danger)', fontSize: '.8rem', marginTop: 6 }}>{err}</div>}

      <div className="row mt-1" style={{ gap: 6 }}>
        <input placeholder="…or paste an image URL" value={manual} onChange={(e) => setManual(e.target.value)} />
        <button type="button" className="btn btn-outline btn-sm" onClick={() => {
          if (/^https?:\/\//.test(manual)) { onChange([...value, manual].slice(0, max)); setManual(''); }
        }}>Add</button>
      </div>

      {value.length > 0 && (
        <div className="gallery mt-2">
          {value.map((src, i) => (
            <div key={i} className="g-item">
              <img src={src} alt="" />
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
