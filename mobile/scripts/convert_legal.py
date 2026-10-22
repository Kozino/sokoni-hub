"""Regenerates mobile/src/legalText.ts from the website's legal pages, so the app shows exactly the same wording.

    python3 mobile/scripts/convert_legal.py        (run from the repository root; needs Python 3 and Node)

Sources: web/src/pages/Legal.tsx (Terms, Privacy), web/src/pages/Static.tsx (Policy) and web/src/legalConfig.ts
(contact details, providers, retention schedule, version). Run it again whenever those pages change.
"""
import json, os, re, subprocess, sys, tempfile
from html.parser import HTMLParser

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
WEB = os.path.join(REPO, 'web', 'src')
OUT = os.path.join(REPO, 'mobile', 'src', 'legalText.ts')

# ---- legalConfig.ts -> python dict (evaluated by node, so quotes/apostrophes are exact)
cfg_src = open(f'{WEB}/legalConfig.ts').read().replace('export const legalConfig =', 'module.exports =').replace(' as [string, string][]', '')
tmp = os.path.join(tempfile.gettempdir(), 'sokoni_legalConfig.cjs')
open(tmp, 'w').write(cfg_src)
cfg = json.loads(subprocess.check_output(['node', '-e', f"console.log(JSON.stringify(require({json.dumps(tmp)})))"]))

legal = open(f'{WEB}/pages/Legal.tsx').read()
static = open(f'{WEB}/pages/Static.tsx').read()

def between(src, start, end):
    a = src.index(start)
    b = src.index(end, a + len(start)) if end else len(src)
    return src[a + len(start):b]

terms_jsx = between(legal, 'export function Terms() {', 'export function Privacy()')
privacy_jsx = between(legal, 'export function Privacy() {', 'const faqs')
policy_jsx = between(static, 'export function Policy() {', '/* ------')


def prep(jsx):
    jsx = re.sub(r'\{/\*.*?\*/\}', '', jsx, flags=re.S)
    # dynamic lists
    prov = ''.join(f'<li><strong>{n}:</strong> {r}</li>' for n, r in cfg['providers'])
    ret = ''.join(f'<li><strong>{n}:</strong> {r}</li>' for n, r in cfg['retention'])
    jsx = re.sub(r'\{c\.providers\.map\(.*?\)\)\}', prov, jsx, flags=re.S)
    jsx = re.sub(r'\{c\.retention\.map\(.*?\)\)\}', ret, jsx, flags=re.S)
    # analytics conditional -> wording that is true for the app whichever way the website is configured
    app_analytics = ('<p>The Sokoni Hub app does not load Google Analytics, Google Tag Manager or any advertising measurement.</p>'
                     '<p>Where the website offers optional analytics, it only runs after you accept it in the website’s Cookie settings. That choice does not apply to the app.</p>')
    jsx = re.sub(r'\{analyticsConfigured \?.*?\n\s*\)\}\n', app_analytics + '\n', jsx, flags=re.S)
    jsx = jsx.replace('<Operator />', '')
    jsx = jsx.replace("{c.supportEmail}", cfg['supportEmail']).replace("{c.supportDisplay}", cfg['supportDisplay'])
    jsx = jsx.replace("{' '}", ' ')
    return jsx


class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.sections, self.cur, self.buf, self.mode, self.items, self.ul = [], None, None, None, None, False

    def section(self):
        if self.cur is None:
            self.cur = {'title': '', 'blocks': []}
            self.sections.append(self.cur)
        return self.cur

    def handle_starttag(self, tag, attrs):
        if tag == 'section':
            self.cur = {'title': '', 'blocks': []}
            self.sections.append(self.cur)
        elif tag in ('h2', 'h3', 'p', 'li'):
            self.mode, self.buf = tag, ''
            if tag == 'li' and not self.ul:
                self.mode = None
        elif tag == 'ul':
            self.ul, self.items = True, []
        elif tag == 'strong' and self.buf is not None:
            self.buf += '**'

    def handle_endtag(self, tag):
        if tag == 'strong' and self.buf is not None:
            self.buf += '**'
        elif tag in ('h2', 'h3', 'p', 'li') and self.mode == tag:
            text = re.sub(r'\s+', ' ', self.buf or '').strip()
            self.buf, self.mode = None, None
            if not text:
                return
            sec = self.section()
            if tag == 'h2':
                sec['title'] = text
            elif tag == 'h3':
                sec['blocks'].append({'t': 'h3', 'text': text})
            elif tag == 'p':
                sec['blocks'].append({'t': 'p', 'text': text})
            elif tag == 'li':
                m = re.match(r'^\*\*(.+?)\*\*\s*(.*)$', text)
                self.items.append({'b': m.group(1), 'text': m.group(2)} if m else {'text': text})
        elif tag == 'ul':
            self.ul = False
            if self.items:
                self.section()['blocks'].append({'t': 'ul', 'items': self.items})
            self.items = None

    def handle_data(self, data):
        if self.buf is not None:
            self.buf += data


def parse(jsx):
    p = P()
    p.feed(prep(jsx))
    return [s for s in p.sections if s['title'] or s['blocks']]


terms = parse(terms_jsx)
privacy = parse(privacy_jsx)

# Marketplace policy lives in a single card with h3 headings; turn each h3 group into a section.
pol_raw = prep(policy_jsx)
pol_raw = re.sub(r'<Link[^>]*>.*?</Link>', '', pol_raw, flags=re.S)
pol_raw = pol_raw.replace('<h3', '<section><h2').replace('</h3>', '</h2>')
pol_raw = re.sub(r'<h2[^>]*>', '<h2>', pol_raw)
policy = parse(pol_raw)

operator = {
    'registration': cfg['operatorCR'],
    'operatorName': cfg['operatorName'],
    'email': cfg['supportEmail'],
    'whatsapp': cfg['supportWhatsApp'],
    'display': cfg['supportDisplay'],
    'hours': cfg['supportHours'],
    'response': cfg['responseTime'],
    'version': cfg['version'],
    'effective': cfg['effectiveDate'],
}

docs = [
    {'key': 'terms', 'title': 'Terms of use', 'subtitle': 'How the marketplace works, and what buyers and vendors can expect.', 'sections': terms},
    {'key': 'privacy', 'title': 'Privacy policy', 'subtitle': 'The information used to run your account, orders and service bookings.', 'sections': privacy},
    {'key': 'policy', 'title': 'Marketplace policy', 'subtitle': 'Prohibited items, vendor checks, payments and complaints.', 'sections': policy},
]

ts = '''/**
 * Legal documents shown inside the app (Terms of use, Privacy policy, Marketplace policy).
 *
 * The wording is the website's own text, generated from web/src/pages/Legal.tsx, web/src/pages/Static.tsx (Policy) and
 * web/src/legalConfig.ts (version %s). When those pages change, update this file to match so the app and the website
 * never disagree. Inline **double asterisks** mark bold lead-ins.
 */
export type LegalBlock = { t: 'h3'; text: string } | { t: 'p'; text: string } | { t: 'ul'; items: { b?: string; text: string }[] };
export type LegalSection = { title: string; blocks: LegalBlock[] };
export type LegalDoc = { key: 'terms' | 'privacy' | 'policy'; title: string; subtitle: string; sections: LegalSection[] };

export const LEGAL_OPERATOR = %s as const;

export const LEGAL_DOCS: LegalDoc[] = %s;
''' % (cfg['version'], json.dumps(operator, indent=2, ensure_ascii=False), json.dumps(docs, indent=2, ensure_ascii=False))
open(OUT, 'w').write(ts)

for d in docs:
    n_blocks = sum(len(s['blocks']) for s in d['sections'])
    print(f"{d['key']:8s} sections={len(d['sections'])} blocks={n_blocks}  titles={[s['title'][:34] for s in d['sections']]}")
print('written', OUT, len(ts), 'bytes')
