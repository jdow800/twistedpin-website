import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../package.json', import.meta.url));
const {build} = require('esbuild');
const {chromium} = require('playwright');
const {outputFiles} = await build({
  stdin: {contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {GradeEvidence} from './src/components/liquor/GradeEvidence';
    import {frozen, legacy, unavailable, line} from './scripts/qa-liquor-bottle-sizes/grade-evidence-fixtures.mjs';
    const extra = Array.from({length: 6}, (_, i) => line('extra-'+i, 'Long product name with multiple bottle sizes and a sufficiently descriptive qualifier '+i, {missingCost: .1}));
    frozen.snapshot.lines.push(...extra);
    window.renderGrade = (mode) => createRoot(document.getElementById('root')).render(<div className="lq-app"><main className="lq-main"><GradeEvidence detail={mode === 'legacy' ? legacy : mode === 'unavailable' ? unavailable : frozen}/></main></div>);
    window.renderGrade('frozen');`, resolveDir: root, loader: 'tsx'},
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: {'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"'},
});
const css = await readFile(new URL('../../src/components/liquor/liquor.css', import.meta.url), 'utf8');
const out = join(tmpdir(), 'twisted-pin-grade-evidence-qa');
await mkdir(out, {recursive: true});
const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({width, height: 900});
    await page.setContent(`<html><head><style>body{margin:0}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({content: outputFiles[0].text});
    await page.getByRole('heading', {name: 'Published bar grade'}).waitFor();
    assert.equal(await page.locator('.lq-grade-line').count(), 8);
    await page.getByRole('button', {name: 'Show all 11 products'}).click();
    assert.equal(await page.locator('.lq-grade-line').count(), 11);
    await page.locator('.lq-grade-line').first().locator('summary').click();
    assert.equal(await page.locator('.lq-grade-line').first().getAttribute('open'), '');
    assert.equal(await page.getByText('Opening count by location', {exact: true}).first().isVisible(), true);
    await page.locator('.lq-grade-model-days').first().locator('summary').click();
    assert.equal(await page.getByText('Count splits the operating day; discard is not estimated.', {exact: true}).first().isVisible(), true);
    const overflow = await page.evaluate(() => ({viewport: innerWidth, page: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll('.lq-grade *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => el.tagName)}));
    assert.ok(overflow.page <= width && overflow.offenders.length === 0, `overflow at ${width}: ${JSON.stringify(overflow)}`);
    await page.screenshot({path: join(out, `grade-${width}.png`), fullPage: true});
    if (width === 390) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({path: join(out, 'grade-mobile-top.png')});
      await page.getByRole('heading', {name: 'Risata · expected discard'}).scrollIntoViewIfNeeded();
      await page.screenshot({path: join(out, 'grade-mobile-risata.png')});
    }
    console.log(`PASS ${width}px: evidence and daily controls work; no horizontal overflow`);
  }
  assert.deepEqual(errors, []);
  console.log(`Grade evidence screenshots: ${out}`);
} finally { await browser.close(); }
