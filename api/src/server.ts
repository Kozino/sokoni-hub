import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { config } from './config';
import { pool } from './db';
import { HttpError } from './utils';
import { optionalAuth } from './auth';

import { authRouter } from './routes/auth';
import { vendorRouter } from './routes/vendors';
import { listingRouter } from './routes/listings';
import { orderRouter } from './routes/orders';
import { complaintRouter } from './routes/complaints';
import { adminRouter } from './routes/admin';
import { uploadRouter } from './routes/uploads';
import { metaRouter } from './routes/meta';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const ok =
        config.corsOrigins.includes('*') ||
        config.corsOrigins.includes(origin) ||
        /\.netlify\.app$/.test(new URL(origin).hostname) ||
        /\.e2b\.app$/.test(new URL(origin).hostname) ||
        /^localhost$|^127\.0\.0\.1$/.test(new URL(origin).hostname);
      cb(ok ? null : new Error('Not allowed by CORS'), ok);
    },
    credentials: true,
  })
);

app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));
app.use('/api', rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));
app.use(optionalAuth);

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('select 1');
    res.json({ ok: true, db: 'up', env: config.env, time: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ ok: false, db: 'down', error: (e as Error).message });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/vendors', vendorRouter);
app.use('/api/listings', listingRouter);
app.use('/api/orders', orderRouter);
app.use('/api/complaints', complaintRouter);
app.use('/api/admin', adminRouter);
app.use('/api/uploads', uploadRouter);
app.use('/api/meta', metaRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError)
    return res.status(400).json({ error: 'Validation failed', details: err.flatten().fieldErrors });
  if (err instanceof HttpError)
    return res.status(err.status).json({ error: err.message, details: err.details });
  if (err?.code === '23505') return res.status(409).json({ error: 'That record already exists' });
  if (err?.code === '23503') return res.status(400).json({ error: 'Related record not found' });
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Sokoni API listening on :${config.port} (${config.env})`);
});
