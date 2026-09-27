/**
 * Screenshot the vendor bookings page at real viewport widths, and report the
 * settled layout so the responsive claims are checked rather than asserted.
 *
 * One page, one login: a fresh page per viewport burns the auth rate limit.
 */
const puppeteer = require('puppeteer');

const SIZES = [
  { name: 'mobile-360',   width: 360,  height: 1000 },
  { name: 'mobile-390',   width: 390,  height: 1000 },
  { name: 'tablet-768',   width: 768,  height: 1100 },
  { name: 'tablet-900',   width: 900,  height: 1100 },
  { name: 'desktop-1280', width: 1280, height: 900 },
];

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  await page.goto('http://127.0.0.1:8090/login', { waitUntil: 'networkidle2' });
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'vendor@test.com', password: 'Passw0rd!' }),
    });
    localStorage.setItem('sokoni_token', (await r.json()).token);
  });
  await page.goto('http://127.0.0.1:8090/vendor/bookings', { waitUntil: 'networkidle2' });
  await page.waitForSelector('.bk-item', { timeout: 25000 });
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });

  let bad = 0;
  for (const s of SIZES) {
    await page.setViewport({ width: s.width, height: s.height, deviceScaleFactor: 2, isMobile: s.width < 820, hasTouch: s.width < 820 });
    await new Promise((r) => setTimeout(r, 700));

    const info = await page.evaluate(() => {
      const doc = document.documentElement;
      const item = document.querySelector('.bk-item');
      const head = document.querySelector('.bk-head');
      const label = document.querySelector('.bk-label');
      const list = document.querySelector('.bk-list');
      const btn = document.querySelector('.bk-c-action .btn');
      const overflow = doc.scrollWidth > doc.clientWidth ? `${doc.scrollWidth} > ${doc.clientWidth}` : 'none';
      // Smallest tap target among the controls a thumb actually uses.
      let minTap = Infinity;
      document.querySelectorAll('.bk-c-action .btn, .bk-filters .btn').forEach((b) => {
        minTap = Math.min(minTap, Math.round(b.getBoundingClientRect().height));
      });
      if (!list || !item) return { error: `list=${!!list} item=${!!item} url=${location.pathname}` };
      return {
        cols: getComputedStyle(list).gridTemplateColumns.split(' ').length,
        itemCols: getComputedStyle(item).gridTemplateColumns.split(' ').length,
        head: head ? getComputedStyle(head).display !== 'none' : false,
        labels: label ? getComputedStyle(label).display !== 'none' : false,
        btnW: btn ? Math.round(btn.getBoundingClientRect().width) : 0,
        minTap: minTap === Infinity ? null : minTap,
        overflow,
      };
    });
    if (info.error) { console.log(s.name.padEnd(13), 'ERROR', info.error); bad++; continue; }
    if (info.overflow !== 'none' || (info.minTap !== null && info.minTap < 44 && s.width < 820)) bad++;
    console.log(
      s.name.padEnd(13),
      `listCols=${info.cols} itemCols=${info.itemCols}`,
      `header=${info.head ? 'shown' : 'hidden'}`,
      `labels=${info.labels ? 'shown' : 'hidden'}`,
      `tap=${info.minTap}px`,
      `overflow=${info.overflow}`
    );
    await page.screenshot({ path: `/home/user/shots/bookings-${s.name}.png`, fullPage: true });
  }

  await browser.close();
  console.log(bad === 0 ? '\nAll viewports clean.' : `\n${bad} viewport(s) with problems.`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
