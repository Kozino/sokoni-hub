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
    if (id.startsWith('.')) {
      const abs = path.join(root, path.dirname(file), id);
      const tsFile = abs.endsWith('.ts') ? abs : abs + '.ts';
      if (fs.existsSync(tsFile)) return load(path.relative(root, tsFile), stubs);
      throw new Error('unexpected import ' + id + ' from ' + file);
    }
    return require(id);
  };
  vm.runInNewContext(outputText, { module, exports: module.exports, require: req, console }, { filename: file });
  return module.exports;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const phone = load('api/src/phoneQa.ts', {
  './utils': { HttpError },
});

let count = 0;
const ok = (v, m) => { assert(v, m); console.log('PASS', m); count++; };

ok(phone.canonicalQatarMobile('+974 5512 3456') === '97455123456', 'Ooredoo 55 with +974 and spaces');
ok(phone.canonicalQatarMobile('33123456') === '97433123456', 'Ooredoo 33 local 8-digit');
ok(phone.canonicalQatarMobile('97466123456') === '97466123456', 'Ooredoo 66 with country code');
ok(phone.canonicalQatarMobile('77 123 456') === '97477123456', 'Vodafone 77');
ok(phone.canonicalQatarMobile('0097450123456') === '97450123456', '00 prefix and 50 range');
ok(phone.canonicalQatarMobile('055123456') === '97455123456', 'leading 0 then 8-digit mobile');
ok(phone.isQatarMobile('70123456'), 'Vodafone 70 range');

ok(phone.canonicalQatarMobile('+234 801 234 5678') === null, 'Nigeria rejected');
ok(phone.canonicalQatarMobile('+256772123456') === null, 'Uganda rejected');
ok(phone.canonicalQatarMobile('44123456') === null, 'Qatar landline 44 rejected');
ok(phone.canonicalQatarMobile('12345678') === null, 'non-mobile first digit rejected');
ok(phone.canonicalQatarMobile('5512345') === null, 'too short rejected');
ok(phone.canonicalQatarMobile('974551234567') === null, 'too long rejected');

try {
  phone.requireQatarMobile('+1 202 555 0100');
  ok(false, 'US number must throw');
} catch (e) {
  ok(e.status === 422 && /Ooredoo or Vodafone/.test(e.message), 'requireQatarMobile throws 422');
}

const lookup = phone.phoneLookupValues('+974 5512 3456');
ok(lookup.includes('97455123456') && lookup.includes('55123456'), 'login lookup includes both stored forms');

console.log('phoneQa tests:', count, 'passed');
