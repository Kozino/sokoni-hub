import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../utils';
import { query, one, tx } from '../db';
import { requireAuth, loadVendor } from '../auth';
import { settleBillsFromWallet } from '../serviceFeeBills';

export const wallet = Router();

// Get wallet balance and stats
wallet.get('/', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const v = await one(
      `select wallet_pending, wallet_available, bank_name, bank_account_name, bank_iban 
       from vendors where id = $1`,
      [req.vendor!.id]
    );
    res.json({ wallet: v });
  } catch (e) {
    next(e);
  }
});

// Get wallet transaction ledger
wallet.get('/transactions', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const transactions = await query(
      `select * from wallet_transactions 
       where vendor_id = $1 
       order by created_at desc limit 100`,
      [req.vendor!.id]
    );
    res.json({ transactions });
  } catch (e) {
    next(e);
  }
});

// Request a payout
const PayoutSchema = z.object({
  amount: z.number().positive(),
});

wallet.post('/payout', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const body = PayoutSchema.parse(req.body);
    
    await tx(async (c) => {
      // Lock vendor row
      const v = (await c.query(`select wallet_available, bank_iban from vendors where id = $1 for update`, [req.vendor!.id])).rows[0];
      
      if (!v) throw new Error('Vendor not found');
      if (!v.bank_iban) throw new Error('Bank IBAN not set. Please update your bank details first.');
      // Open Sokoni Hub bills (booking fees) are settled from the balance first, oldest first.
      const available = await settleBillsFromWallet(c, req.vendor!.id, Number(v.wallet_available));
      if (available < body.amount) {
        const netted = Number(v.wallet_available) - available;
        throw new HttpError(422, netted > 0
          ? `Insufficient available balance. Sokoni Hub bills of QAR ${netted.toFixed(2)} were deducted first, so you can request up to QAR ${available.toFixed(2)}.`
          : `Insufficient available balance. You can request up to QAR ${available.toFixed(2)}.`);
      }

      // Deduct from available
      await c.query(
        `update vendors set wallet_available = wallet_available - $1 where id = $2`,
        [body.amount, req.vendor!.id]
      );

      // Create ledger entry
      await c.query(
        `insert into wallet_transactions (vendor_id, amount, type, description) values ($1, $2, 'withdrawal', 'Payout request')`,
        [req.vendor!.id, -body.amount]
      );

      // Create payout request
      await c.query(
        `insert into payouts (vendor_id, amount, bank_name, bank_account_name, bank_iban) 
         select id, $1, bank_name, bank_account_name, bank_iban from vendors where id = $2`,
        [body.amount, req.vendor!.id]
      );
    });

    res.json({ success: true, message: 'Payout requested successfully' });
  } catch (e) {
    next(e);
  }
});

// Update Bank Details
const BankSchema = z.object({
  bank_name: z.string().min(1),
  bank_account_name: z.string().min(1),
  bank_iban: z.string().min(10),
});

wallet.put('/bank', requireAuth('vendor'), loadVendor, async (req, res, next) => {
  try {
    const body = BankSchema.parse(req.body);
    await query(
      `update vendors set bank_name = $1, bank_account_name = $2, bank_iban = $3 where id = $4`,
      [body.bank_name, body.bank_account_name, body.bank_iban, req.vendor!.id]
    );
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});
