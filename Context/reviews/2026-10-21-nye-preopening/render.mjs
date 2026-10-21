/** Visual proposals only. The actual landing page and opening schedule are unchanged. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = 'http://127.0.0.1:55610';
const output = new URL('../../../.astro/nye-preopening-review/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const variant of ['closed', 'preview']) {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, isMobile: width === 390, hasTouch: width === 390, reducedMotion: 'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.clock.install({ time: new Date('2026-10-21T19:00:00Z') });
      await page.goto(`${base}/new-years-eve/`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(variant => {
        const card = document.querySelector('[data-nye-opening]');
        card.id = 'nye-opening';
        card.querySelector('[data-nye-opening-heading]').textContent = "Reservations aren't open yet";
        card.querySelector('[data-nye-countdown]').insertAdjacentHTML('beforebegin', '<p class="review-clock-label">Countdown until reservations open</p>');
        card.insertAdjacentHTML('beforeend', '<p class="review-opening-note">Booking opens here at that time.</p>');
        const header = document.querySelector('[data-reservation-action]');
        header.className = 'review-header-status';
        header.href = '#nye-opening';
        header.textContent = 'NYE opens Nov 18';
        const bar = document.querySelector('.nye-mobile-bar');
        bar.innerHTML = '<strong>Reservations aren’t open yet</strong><span>November 18 · 9am Central</span>';
        const times = document.querySelector('.nye-times-section');
        if (variant === 'closed') times.hidden = true;
        else {
          document.querySelector('.nye-opening-wrap').insertAdjacentHTML('beforeend', '<a class="review-preview-link" href="#nye-times">Preview party times &amp; prices</a>');
          const inner = times.querySelector('.nye-inner');
          const disclosure = document.createElement('details');
          disclosure.className = 'review-preview';
          disclosure.innerHTML = '<summary>Preview party times &amp; prices</summary><p class="review-preview-note">Plan ahead. Reservations open November 18 at 9am Central.</p>';
          while (inner.firstChild) disclosure.appendChild(inner.firstChild);
          inner.appendChild(disclosure);
          document.querySelector('.review-preview-link').addEventListener('click', () => { disclosure.open = true; });
        }
        const style = document.createElement('style');
        style.textContent = `
          [data-nye-booking-cta], .nye-from, .nye-rooms .nye-secondary { display: none !important; }
          .nye-opening { border: 2px solid #4eecc4; padding: 22px 20px; box-shadow: 0 12px 36px #0004; scroll-margin-top: 100px; }
          .nye-opening .nye-opening__label { color:#4eecc4; font-size:20px; line-height:1.3; text-transform:none; letter-spacing:0; margin:0 0 18px; }
          .nye-opening .review-clock-label { font:700 14px/1.5 var(--font-ui); margin:22px 0 0; }
          .nye-opening .nye-opening__countdown { margin-top:10px; padding-top:12px; }
          .nye-opening .review-opening-note { font:400 14px/1.5 var(--font-ui); color:#d9d2e7; margin:18px 0 0; text-align:center; }
          .nye-opening-wrap .review-preview-link { display:block; padding:14px 0; font:500 14px/1.5 var(--font-ui); color:#d9d2e7; text-align:center; text-decoration:underline; }
          .review-header-status { font:700 14px/1.5 var(--font-ui); color:#f4efe3; padding:14px 12px; text-decoration:underline; text-underline-offset:5px; }
          .nye-mobile-bar strong { font:700 14px/1.4 var(--font-ui); text-align:center; color:#4eecc4; }
          .review-preview { border:1px solid #514562; border-radius:8px; padding:0 20px; }
          .review-preview summary { cursor:pointer; font:700 16px/1.5 var(--font-ui); padding:20px 0; }
          .review-preview-note { font:400 14px/1.5 var(--font-ui); color:#d9d2e7; }
          .nye-closing [data-nye-opening-reminder] { font-size:20px; color:#4eecc4; font-weight:700; }
        `;
        document.head.appendChild(style);
      }, variant);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Overflow: ${variant} ${width}`);
      await page.screenshot({ path: fileURLToPath(new URL(`${variant}-${width}.png`, output)), fullPage: true });
      await page.screenshot({ path: fileURLToPath(new URL(`${variant}-hero-${width}.png`, output)) });
      if (variant === 'preview' && width === 390) {
        await page.locator('.review-preview-link').click();
        await page.locator('.review-preview[open]').waitFor();
        await page.screenshot({ path: fileURLToPath(new URL('preview-expanded-390.png', output)) });
      }
      await context.close();
    }
  }
  console.log(`Rendered both pre-opening proposals at phone and desktop widths: ${fileURLToPath(output)}`);
} finally { await browser.close(); }
