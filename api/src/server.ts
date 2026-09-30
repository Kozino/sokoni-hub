import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { config } from './config';
import { pool } from './db';
import { HttpError } from './utils';
import { limit } from './security';
import { optionalAuth } from './auth';

import { authRouter } from './routes/auth';
import { vendorRouter } from './routes/vendors';
import { listingRouter } from './routes/listings';
import { orderRouter } from './routes/orders';
import { complaintRouter } from './routes/complaints';
import { adminRouter } from './routes/admin';
import { uploadRouter } from './routes/uploads';
import { metaRouter } from './routes/meta';
import { billingRouter } from './routes/billing';
import { bookingRouter } from './routes/bookings';
import { inventoryRouter } from './routes/inventory';
import { promotionRouter } from './routes/promotions';
import { reviewRouter } from './routes/reviews';

const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '1mb' }));
// Code + phone are guest lookup credentials: do not log their query strings.
morgan.token('safe-route', req => {const p=req.url?.split('?')[0]||'';return /^\/api\/complaints\/track\//.test(p)?'/api/complaints/track/[redacted]':p;});
app.use(morgan(':method :safe-route :status :response-time ms'));
app.use('/api', (_req,res,next)=>{res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');next();});

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const ok = config.corsOrigins.includes(origin);
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
    res.json({ ok: true });
  } catch (e) {
    res.status(503).json({ ok: false });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/vendors', vendorRouter);
app.use('/api/listings', listingRouter);
app.post('/api/orders/checkout', limit('checkout',20,900));
app.use('/api/orders', orderRouter);
app.use('/api/complaints', limit('complaints',30,900), complaintRouter);
app.use('/api/admin', adminRouter);
app.use('/api/uploads', limit('uploads',20,900), uploadRouter);
app.use('/api/meta', metaRouter);
app.use('/api/billing', billingRouter);
app.post(['/api/bookings', '/api/bookings/cancel'], rateLimit({ windowMs: 15 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false }));
app.get(['/api/bookings/track', '/api/bookings/ics'], rateLimit({ windowMs: 15 * 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));
app.use('/api/bookings', bookingRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/promotions', promotionRouter);
app.use('/api/reviews', reviewRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.name==='MulterError') return res.status(400).json({error:'Upload exceeds allowed size or file count'});
  if (err instanceof ZodError)
    return res.status(400).json({ error: 'Validation failed', details: err.flatten().fieldErrors });
  if (err instanceof HttpError)
    return res.status(err.status).json({ error: err.message, details: err.details });
  if (err?.code === '23505') return res.status(409).json({ error: 'That record already exists' });
  if (err?.code === '23503') return res.status(400).json({ error: 'Related record not found' });
  if (err?.message?.includes('does not support SSL')) {
    console.error('[db] SSL mismatch: the database is not accepting SSL connections. Set PGSSL=false for a local/non-SSL database, or PGSSL=true for a hosted one.');
  } else if (err?.code === '28P01' || err?.code === '28000') {
    console.error('[db] Authentication failed — check the username/password in DATABASE_URL.');
  } else if (err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND' || err?.code === 'ENETUNREACH') {
    console.error('[db] Could not reach the database — check DATABASE_URL host/port and that the DB is running/reachable from here.');
  } else if (err?.code === '42P01') {
    console.error('[db] A table is missing — has db/schema.sql been run against this database?');
  }
  console.error('[error]', {code: err?.code || 'internal', name: err?.name || 'Error'});
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
 const ready=await pool.query("select 1 from public.schema_migrations where name='migrations/012_security.sql'");
 if(!ready.rowCount)throw new Error('Security migration is missing. Run the documented migration command before startup.');
 app.listen(config.port, '0.0.0.0', () => {
  console.log(`Sokoni API listening on :${config.port} (${config.env})`);
 });
}
start().catch(()=>{console.error('[startup] Database/schema readiness failed. Check verified DB TLS and apply the security migrations.');process.exitCode=1;void pool.end();});
