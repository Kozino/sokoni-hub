import bcrypt from 'bcryptjs';
import readline from 'readline/promises';
import { stdin, stdout } from 'process';
import { pool, one } from '../db';

(async () => {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const name = process.env.ADMIN_NAME || (await rl.question('Admin full name: '));
  const phone = (process.env.ADMIN_PHONE || (await rl.question('Admin phone: '))).replace(/\D/g, '');
  const email = process.env.ADMIN_EMAIL || (await rl.question('Admin email (optional): '));
  const password = process.env.ADMIN_PASSWORD || (await rl.question('Admin password (min 8): '));
  rl.close();

  if (password.length < 8) throw new Error('Password must be at least 8 characters');
  const hash = await bcrypt.hash(password, 10);
  const existing = await one<any>('select id from users where phone = $1', [phone]);
  if (existing) {
    await pool.query(`update users set role='admin', password_hash=$2, full_name=$3 where id=$1`, [existing.id, hash, name]);
    console.log('✔ Existing user promoted to admin');
  } else {
    await pool.query(
      `insert into users (full_name, phone, email, password_hash, role) values ($1,$2,$3,$4,'admin')`,
      [name, phone, email || null, hash]
    );
    console.log('✔ Admin created');
  }
  await pool.end();
})().catch((e) => {
  console.error('✖', e.message);
  process.exit(1);
});
