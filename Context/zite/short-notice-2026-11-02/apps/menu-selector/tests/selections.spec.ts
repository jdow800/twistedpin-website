import { test, expect, type Page } from '@playwright/test';
import { inputFingerprint } from '../src/lib/builderContract';

async function chooseEstimate(page: Page, lane: 'vip' | 'traditional', hours: 2 | 3) {
  const panel = page.locator('#estimate-panel');
  await panel.getByRole('button', { name: `${hours} hours`, exact: true }).click();
  await panel.getByRole('button', { name: `Choose ${lane === 'vip' ? 'VIP Suite' : 'Traditional lanes'} for ${hours} hours`, exact: true }).click();
}

type Mock = { requests: string[]; denied?: string[]; menuDelay?: Record<string, number>; menuFailure?: boolean; absentThree?: boolean; error?: 'engine_unavailable' | 'closed' };
async function setup(page: Page, mock: Mock = { requests: [] }, now = '2026-10-23T15:00:00Z') {
  await page.clock.install({ time: new Date(now) });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.pathname === '/api/estimate/menu/') {
      const time = url.searchParams.get('t') || '';
      const denied = mock.denied?.includes(time);
      const fail = mock.menuFailure;
      const delay = mock.menuDelay?.[time] || 0;
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (fail && url.searchParams.has('d')) return route.abort('connectionreset');
      return route.fulfill({ json: { ok: true, date: url.searchParams.get('d'), date_restriction: null,
        pizza_pop: { offered: url.searchParams.get('tier') !== 'el' && !denied },
        rates: { step: 5, service_fee_rate: .18, tax_rate: .1, packages: {
          pizza_pop: { floor: 10, per_head: 19 }, stars_strikes: { floor: 15, per_head: 24 },
          italiano: { floor: 15, per_head: 26 }, burrito_bowl: { floor: 15, per_head: 26 } } },
        rules: { vip_3h_recommended_from: 43, trad_only_floor: 76, vip_ceiling: 80 } } });
    }
    if (url.pathname === '/api/estimate/track/') return route.fulfill({ json: { ok: true } });
    if (url.pathname === '/api/estimate/') {
      mock.requests.push(url.search);
      if (mock.error) return route.fulfill({ status: mock.error === 'closed' ? 422 : 503,
        json: { ok: false, code: mock.error, message: mock.error === 'closed' ? 'Closed for this date.' : 'Pricing temporarily unavailable.' } });
      const date = url.searchParams.get('d')!, start = url.searchParams.get('t')!, guests = Number(url.searchParams.get('g'));
      const today = await page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()));
      const days = (Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000;
      const option = (lane_type: 'vip' | 'traditional', hours: number) => {
        if (hours === 3 && (start === '20:00' || mock.absentThree)) return null;
        const total = guests * 10 + 455 + (hours === 3 ? 100 : 0);
        return { lane_type, hours, lanes: 4, whole_suite: false, lane_label: lane_type === 'vip' ? 'VIP Suite' : 'Traditional lanes',
          lines: [{ key: 'food', label: 'Food', amount: total }], total, deposit: Math.round(total / 10) * 5,
          includes_service_and_tax: true, food_billed_for: guests };
      };
      return route.fulfill({ json: { ok: true, date, start, days_out: days, planned_for: guests,
        deposit_shown: days >= 10, default: guests >= 76 ? 'trad_2h' : 'vip_2h',
        regime: guests >= 76 ? 'traditional_only' : 'standard', notices: [], neighbors: [],
        options: { vip_2h: guests >= 76 ? null : option('vip', 2), vip_3h: guests >= 76 ? null : option('vip', 3),
          trad_2h: option('traditional', 2), trad_3h: option('traditional', 3) } } });
    }
    if (route.request().resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="64"><rect width="180" height="64" fill="#252b2b"/></svg>' });
    return route.abort();
  });
}
async function ready(page: Page, guests = 40, food = 'stars-strikes', date = '2026-11-02', tier = 'es') {
  await page.goto('/b/' + tier + '/E-TEST?d=' + date + '&t=16:00&g=' + guests);
  await page.locator('#builder-pkg-' + food).getByRole('button').first().click();
}
const guests = (page: Page) => page.locator('input[inputmode=numeric]').first();
const calc = (page: Page) => page.getByRole('button', { name: /^(See estimate|Update estimate|Retry estimate)$/ }).last();
async function typeCount(page: Page, text: string, commit = true) {
  const input = guests(page);
  await input.press('ControlOrMeta+A');
  await input.pressSequentially(text, { delay: 35 });
  if (commit) await input.press('Enter');
}
async function price(page: Page) {
  await expect(calc(page)).toBeEnabled();
  await calc(page).click();
  await expect(page.getByRole('button', { name: 'Review request →', exact: true })).toBeVisible();
}
async function review(page: Page) { await page.getByRole('button', { name: 'Review request →', exact: true }).click(); }

test('guest typing, blur/Enter, ceiling, blank restore and focused See estimate use committed count', async ({ page }) => {
  const mock: Mock = { requests: [] }; await setup(page, mock); await ready(page);
  await page.locator('#builder-addon-arcade_cards').getByRole('button').first().click();
  await typeCount(page, '60', false); await expect(guests(page)).toHaveValue('60');
  await price(page); expect(new URLSearchParams(mock.requests.at(-1)).get('g')).toBe('60');
  expect(new URLSearchParams(mock.requests.at(-1)).get('a')).toBe('arcade_cards:60');
  await typeCount(page, '61'); await expect(guests(page)).toHaveValue('65');
  await expect(page.getByRole('status').filter({ hasText: /^Rounded up to 65 guests for this estimate\.$/ })).toHaveText('Rounded up to 65 guests for this estimate.');
  await guests(page).fill(''); await guests(page).blur(); await expect(guests(page)).toHaveValue('65');
  await typeCount(page, '100'); await expect(guests(page)).toHaveValue('100');
  await typeCount(page, '101'); await expect(page.getByText('100+', { exact: true })).toBeVisible();
  await page.goto('/b/el/E-TEST?g=61'); await expect(guests(page)).toHaveValue('65');
});

test('draft changes invalidate existing Review immediately and plus uses committed draft', async ({ page }) => {
  const mock: Mock = { requests: [] }; await setup(page, mock); await ready(page);
  await price(page); await typeCount(page, '61', false);
  await expect(page.getByRole('button', { name: 'Review request →', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '+', exact: true }).click();
  await expect(guests(page)).toHaveValue('70'); await price(page);
  expect(new URLSearchParams(mock.requests.at(-1)).get('g')).toBe('70');
});

test('per-guest defaults follow; explicit quantities clamp only down and toggle resets', async ({ page }) => {
  const mock: Mock = { requests: [] }; await setup(page, mock); await ready(page, 60);
  const arcade = page.locator('#builder-addon-arcade_cards'), bags = page.locator('#builder-addon-goodie_bags');
  for (const item of [arcade, bags]) await item.getByRole('button').first().click();
  await typeCount(page, '65');
  for (const item of [arcade, bags]) await expect(item.locator('input')).toHaveValue('65');
  for (const item of [arcade, bags]) { await item.locator('input').fill('20'); await item.locator('input').press('Enter'); }
  await typeCount(page, '70'); await price(page);
  expect(new URLSearchParams(mock.requests.at(-1)).get('a')).toBe('arcade_cards:20,goodie_bags:20');
  await typeCount(page, '15'); await typeCount(page, '65');
  for (const item of [arcade, bags]) await expect(item.locator('input')).toHaveValue('15');
  await arcade.getByRole('button').first().click(); await arcade.getByRole('button').first().click();
  await expect(arcade.locator('input')).toHaveValue('65');
  // Editing to the existing default is explicit; merely focusing and blurring is not.
  await arcade.locator('input').press('ControlOrMeta+A'); await arcade.locator('input').pressSequentially('65'); await arcade.locator('input').press('Enter');
  await typeCount(page, '70'); await expect(arcade.locator('input')).toHaveValue('65');
  await bags.getByRole('button').first().click(); await bags.getByRole('button').first().click();
  await bags.locator('input').focus(); await bags.locator('input').blur(); await typeCount(page, '75');
  await expect(bags.locator('input')).toHaveValue('75');
});

test('shared quantity control permits deleting and replacing multi-digit quantities', async ({ page }) => {
  const mock: Mock = { requests: [] }; await setup(page, mock); await ready(page, 60);
  const arcade = page.locator('#builder-addon-arcade_cards'); await arcade.getByRole('button').first().click();
  const input = arcade.locator('input'); await input.press('ControlOrMeta+A'); await input.press('Backspace');
  await expect(input).toHaveValue(''); await input.pressSequentially('20', { delay: 40 });
  await price(page); expect(new URLSearchParams(mock.requests.at(-1)).get('a')).toBe('arcade_cards:20');
  await input.fill('60'); await input.press('Enter');
  await input.press('ControlOrMeta+A'); await input.pressSequentially('20');
  await arcade.getByRole('button', { name: '+', exact: true }).click();
  await expect(input).toHaveValue('21');
  await input.fill(''); await input.blur(); await expect(input).toHaveValue('21');
});

test('explicit lane and duration survive counts; capacity override later restores preference', async ({ page }) => {
  await setup(page); await ready(page);
  await page.getByRole('button', { name: 'Choose Traditional lanes', exact: true }).click();
  await typeCount(page, '45'); await price(page); await review(page);
  await expect(page.locator('pre')).toContainText('Traditional Lanes'); await expect(page.locator('pre')).toContainText('2 hours');
  await ready(page, 40);
  await page.getByRole('button', { name: 'Choose VIP Suite', exact: true }).click();
  await page.locator('#step-when').getByRole('button', { name: '2 hours', exact: true }).click();
  await typeCount(page, '80'); await price(page); await review(page); await expect(page.locator('pre')).toContainText('Traditional Lanes');
  await page.locator('.fixed.inset-0.z-50 button').first().click();
  await typeCount(page, '45'); await price(page); await review(page);
  await expect(page.locator('pre')).toContainText('VIP Suite'); await expect(page.locator('pre')).toContainText('2 hours');
});

test('lane selection through estimate controls is explicit', async ({ page }) => {
  await setup(page); await ready(page); await price(page);
  await chooseEstimate(page, 'traditional', 2);
  await typeCount(page, '45'); await price(page); await review(page);
  await expect(page.locator('pre')).toContainText('Traditional Lanes'); await expect(page.locator('pre')).toContainText('2 hours');
});

test('essential Pizza Pop survives pending allowed time and clears only definitive denial', async ({ page }) => {
  const mock: Mock = { requests: [], menuDelay: { '16:30': 400 }, denied: ['17:00'] };
  await setup(page, mock); await ready(page, 40, 'pizza-pop'); await price(page);
  await page.locator('select').first().selectOption('16:30');
  await expect(page.locator('#builder-pkg-pizza-pop')).toBeVisible(); await expect(calc(page)).toBeDisabled();
  await expect(calc(page)).toBeEnabled(); await price(page);
  expect(new URLSearchParams(mock.requests.at(-1)).get('f')).toBe('pizza_pop');
  await page.locator('select').first().selectOption('17:00');
  await expect(page.locator('#step-food')).toContainText("Pizza & Pop isn't offered");
  await expect(page.getByRole('button', { name: 'Choose food', exact: true })).toBeEnabled(); await expect(page.locator('#step-food')).toContainText('Needed');
});

test('obsolete denial cannot clear newer permitted Pizza Pop and elevated link never offers it', async ({ page }) => {
  const mock: Mock = { requests: [], menuDelay: { '16:30': 800 }, denied: ['16:30'] };
  await setup(page, mock); await ready(page, 40, 'pizza-pop');
  await page.locator('select').first().selectOption('16:30'); await page.locator('select').first().selectOption('17:00');
  await expect(calc(page)).toBeEnabled(); await page.waitForTimeout(900); await price(page);
  expect(new URLSearchParams(mock.requests.at(-1)).get('f')).toBe('pizza_pop');
  await ready(page, 40, 'stars-strikes', '2026-11-02', 'el');
  await expect(page.locator('#builder-pkg-pizza-pop')).toHaveCount(0);
});

test('failed Pizza Pop eligibility preserves choice and provides a working retry', async ({ page }) => {
  const mock: Mock = { requests: [] }; await setup(page, mock); await ready(page, 40, 'pizza-pop'); await price(page);
  mock.menuFailure = true; await page.locator('select').first().selectOption('16:30');
  await expect(page.getByRole('button', { name: 'Retry availability check' })).toBeVisible();
  await expect(page.locator('#builder-pkg-pizza-pop')).toBeVisible(); await expect(calc(page)).toBeDisabled();
  mock.menuFailure = false; await page.getByRole('button', { name: 'Retry availability check' }).click();
  await price(page); expect(new URLSearchParams(mock.requests.at(-1)).get('f')).toBe('pizza_pop');
});

test('explicit three hours clears incompatible start and cannot review a two-hour substitution', async ({ page }, info) => {
  const mock: Mock = { requests: [] }; await setup(page, mock); await ready(page, 40);
  await page.locator('select').first().selectOption('20:00'); await page.locator('#step-when').getByRole('button', { name: '3 hours', exact: true }).click();
  await expect(page.locator('select').first()).toHaveValue('');
  await expect(page.getByText('Choose an earlier start time to keep your three-hour event.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose a start time', exact: true })).toBeEnabled(); expect(mock.requests).toHaveLength(0);
  await page.locator('#step-when').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/tmp/selection-duration-' + info.project.name + '.png', scale: 'css', animations: 'disabled' });
  await page.locator('select').first().selectOption('19:00'); await price(page); await review(page);
  await expect(page.locator('pre')).toContainText('3 hours');
});

test('API unavailable explicit option cannot be silently replaced; untouched recommendation can fall back', async ({ page }) => {
  const mock: Mock = { requests: [], absentThree: true }; await setup(page, mock); await ready(page, 40);
  await page.locator('#step-when').getByRole('button', { name: '3 hours', exact: true }).click(); await calc(page).click();
  await expect(page.getByText('That lane and duration combination is unavailable. Choose another option.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review request →', exact: true })).toHaveCount(0);
  await chooseEstimate(page, 'vip', 2); await review(page);
  await expect(page.locator('pre')).toContainText('2 hours');
  await page.goto('/b/es/E-TEST?d=2026-11-02&t=20:00&g=50');
  await page.locator('#builder-pkg-stars-strikes').getByRole('button').first().click();
  await price(page); await review(page); await expect(page.locator('pre')).toContainText('2 hours');
});

test('headcount help follows no date, day10/day9 and Central midnight across DST', async ({ page }, info) => {
  await setup(page, { requests: [] }, '2026-10-31T04:59:00Z');
  await page.goto('/b/el/E-TEST?g=61');
  await expect(page.getByTestId('headcount-help')).toHaveText('Plan around your expected maximum.');
  await page.locator('input[type=date]').fill('2026-11-09');
  await expect(page.getByTestId('headcount-help')).toContainText('Before finalization and final payment');
  await page.getByTestId('headcount-help').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/selection-headcount-advance-' + info.project.name + '.png', scale: 'css', animations: 'disabled' });
  await page.clock.fastForward(61000); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('headcount-help')).toHaveText('Use your final expected guest count. For events within nine days, we confirm that count and collect full payment at booking.');
  await page.locator('input[type=date]').fill('2026-11-10');
  await expect(page.getByTestId('headcount-help')).toContainText('seven days before your event');
  await page.clock.setSystemTime(new Date('2026-11-01T06:59:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('headcount-help')).not.toContainText('reduce');
  await page.clock.fastForward(120000); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('headcount-help')).not.toContainText('reduce');
  await page.getByTestId('headcount-help').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/selection-headcount-' + info.project.name + '.png', scale: 'css', animations: 'disabled' });
});


test('operational recovery follows changed inputs and reload while manual retry stays input-specific', async ({ page, context }) => {
  const mock: Mock = { requests: [], error: 'engine_unavailable' }; await setup(page, mock); await ready(page, 15);
  const logs = () => page.evaluate(() => (window as any).__pricingDiagnostics ?? []);
  await calc(page).click(); await expect(calc(page)).toHaveText('Retry estimate');
  let reports = await logs(); expect(reports).toHaveLength(1);
  const firstSession = reports[0].session_id, firstFingerprint = reports[0].input_fingerprint;
  await typeCount(page, '20'); await calc(page).click(); await expect(calc(page)).toHaveText('Retry estimate');
  reports = await logs(); expect(reports[1].consecutive_failures).toBe(1);
  await expect(page.getByRole('button', { name: 'Ask our team for a quote', exact: true })).toHaveCount(0);
  mock.error = undefined; await price(page); reports = await logs();
  expect(reports.at(-1).event).toBe('recovered'); expect(reports.at(-1).session_id).toBe(firstSession);
  expect(reports.at(-1).input_fingerprint).not.toBe(firstFingerprint);
  expect(reports.at(-1).consecutive_failures).toBe(2);
  mock.error = 'engine_unavailable'; await typeCount(page, '25'); await calc(page).click();
  await expect(calc(page)).toHaveText('Retry estimate');
  await page.reload(); await page.locator('#builder-pkg-stars-strikes').getByRole('button').first().click();
  mock.error = undefined; await price(page); reports = await logs();
  expect(reports).toHaveLength(1); expect(reports[0].event).toBe('recovered');
  expect(reports[0].session_id).toBe(firstSession);
  const other = await context.newPage(); const otherMock: Mock = { requests: [], error: 'engine_unavailable' };
  await setup(other, otherMock); await ready(other, 15); await calc(other).click(); await expect(calc(other)).toHaveText('Retry estimate');
  const otherReports = await other.evaluate(() => (window as any).__pricingDiagnostics ?? []);
  expect(otherReports[0].session_id).not.toBe(firstSession); await other.close();
});

test('an expected policy restriction does not create an operational recovery report', async ({ page }) => {
  const mock: Mock = { requests: [], error: 'closed' }; await setup(page, mock); await ready(page, 15);
  await calc(page).click(); await expect(calc(page)).toHaveText('Retry estimate');
  mock.error = undefined; await typeCount(page, '20'); await price(page);
  const reports = await page.evaluate(() => (window as any).__pricingDiagnostics ?? []);
  expect(reports).toHaveLength(1); expect(reports[0].event).toBe('failure');
  expect(reports[0].failure.api_code).toBe('closed');
});


test('staff reset clears rounding feedback even when reset count matches the rounded count', async ({ page }) => {
  await setup(page); await page.goto('/build');
  await page.locator('input[type=password]').fill('test-only'); await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await typeCount(page, '61'); await expect(page.getByText('Rounded up to 65 guests for this estimate.')).toBeVisible();
  await page.getByRole('button', { name: 'New quote', exact: true }).click();
  await expect(guests(page)).toHaveValue('40'); await expect(page.getByText(/Rounded up to/)).toHaveCount(0);
  await typeCount(page, '39'); await expect(page.getByText('Rounded up to 40 guests for this estimate.')).toBeVisible();
  await page.getByRole('button', { name: 'New quote', exact: true }).click();
  await expect(guests(page)).toHaveValue('40'); await expect(page.getByText(/Rounded up to/)).toHaveCount(0);
});


test('missing explicit option is not recovery; a fresh available choice reports the option actually shown', async ({ page }) => {
  const mock: Mock = { requests: [], error: 'engine_unavailable', absentThree: true };
  await setup(page, mock); await ready(page, 40);
  await page.locator('#step-when').getByRole('button', { name: '3 hours', exact: true }).click();
  await calc(page).click(); await expect(calc(page)).toHaveText('Retry estimate');
  mock.error = undefined; await calc(page).click();
  await expect(page.getByText('That lane and duration combination is unavailable. Choose another option.')).toBeVisible();
  let reports = await page.evaluate(() => (window as any).__pricingDiagnostics ?? []);
  expect(reports).toHaveLength(1); expect(reports[0].event).toBe('failure');
  await expect(page.getByRole('button', { name: 'Review request →', exact: true })).toHaveCount(0);
  // The new comparison chooses duration first: VIP 2h is the first usable displayed option.
  await page.locator('#estimate-panel').getByRole('button', { name: '2 hours', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review request →', exact: true })).toBeVisible();
  reports = await page.evaluate(() => (window as any).__pricingDiagnostics ?? []);
  expect(reports).toHaveLength(2); expect(reports[1].event).toBe('recovered');
  expect(reports[1].configuration.event.duration).toBe(2);
  expect(reports[1].configuration.event.lane_type).toBe('vip');
  expect(reports[1].input_fingerprint).toBe(inputFingerprint(reports[1].configuration));
  // A later deliberate space choice changes the request, not the already recorded recovery.
  await page.locator('#estimate-panel').getByRole('button', { name: 'Choose Traditional lanes for 2 hours', exact: true }).click();
  await review(page);
  await expect(page.locator('pre')).toContainText('Traditional Lanes');
  await expect(page.locator('pre')).toContainText('2 hours');
  await page.getByRole('button', { name: 'Send request with this estimate', exact: true }).click();
  const sent = await page.evaluate(() => (window as any).__submissions ?? []);
  expect(sent).toHaveLength(1);
  expect(sent[0].payload.event).toMatchObject({ lane_type: 'traditional', duration: 2 });
  expect(sent[0].payload.estimate.input_fingerprint).toBe(inputFingerprint(sent[0].payload));
});

test('automatic fallback recovery uses two hours and stale option panels cannot report recovery', async ({ page }) => {
  const mock: Mock = { requests: [], error: 'engine_unavailable', absentThree: true };
  await setup(page, mock); await ready(page, 50);
  await calc(page).click(); await expect(calc(page)).toHaveText('Retry estimate');
  mock.error = undefined; await price(page);
  let reports = await page.evaluate(() => (window as any).__pricingDiagnostics ?? []);
  expect(reports[0].configuration.event.duration).toBe(3);
  expect(reports[1].event).toBe('recovered'); expect(reports[1].configuration.event.duration).toBe(2);
  expect(reports[1].input_fingerprint).toBe(inputFingerprint(reports[1].configuration));
  mock.error = 'engine_unavailable'; await ready(page, 40);
  await page.locator('#step-when').getByRole('button', { name: '3 hours', exact: true }).click();
  await calc(page).click(); await expect(calc(page)).toHaveText('Retry estimate');
  mock.error = undefined; await calc(page).click();
  await expect(page.getByText('That lane and duration combination is unavailable. Choose another option.')).toBeVisible();
  await typeCount(page, '45');
  await chooseEstimate(page, 'vip', 2);
  reports = await page.evaluate(() => (window as any).__pricingDiagnostics ?? []);
  expect(reports).toHaveLength(1); expect(reports[0].event).toBe('failure');
  await expect(page.getByRole('button', { name: 'Review request →', exact: true })).toHaveCount(0);
  await price(page); reports = await page.evaluate(() => (window as any).__pricingDiagnostics ?? []);
  expect(reports.at(-1).event).toBe('recovered');
  expect(reports.at(-1).configuration.event).toMatchObject({ guests: 45, duration: 2, lane_type: 'vip' });
});


test('Step controls close an incident only when their chosen lane and duration have a current price', async ({ page }) => {
  const mock: Mock = { requests: [], error: 'engine_unavailable', absentThree: true };
  await setup(page, mock); await ready(page, 40);
  await page.locator('#step-when').getByRole('button', { name: '3 hours', exact: true }).click();
  await calc(page).click(); await expect(calc(page)).toHaveText('Retry estimate');
  mock.error = undefined; await calc(page).click();
  await expect(page.getByText('That lane and duration combination is unavailable. Choose another option.')).toBeVisible();
  await page.getByRole('button', { name: 'Choose Traditional lanes', exact: true }).click();
  let reports = await page.evaluate(() => (window as any).__pricingDiagnostics ?? []);
  expect(reports).toHaveLength(1);
  await page.locator('#step-when').getByRole('button', { name: '2 hours', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review request →', exact: true })).toBeVisible();
  await expect(page.getByText('That lane and duration combination is unavailable. Choose another option.')).toHaveCount(0);
  reports = await page.evaluate(() => (window as any).__pricingDiagnostics ?? []);
  expect(reports).toHaveLength(2); expect(reports[1].event).toBe('recovered');
  expect(reports[1].configuration.event).toMatchObject({ duration: 2, lane_type: 'traditional', guests: 40 });
  expect(reports[1].input_fingerprint).toBe(inputFingerprint(reports[1].configuration));
});
