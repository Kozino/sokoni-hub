# Money model switch: fix

Replace these files at the same paths. No database migration is needed: the switch is stored in the existing system_settings table (key money_model).

API (api/src):
- moneyModel.ts (reads the switch; defaults)
- walletSettlement.ts (commission only when commission mode is on)
- routes/admin.ts (GET/PUT /admin/money-model)
- routes/billing.ts, routes/vendors.ts, routes/listings.ts, routes/meta.ts

Web (web/src):
- App.tsx (route /admin/money-model)
- pages/admin/AdminLayout.tsx (sidebar "Money model" link, Commerce group)
- pages/admin/AdminMoneyModel.tsx (the switch page)
- pages/vendor/VendorPlans.tsx

Tests:
- tests/money-wallet.mjs

Then: cd api && npm run build; cd web && npm run build.
