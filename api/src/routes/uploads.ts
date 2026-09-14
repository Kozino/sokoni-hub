import { Router } from 'express';
import multer from 'multer';
import { config } from '../config';
import { requireAuth } from '../auth';
import { HttpError } from '../utils';
import { storageEnabled, uploadObject } from '../storage';

export const uploadRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
});

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

uploadRouter.post('/', requireAuth(), upload.array('files', 6), async (req, res, next) => {
  try {
    if (!storageEnabled) throw new HttpError(503, 'File storage is not configured (SUPABASE_URL / SERVICE_ROLE_KEY)');
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) throw new HttpError(400, 'No files uploaded');

    const urls: string[] = [];
    for (const f of files) {
      if (!ALLOWED.includes(f.mimetype)) throw new HttpError(415, `Unsupported file type: ${f.mimetype}`);
      const ext = f.originalname.split('.').pop()?.toLowerCase() || 'bin';
      const key = `${req.user!.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      try {
        const { publicUrl } = await uploadObject(config.supabaseBucket, key, f.buffer, f.mimetype);
        urls.push(publicUrl);
      } catch (err: any) {
        throw new HttpError(500, `Upload failed: ${err?.message || 'storage error'}`);
      }
    }
    res.status(201).json({ urls });
  } catch (e) {
    next(e);
  }
});
