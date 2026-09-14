import dotenv from 'dotenv';
dotenv.config();

const req = (k: string, fallback?: string): string => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`Missing env var: ${k}`);
  return v;
};

export const config = {
  port: Number(process.env.PORT || 4000),
  env: process.env.NODE_ENV || 'development',
  databaseUrl: req('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/postgres'),
  pgSsl: (process.env.PGSSL || 'true') === 'true',
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
