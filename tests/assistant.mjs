// Sokoni Assistant: synonyms, intent, no silent checkout, public cards.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(root, 'api/package.json'));

function loadTs(file) {
  // Compile a single TS module (and its local relative imports) with the API's TypeScript.
  const ts = require('typescript');
  const src = path.join(root, file);
  const program = ts.createProgram([src], {
    target: ts.ScriptTarget.ES2021,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
    skipLibCheck: true,
    moduleResolution: ts.ModuleResolutionKind.Node10,
  });
  const out = {};
  const result = program.emit(undefined, (name, text) => { out[name] = text; });
  if (result.emitSkipped) throw new Error('emit skipped for ' + file);
  return { ts, out, src };
}

// The synonym and intent modules have no DB dependency — evaluate them in isolation.
import { createRequire as cr } from 'node:module';
import vm from 'node:vm';
import fs from 'node:fs';

function transpile(file, req) {
  const ts = require('typescript');
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true },
    fileName: file,
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, { module, exports: module.exports, require: req, console }, { filename: file });
  return module.exports;
}

const syn = transpile('api/src/assistant/synonyms.ts', createRequire(path.join(root, 'api/src/assistant/synonyms.ts')));
const intent = transpile('api/src/assistant/intent.ts', (name) => {
  if (name === './synonyms') return syn;
  return createRequire(path.join(root, 'api/src/assistant/intent.ts'))(name);
});

let n = 0;
const ok = (v, m) => { assert(v, m); console.log('PASS', m); n++; };

const rice = syn.expandSearchQuery('mchele 5kg');
ok(rice.tokens.includes('rice') || rice.patterns.some((p) => p.includes('rice')), 'mchele expands to rice');
ok(syn.expandSearchQuery('palm oil').patterns.some((p) => p.includes('zomi') || p.includes('palm')), 'palm oil expands');
ok(syn.expandSearchQuery('posho').patterns.some((p) => p.includes('ugali') || p.includes('maize')), 'posho expands to ugali/maize');
ok(syn.expandSearchQuery('').tokens.length === 0, 'empty query expands to nothing');

const add = intent.parseIntent('add 2 palm oil', 'en');
ok(add.intent === 'add' && add.qty === 2, 'add 2 palm oil');
ok(intent.parseIntent('ninaomba mchele', 'en').locale === 'sw', 'swahili detected');
ok(intent.parseIntent('checkout please', 'en').intent === 'checkout', 'checkout intent');
ok(intent.parseIntent('where is ORD-ABCDEF12 97455123456', 'en').trackCode === 'ORD-ABCDEF12', 'track code extracted');
ok(intent.parseIntent('book a braid', 'en').intent === 'book' || intent.parseIntent('book a braid', 'en').kind === 'service', 'booking / service');

const toolsSrc = fs.readFileSync(path.join(root, 'api/src/assistant/tools.ts'), 'utf8');
ok(!/place_order|confirm_checkout|orders\/checkout/.test(toolsSrc), 'tools never call checkout');
ok(toolsSrc.includes("name: 'search_listings'"), 'search tool exists');
ok(toolsSrc.includes("name: 'quote_cart'"), 'quote tool exists');

const orch = fs.readFileSync(path.join(root, 'api/src/assistant/orchestrator.ts'), 'utf8');
ok(orch.includes("type: 'open_checkout'"), 'checkout is a handoff action, not a place');
ok(!/post<.*checkout|\/orders\/checkout/.test(orch), 'orchestrator does not POST checkout');

const prompt = fs.readFileSync(path.join(root, 'api/src/assistant/prompt.ts'), 'utf8');
ok(prompt.includes('cannot place an order'), 'system prompt forbids placing orders');
ok(prompt.includes('untrusted data'), 'listing text is untrusted');

const mig = fs.readFileSync(path.join(root, 'db/migrations/032_assistant.sql'), 'utf8');
ok(mig.includes('ai-assistant'), 'order source includes ai-assistant');
ok(mig.includes('retention_days'), 'retention setting exists');
ok(mig.includes('pg_trgm'), 'trigram extension');

console.log(`\n${n} checks passed`);
