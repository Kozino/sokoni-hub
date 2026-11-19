// Site content: markdown parser, HTML strip, public payload never leaks drafts.
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
      const resolved = path.normalize(path.join(path.dirname(file), id)) + '.ts';
      return load(resolved.replace(/\\/g, '/').replace(root.replace(/\\/g, '/') + '/', ''), stubs);
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

const content = load('api/src/content.ts', {
  './db': { one: async () => null, query: async () => [] },
  './utils': { HttpError },
});

let count = 0;
const ok = (v, m) => { assert(v, m); console.log('PASS', m); count++; };

ok(content.sanitiseMarkdown('<p>Hello</p> **team**') === 'Hello **team**', 'HTML tags are stripped from markdown');
ok(!content.sanitiseMarkdown('<script>alert(1)</script>Safe').includes('<script>'), 'script tags cannot survive sanitise');

const sections = content.markdownToSections(`## Payments
Sokoni Hub does not hold funds.

- **Cash on delivery:** Pay the rider.
- **Bank transfer:** Pay the vendor.

### Notes
Keep your receipt.
`);
ok(sections.length === 1 && sections[0].title === 'Payments', '## becomes a section title');
ok(sections[0].blocks[0].t === 'p' && /does not hold/.test(sections[0].blocks[0].text), 'paragraphs are kept');
ok(sections[0].blocks[1].t === 'ul' && /^Cash on delivery:?$/.test(sections[0].blocks[1].items[0].b || ''), 'bold list leads become labels');
ok(sections[0].blocks[2].t === 'h3' && sections[0].blocks[2].text === 'Notes', '### becomes a subheading');

try { content.parseSlug('checkout'); ok(false, 'unknown slug'); }
catch (e) { ok(e.status === 404, 'unknown slug is 404'); }
ok(content.parseSlug('terms') === 'terms', 'terms is a known slug');

const unpublished = content.publicDocument({ slug: 'terms', published_markdown: 'secret draft' }, content.DEFAULT_CONTACT);
ok(unpublished === null, 'a page without published_at is omitted from the public payload');

const published = content.publicDocument({
  slug: 'terms',
  published_at: '2026-10-01T00:00:00.000Z',
  published_title: 'Terms of Use',
  published_subtitle: '',
  published_markdown: 'Email {{supportEmail}} or WhatsApp {{supportDisplay}}.',
  published_version: '2026-10-01',
  published_effective: '1 October 2026',
}, content.DEFAULT_CONTACT);
ok(published.markdown.includes(content.DEFAULT_CONTACT.supportEmail), 'published markdown fills {{supportEmail}}');
ok(published.markdown.includes(content.DEFAULT_CONTACT.supportDisplay), 'published markdown fills {{supportDisplay}}');
ok(!published.markdown.includes('{{'), 'no leftover tokens in published markdown');

const { DEFAULT_PAGES } = load('api/src/contentDefaults.ts', {});
ok(DEFAULT_PAGES.map((p) => p.slug).join(',') === 'terms,privacy,policy,faq', 'defaults cover the four public documents');

console.log(`content tests: ${count} passed`);
