import dotenv from 'dotenv';
dotenv.config();

const req = (k: string, fallback?: string): string => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`Missing env var: ${k}`);
  return v;
};

const databaseUrl = req('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/postgres');

// Default SSL to on for remote hosts (Supabase, Render, etc.) and off for a local database,
// since local Postgres installs (Docker, Homebrew, the Windows installer) almost never have
// SSL enabled out of the box. PGSSL, if set explicitly, always wins.
const isLocalDb = /(localhost|127\.0\.0\.1)/.test(databaseUrl);
const pgSsl = process.env.PGSSL !== undefined ? process.env.PGSSL === 'true' : !isLocalDb;

// Sanity-check DATABASE_URL at boot and log the (safe, password-free) parts of it. This turns a
// silent, hours-later "ETIMEDOUT 0.0.x.x" from a malformed connection string into an immediate,
// readable error in the deploy logs — a bare number as the host (e.g. a password's special
// character breaking the URL parse) resolves via the OS DNS resolver's legacy numeric-IP
// handling instead of failing cleanly, which is exactly what produces those bogus 0.0.x.x IPs.
let parsedHost = '';
let parsedPort = '';
try {
  const u = new URL(databaseUrl);
  parsedHost = u.hostname;
  parsedPort = u.port || '5432';
  if (!parsedHost || /^\d+$/.test(parsedHost)) {
    throw new Error(
      `DATABASE_URL host looks wrong ("${parsedHost}"). This usually means a special character ` +
      `in the DB password (@ : / ? # %) broke the URL parsing and part of the password leaked ` +
      `into the host. Percent-encode the password, or reset it to a plain alphanumeric one.`
    );
  }
  console.log(`[db] configured for ${parsedHost}:${parsedPort} (ssl: ${pgSsl})`);
} catch (e) {
  console.error(`[db] DATABASE_URL is invalid: ${(e as Error).message}`);
  throw e;
}

export const config = {
  port: Number(process.env.PORT || 4000),
  env: process.env.NODE_ENV || 'development',
  databaseUrl,
  pgSsl,
  jwtSecret: req('JWT_SECRET', 'dev-insecure-secret-change-me'),
  jwtExpires: process.env.JWT_EXPIRES || '7d',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseBucket: process.env.SUPABASE_BUCKET || 'listings',
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD',
  platformWhatsapp: process.env.PLATFORM_WHATSAPP || '',
};
