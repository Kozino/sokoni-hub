import { Pool, PoolClient } from 'pg';
import { config } from './config';

const connection = new URL(config.databaseUrl);
for (const key of ['sslmode','sslcert','sslkey','sslrootcert']) connection.searchParams.delete(key);
export const pool = new Pool({
  connectionString: connection.toString(),
  ssl: config.pgSsl ? { rejectUnauthorized: true, ...(process.env.PGSSL_CA ? {ca: process.env.PGSSL_CA.replace(/\\n/g,'\n')} : {}) } : undefined,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => console.error('[pg] idle client error', err.message));

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function one<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
