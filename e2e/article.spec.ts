import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHash } from 'node:crypto';

const showcase = 'http://127.0.0.1:4173/';
const next = 'http://127.0.0.1:4174/';

test('two static articles remain independent across widths and themes', async ({ page }) => {
  await page.goto(showcase);
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'A synthetic showcase' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A second synthetic document' })).toBeVisible();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    await expect(page.locator('.marimo-blog')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 2);
  }
  await page.getByRole('button', { name: 'Switch to dark' }).click();
  await expect(page.locator('.showcase')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Use wide container' }).click();
  await expect(page.locator('main')).toHaveClass(/wide/);
  await page.getByRole('button', { name: 'Switch to light' }).click();
  await expect(page.locator('.showcase')).toHaveAttribute('data-theme', 'light');
});

test('tabs and anchors work with keyboard without changing the other article', async ({ page }) => {
  await page.goto(showcase);
  const first = page.getByRole('article').first();
  const second = page.getByRole('article').nth(1);
  await first.getByRole('tab', { name: 'First' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(first.getByRole('tab', { name: 'Second' })).toHaveAttribute('aria-selected', 'true');
  await expect(first.getByRole('tabpanel', { name: 'Second' })).toContainText('Another saved result.');
  await expect(second).toContainText('A second synthetic document');
  const contents = first.getByRole('navigation', { name: 'Table of contents' });
  if (!(await contents.locator('details').evaluate((element: HTMLDetailsElement) => element.open))) await contents.locator('summary').click();
  await first.getByRole('link', { name: 'Introduction' }).click();
  await expect(page).toHaveURL(/#introduction$/);
});

test('inline source and view switches remain synchronized and scoped to their article', async ({ page }) => {
  await page.route(/\/documents\/(showcase|second)\.json$/, async (route) => {
    const response = await route.fetch();
    const document = await response.json();
    document.cells[0].source = 'saved_result = 42';
    document.cells[0].outputs.push({ type: 'html', html: '<pre><code>published_example()</code></pre>' });
    await route.fulfill({ response, json: document });
  });
  await page.goto(showcase);
  const first = page.getByRole('article').first();
  const second = page.getByRole('article').nth(1);
  await expect(first.locator('.mb-source-appendix')).toHaveCount(0);
  await expect(page.locator('a[download]')).toHaveCount(0);
  const source = first.locator('.mb-cell details[data-mb-kind="code"]').filter({ hasText: 'saved_result = 42' }).first();
  await expect(source).toHaveJSProperty('open', false);
  const bar = first.locator('.mb-switches-bar[data-ready]');
  await expect(bar).toBeVisible();
  const code = bar.getByRole('switch', { name: 'Code' });
  await expect(code).toHaveAttribute('data-state', 'mixed');
  await expect(code.locator('.mb-switch-count')).toHaveText(/^\d+\/\d+$/);
  expect(await code.locator('.mb-switch-track').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await bar.getByRole('switch', { name: 'Logs' }).locator('.mb-switch-track').evaluate((el) => getComputedStyle(el).backgroundColor));
  await code.click();
  await expect(source).toHaveJSProperty('open', true);
  await expect(code).toHaveAttribute('aria-checked', 'true');
  await expect(second.locator('details[data-mb-kind="code"]').filter({ hasText: 'saved_result = 42' }).first()).toHaveJSProperty('open', false);
  // Expanded differs from the default, so Reset is offered; folding back to the default hides it.
  await expect(bar.getByRole('button', { name: 'Reset view' })).toBeVisible();
  await source.getByRole('button', { name: 'Hide code' }).click();
  await expect(code).toHaveAttribute('data-state', 'mixed');
  await expect(bar.getByRole('button', { name: 'Reset view' })).toHaveCount(0);
  await code.click();
  await expect(source).toHaveJSProperty('open', true);
  await bar.getByRole('button', { name: 'Reset view' }).click();
  await expect(source).toHaveJSProperty('open', false);
  await expect(bar.getByRole('button', { name: 'Reset view' })).toHaveCount(0);
  await source.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  await expect(source.locator('pre')).toBeVisible();
});

test('code blocks are highlighted, copyable, wrappable and capped', async ({ page, context, browserName }) => {
  const source = Array.from({ length: 40 }, (_, n) => 'x_' + n + ' = ' + n).join('\n');
  await page.route(/\/documents\/(showcase|second)\.json$/, async (route) => {
    const response = await route.fetch();
    const document = await response.json();
    document.cells[0].source = source;
    await route.fulfill({ response, json: document });
  });
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(showcase);
  const first = page.getByRole('article').first();
  const disclosure = first.locator('.mb-cell details[data-mb-kind="code"]').filter({ has: page.locator('.mb-codeblock[data-long]') }).first();
  await disclosure.locator(':scope > summary').click();
  const block = disclosure.locator('.mb-codeblock');
  await expect(block).toHaveAttribute('data-enhanced', '');
  await expect(disclosure.locator(':scope > summary')).toBeHidden();
  await expect(block.locator('.mb-codeblock-bar')).toContainText('Python');
  await expect(block.locator('.mb-codeblock-bar')).toContainText('40 lines');
  await expect(block.locator('.mb-hl-number').first()).toBeVisible();
  const lines = block.getByRole('button', { name: 'Lines', exact: true });
  await expect(lines).toHaveAttribute('aria-pressed', 'true');
  await lines.click();
  await expect(lines).toHaveAttribute('aria-pressed', 'false');
  expect(await block.locator('.mb-code-line').first().evaluate((el) => getComputedStyle(el, '::before').content)).toBe('none');
  await lines.click();
  await expect(lines).toHaveAttribute('aria-pressed', 'true');
  expect(await block.locator('code').evaluate((el) => el.textContent)).toBe(source);
  const pre = block.locator('pre');
  const more = block.getByRole('button', { name: 'Show all 40 lines' });
  await expect(more).toBeVisible();
  expect(await pre.evaluate((el) => el.clientHeight < el.scrollHeight)).toBe(true);
  await more.click();
  await expect(block.getByRole('button', { name: 'Show fewer lines' })).toHaveAttribute('aria-expanded', 'true');
  expect(await pre.evaluate((el) => el.clientHeight >= el.scrollHeight - 1)).toBe(true);
  const wrap = block.getByRole('button', { name: 'Wrap lines' });
  await wrap.click();
  await expect(wrap).toHaveAttribute('aria-pressed', 'true');
  await expect(block.locator('.mb-code-line').first()).toHaveCSS('white-space', 'pre-wrap');
  if (browserName === 'chromium') {
    await block.getByRole('button', { name: 'Copy code' }).click();
    await expect(block.locator('.mb-codeblock-copy-label')).toHaveText('Copied');
    await expect(block.locator('[data-copied]')).toHaveCount(1);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(source);
  }
  await block.getByRole('button', { name: 'Hide code' }).click();
  await expect(disclosure).toHaveJSProperty('open', false);
  await expect(disclosure.locator(':scope > summary')).toBeFocused();
});

test('console output shares the code header with Wrap, Copy and Hide', async ({ page, context, browserName }) => {
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(showcase);
  const first = page.getByRole('article').first();
  for (const [kind, title] of [['logs', 'Console output'], ['warnings', 'stderr']] as const) {
    const disclosure = first.locator(`details[data-mb-kind="${kind}"]`).filter({ has: page.locator('.mb-codeblock[data-mb-header]') }).first();
    await disclosure.evaluate((el: HTMLDetailsElement) => { el.open = true; });
    const block = disclosure.locator('.mb-codeblock');
    await expect(block).toHaveAttribute('data-collapsible', '');
    await expect(disclosure.locator(':scope > summary')).toBeHidden();
    await expect(block.locator('.mb-codeblock-lang')).toHaveText(title);
    await expect(block.getByRole('button', { name: 'Lines', exact: true })).toHaveCount(0);
    const wrap = block.getByRole('button', { name: 'Wrap lines' });
    await wrap.click();
    await expect(wrap).toHaveAttribute('aria-pressed', 'true');
    if (browserName === 'chromium') {
      await block.getByRole('button', { name: 'Copy output' }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await block.locator('code').evaluate((el) => el.textContent));
    }
    await block.getByRole('button', { name: 'Hide output' }).click();
    await expect(disclosure).toHaveJSProperty('open', false);
    await expect(disclosure.locator(':scope > summary')).toBeFocused();
  }
});

test('short code blocks start without line numbers and mobile is icon-only', async ({ page }) => {
  const patch = async (source: string) => page.route(/\/documents\/(showcase|second)\.json$/, async (route) => {
    const response = await route.fetch();
    const document = await response.json();
    document.cells[0].source = source;
    await route.fulfill({ response, json: document });
  });
  await patch('a = 1\nb = 2');
  await page.goto(showcase);
  const first = page.getByRole('article').first();
  const open = async () => {
    const disclosure = first.locator('.mb-cell details[data-mb-kind="code"]').first();
    await expect(disclosure.locator('.mb-codeblock[data-enhanced]')).toBeAttached();
    await disclosure.evaluate((el) => { (el as HTMLDetailsElement).open = true; });
    return disclosure.locator('.mb-codeblock');
  };
  await expect((await open()).getByRole('button', { name: 'Lines', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.unroute(/\/documents\/(showcase|second)\.json$/);
  await patch(Array.from({ length: 40 }, (_, n) => 'x_' + n + ' = ' + n).join('\n'));
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto(showcase);
  const block = await open();
  await expect(block.getByRole('button', { name: 'Lines', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect((await block.locator('.mb-codeblock-button-label').first().boundingBox())!.width).toBeLessThanOrEqual(1);
  expect(await block.locator('.mb-codeblock-bar').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});

test('each block toggle changes only its own disclosure', async ({ page }) => {
  await page.goto(showcase);
  const first = page.getByRole('article').first();
  await expect(first.locator('.mb-switches-bar[data-ready]')).toBeVisible();
  const summaries = first.locator('.mb-cells details > summary');
  const count = await summaries.count();
  expect(count).toBeGreaterThan(1);
  const snap = () => first.locator('.mb-cells details').evaluateAll((els) => els.map((el) => (el as HTMLDetailsElement).open));
  for (let index = 0; index < count; index++) {
    const summary = summaries.nth(index);
    if (!(await summary.isVisible())) continue;
    const before = await snap();
    await summary.click();
    const after = await snap();
    expect(after.map((v, j) => (v !== before[j] ? j : -1)).filter((j) => j >= 0)).toEqual([index]);
    await first.locator('.mb-cells details').nth(index).evaluate((el, open) => { (el as HTMLDetailsElement).open = open; }, before[index]!);
  }
});

test('server-rendered Next article preserves prose with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(next);
    await expect(page.getByRole('heading', { name: 'A synthetic showcase' })).toBeVisible();
    await expect(page.getByText('This synthetic document demonstrates saved prose')).toBeVisible();
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await expect(page.getByText('Another saved result.')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('captured table previews rows and searches, sorts, and downloads only exported data', async ({ page }) => {
  const table = { headers: ['Name', 'Score'], rows: [['Ada', 4], ['Bex', 1], ['Cam', 3]], totalRows: 5, download: true };
  const body = JSON.stringify(table);
  const hash = createHash('sha256').update(body).digest('hex');
  const path = `${hash}.json`;
  await page.route(`**/assets/${path}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body }));
  await page.route('**/documents/showcase.json', async (route) => {
    const response = await route.fetch();
    const document = await response.json();
    document.cells[0].outputs.push({ type: 'table', asset: `/assets/${path}`, preview: { ...table, rows: table.rows.slice(0, 2) } });
    document.assets.push({ path, sha256: hash, mime: 'application/json', bytes: Buffer.byteLength(body) });
    await route.fulfill({ response, json: document });
  });
  await page.goto(showcase);
  const tableFigure = page.getByRole('article').first().locator('figure.mb-figure').filter({ has: page.getByRole('columnheader', { name: 'Score', exact: true }) });
  await expect(tableFigure.getByRole('cell', { name: 'Ada' })).toBeVisible();
  await expect(tableFigure).toContainText('Showing 2 exported rows of 5');
  await tableFigure.getByRole('button', { name: 'Search and sort exported rows' }).click();
  await tableFigure.getByRole('searchbox', { name: 'Search exported rows' }).fill('Bex');
  await expect(tableFigure.getByRole('row')).toHaveCount(2); // header and the matching exported row
  await tableFigure.getByRole('searchbox').fill('');
  await tableFigure.getByRole('button', { name: 'Score' }).click();
  await expect(tableFigure.getByRole('row').nth(1)).toContainText('Bex');
  const downloadPromise = page.waitForEvent('download');
  await tableFigure.getByRole('button', { name: 'Download captured rows (CSV)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('exported-rows.csv');
  await expect(tableFigure).toContainText('Showing 3 exported rows of 5');
});

for (const type of ['plotly', 'vega'] as const) {
  test(`${type} renders captured chart marks and retries a failed large-asset fetch`, async ({ page }) => {
    const spec = type === 'plotly'
      ? { data: [{ type: 'scatter', mode: 'markers', x: [1, 2, 3], y: [3, 1, 2] }], layout: { height: 300 }, frames: [{ name: 'next', data: [{ y: [1, 2, 3] }] }] }
      : { $schema: 'https://vega.github.io/schema/vega-lite/v6.json', data: { values: [{ x: 1, y: 3 }, { x: 2, y: 1 }, { x: 3, y: 2 }] }, mark: 'point', encoding: { x: { field: 'x', type: 'quantitative' }, y: { field: 'y', type: 'quantitative' } }, width: 300, height: 200 };
    const body = JSON.stringify(spec);
    const hash = createHash('sha256').update(body).digest('hex');
    const path = `${hash}.json`;
    let gets = 0;
    await page.route(`**/assets/${path}`, async (route) => {
      if (route.request().method() === 'HEAD') {
        await route.fulfill({ status: 200, headers: { 'content-length': String(6 * 1048576) } });
      } else {
        gets++;
        await route.fulfill({ status: gets === 1 ? 503 : 200, contentType: 'application/json', body: gets === 1 ? '{}' : body });
      }
    });
    await page.route('**/documents/showcase.json', async (route) => {
      const response = await route.fetch();
      const document = await response.json();
      document.cells[0].outputs = [{ type, asset: `/assets/${path}`, alt: 'Three saved points' }];
      document.assets.push({ path, sha256: hash, mime: 'application/json', bytes: Buffer.byteLength(body) });
      await route.fulfill({ response, json: document });
    });
    await page.goto(showcase);
    await expect(page.getByRole('button', { name: 'Load interactive figure (6.0 MB)' })).toBeVisible();
    expect(gets).toBe(0);
    await page.getByRole('button', { name: 'Load interactive figure (6.0 MB)' }).click();
    await expect(page.getByText('Interactive figure unavailable.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Retry figure' }).click();
    const chart = page.getByRole('group', { name: 'Three saved points' });
    if (type === 'plotly') {
      await expect(chart.locator('.scatterlayer .point')).toHaveCount(3);
      await expect(chart).toHaveAttribute('aria-busy', 'false');
      await expect.poll(() => chart.evaluate((element) => (element as HTMLElement & { _transitionData?: { _frames?: unknown[] } })._transitionData?._frames?.length)).toBe(1);
    } else {
      await expect(chart.locator('canvas, svg')).toBeVisible();
      await expect(chart.locator('.vega-embed')).toHaveCount(1);
    }
    expect(gets).toBe(2);
    await expect(page.getByRole('button', { name: 'Retry figure' })).toHaveCount(0);
  });
}

for (const allowEval of [false, true]) {
  test(`sandbox generated-code permission is ${allowEval ? 'enabled explicitly' : 'denied by default'} without parent access`, async ({ page }) => {
    const body = `<p id="result">Pending</p><script>let outcome;try{outcome=Function('return 42')()}catch{outcome='blocked'}let isolated;try{void parent.document.body;isolated=false}catch{isolated=true}document.querySelector('#result').textContent=outcome+':isolated='+isolated;</script>`;
    const hash = createHash('sha256').update(body).digest('hex');
    const path = `${hash}.txt`;
    await page.route(`**/assets/${path}`, (route) => route.fulfill({ status: 200, contentType: 'text/plain', body }));
    await page.route('**/documents/showcase.json', async (route) => {
      const response = await route.fetch();
      const document = await response.json();
      document.cells[0].outputs = [{ type: 'sandbox', asset: `/assets/${path}`, caption: 'Reviewed script', scriptUrls: [], allowEval }];
      document.assets.push({ path, sha256: hash, mime: 'text/html', bytes: Buffer.byteLength(body) });
      await route.fulfill({ response, json: document });
    });
    await page.goto(showcase);
    await page.locator('figure').filter({ hasText: 'Reviewed script' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Load embedded output' })).toHaveCount(0);
    await expect(page.frameLocator('iframe').locator('#result')).toHaveText(`${allowEval ? '42' : 'blocked'}:isolated=true`);
    await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
    const csp = await page.frameLocator('iframe').locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("worker-src 'none'");
    expect(csp).toContain("frame-src 'none'");
  });
}

test('library-owned UI has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto(showcase);
  await expect(page.getByRole('article')).toHaveCount(2);
  const results = await new AxeBuilder({ page }).include('.marimo-blog').analyze();
  const serious = results.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious');
  expect(serious.map((item) => `${item.id}: ${item.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([]);
});
