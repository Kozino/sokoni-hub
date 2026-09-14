import { Router } from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { requireAuth } from '../auth';
import { HttpError } from '../utils';

export const uploadRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
});

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const supabase =
  config.supabaseUrl && config.supabaseKey
    ? createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false } })
    : null;

uploadRouter.post('/', requireAuth(), upload.array('files', 6), async (req, res, next) => {
  try {
    if (!supabase) throw new HttpError(503, 'File storage is not configured (SUPABASE_URL / SERVICE_ROLE_KEY)');
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) throw new HttpError(400, 'No files uploaded');

    const urls: string[] = [];
    for (const f of files) {
      if (!ALLOWED.includes(f.mimetype)) throw new HttpError(415, `Unsupported file type: ${f.mimetype}`);
      const ext = f.originalname.split('.').pop()?.toLowerCase() || 'bin';
      const key = `${req.user!.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from(config.supabaseBucket)
        .upload(key, f.buffer, { contentType: f.mimetype, upsert: false });
      if (error) throw new HttpError(500, `Upload failed: ${error.message}`);
      urls.push(supabase.storage.from(config.supabaseBucket).getPublicUrl(key).data.publicUrl);
    }
    res.status(201).json({ urls });
  } catch (e) {
    next(e);
  }
});
