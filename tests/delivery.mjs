// Platform delivery: admin fee/radius overlay the vendor row.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(root, 'api/package.json'));
const ts = require('typescript');

function load(file, stubs = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true },
    fileName: file,
  });
  const module = { exports: {} };
  const req = (id) => {
    if (stubs[id]) return stubs[id];
    if (id.startsWith('.')) throw new Error('unexpected import ' + id + ' from ' + file);
    return require(id);
  };
  vm.runInNewContext(outputText, { module, exports: module.exports, require: req, console }, { filename: file });
  return module.exports;
}

const delivery = load('api/src/delivery.ts', {
  './db': { one: async () => null, query: async () => [] },
});

let count = 0;
const ok = (v, m) => { assert(v, m); console.log('PASS', m); count++; };

const p = delivery.normalizePlatformDelivery({ delivery_fee: 15, delivery_radius_km: 12, free_delivery_over: 200 });
ok(p.delivery_fee === 15 && p.delivery_radius_km === 12 && p.free_delivery_over === 200, 'admin numbers are kept');

const empty = delivery.normalizePlatformDelivery({ delivery_fee: 0, delivery_radius_km: null, free_delivery_over: null });
ok(empty.delivery_radius_km === null && empty.free_delivery_over === null, 'empty radius and free-over mean no limit');

const vendor = {
  vendor_id: 'v1',
  offers_pickup: true,
  offers_delivery: true,
  delivery_fee: 99,
  free_delivery_over: 1,
  delivery_radius_km: 3,
  pickup_address: 'Al Sadd',
  delivery_notes: 'note',
};
const applied = delivery.applyPlatformDelivery(vendor, p);
ok(applied.delivery_fee === 15 && applied.delivery_radius_km === 12 && applied.free_delivery_over === 200, 'admin fee and radius replace the vendor numbers');
ok(applied.pickup_address === 'Al Sadd' && applied.offers_delivery === true, 'pickup address and flags stay with the vendor');

const quoted = delivery.quoteVendorOrder({
  vendor_id: 'v1',
  vendor_name: 'Test Shop',
  subtotal: 50,
  currency: 'QAR',
  mode: 'delivery',
  settings: applied,
});
ok(quoted.delivery_fee === 15, 'checkout uses the admin fee');

const free = delivery.quoteVendorOrder({
  vendor_id: 'v1',
  vendor_name: 'Test Shop',
  subtotal: 200,
  currency: 'QAR',
  mode: 'delivery',
  settings: applied,
});
ok(free.delivery_fee === 0, 'free-delivery threshold is the admin one');

const pickup = delivery.quoteVendorOrder({
  vendor_id: 'v1',
  vendor_name: 'Test Shop',
  subtotal: 50,
  currency: 'QAR',
  mode: 'pickup',
  settings: applied,
});
ok(pickup.delivery_fee === 0, 'collection is still free');

console.log(`delivery tests: ${count} passed`);
