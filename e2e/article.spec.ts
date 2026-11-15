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
  await first.getByRole('link', { name: 'Introduction' }).click();
  await expect(page).toHaveURL(/#introduction$/);
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
  const tableFigure = page.getByRole('article').first().locator('figure.mb-figure').filter({ has: page.getByRole('table') });
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
    await expect(page.locator('iframe')).toHaveCount(0);
    await page.getByRole('button', { name: 'Load embedded output' }).click();
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
