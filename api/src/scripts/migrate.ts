import fs from 'fs';
import path from 'path';
import { pool } from '../db';

(async () => {
  const file = path.resolve(__dirname, '../../../db/schema.sql');
  const sql = fs.readFileSync(file, 'utf8');
  console.log('Applying schema…');
  await pool.query(sql);
  console.log('✔ Schema applied');
  await pool.end();
})().catch((e) => {
  console.error('✖ Migration failed:', e.message);
  process.exit(1);
});
