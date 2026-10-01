# Order-code mobile responsiveness fix

This patch fixes long order references overflowing into the Buyer column on vendor/admin dashboards.

## What it changes

1. **Existing orders remain unchanged in the database.** Their full reference is retained for tracking, exports, receipts, and WhatsApp messages.
2. On mobile dashboards, an existing long order reference is shown compactly, for example:
   ```text
   ORD-C5AC…D0322
   ```
   The full code remains in the element title/accessibility label and is still visible on desktop.
3. New orders use a shorter order code: `ORD-` plus 16 hexadecimal characters (64 bits of secure randomness), rather than the old 32-character random suffix. This is still over 18 quintillion possible values.
4. Long references are allowed to wrap safely on desktop/tablet instead of painting over the next table cell.
5. The correction applies to vendor orders, vendor recent orders, and admin orders.

## Database

No database migration is required. Do not change existing order codes.

## Files to replace

Replace these files at the same paths:

- `api/src/utils.ts`
- `api/src/routes/orders.ts`
- `web/src/lib/format.ts`
- `web/src/pages/vendor/VendorOrders.tsx`
- `web/src/pages/vendor/VendorOverview.tsx`
- `web/src/pages/admin/AdminMisc.tsx`
- `web/src/styles.css`

No mobile application files are included or changed.
