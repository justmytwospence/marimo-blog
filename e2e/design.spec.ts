import { createHash } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { MarimoDocument } from '../src/types.js';

const showcase = 'http://127.0.0.1:4173/';
const next = 'http://127.0.0.1:4174/';
const source = 'editorial_result = 42';
const prose = 'A readable article gives each idea room to breathe. The saved scientific result belongs to the author, while the surrounding page supplies a comfortable reading measure, semantic paragraphs and a clear path through the argument.';

// Content-addressed route fixtures exercise real renderer geometry and chart loading,
// without introducing unchecked assets or depending on a particular example's prose.
async function editorialFixture(page: Page) {
  const body = JSON.stringify({
    data: [{ type: 'scatter', mode: 'markers', x: [1, 2, 3], y: [3, 1, 2] }],
    layout: { width: 760, height: 320, paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff' },
  });
  const hash = createHash('sha256').update(body).digest('hex');
  const path = `${hash}.json`;
  await page.route(`**/assets/${path}`, (route) => route.fulfill(route.request().method() === 'HEAD'
    ? { status: 200, headers: { 'content-length': String(6 * 1048576) } }
    : { status: 200, contentType: 'application/json', body }));
  await page.route('**/documents/showcase.json', async (route) => {
    const response = await route.fetch();
    const document: MarimoDocument = await response.json();
    document.cells = [{
      id: 'editorial', ordinal: 0, name: '_', source, sourceLanguage: 'python', hideCode: false,
      disabled: false, code: 'folded', console: 'collapsed', consoleOutputs: [],
      outputs: [
        { type: 'html', html: `<h2 id="reading-measure">Reading measure</h2><p>${prose} <a href="#following-the-evidence" rel="noopener noreferrer">Continue reading</a></p><p>${prose}</p><p>${prose}</p>` },
        { type: 'plotly', asset: `/assets/${path}`, alt: 'Editorial saved points', caption: 'An author-owned white scientific canvas.' },
        { type: 'html', html: `<h2 id="following-the-evidence">Following the evidence</h2><p>${prose}</p><h3 id="a-closer-look">A closer look</h3><p>${prose}</p>` },
      ],
    }];
    document.toc = [
      { id: 'reading-measure', title: 'Reading measure', level: 2 },
      { id: 'following-the-evidence', title: 'Following the evidence', level: 2 },
      { id: 'a-closer-look', title: 'A closer look', level: 3 },
    ];
    document.assets.push({ path, sha256: hash, mime: 'application/json', bytes: Buffer.byteLength(body) });
    await route.fulfill({ response, json: document });
  });
}

async function box(locator: Locator) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  return bounds!;
}

async function noDocumentOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
}

for (const width of [390, 768, 1440]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${width}px ${theme}: editorial measure, figure band and native contents`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await editorialFixture(page);
      await page.goto(showcase);
      if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark' }).click();
      await page.getByRole('button', { name: 'Use wide container' }).click();
      const article = page.getByRole('article').first();
      await expect(article.locator('#reading-measure')).toBeVisible();
      await expect(article).toHaveAttribute('data-theme', theme);
      // Playwright contexts start at normal browser zoom. Do not compensate with CSS zoom.
      expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
      const rootSize = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
      const main = await box(article.locator('.mb-cells'));
      const paragraph = article.locator('.mb-prose p').first();
      const reading = await box(paragraph);
      expect(reading.width).toBeLessThanOrEqual(42 * rootSize + 1);
      expect(Math.abs(reading.x + reading.width / 2 - (main.x + main.width / 2))).toBeLessThanOrEqual(2);
      for (const selector of ['.mb-article-header', '.mb-article-tools']) {
        const aligned = await box(article.locator(selector));
        expect(aligned.width).toBeLessThanOrEqual(42 * rootSize + 1);
        expect(Math.abs(aligned.x + aligned.width / 2 - (main.x + main.width / 2))).toBeLessThanOrEqual(2);
      }
      const typography = await paragraph.evaluate((element) => {
        const style = getComputedStyle(element);
        return { display: style.display, size: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight), margin: parseFloat(style.marginBottom) };
      });
      expect(typography.display).toBe('block');
      expect(typography.size).toBeGreaterThanOrEqual(17);
      expect(typography.lineHeight / typography.size).toBeGreaterThanOrEqual(1.8);
      expect(typography.margin).toBeGreaterThanOrEqual(typography.size);
      const secondParagraph = await box(article.locator('.mb-prose p').nth(1));
      expect(secondParagraph.y - reading.y - reading.height).toBeGreaterThanOrEqual(typography.size);
      const figure = article.locator('figure.mb-figure').first();
      const figureBox = await box(figure);
      expect(Math.abs(figureBox.x - main.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(figureBox.width - main.width)).toBeLessThanOrEqual(2);
      if (width === 1440) expect(figureBox.width).toBeGreaterThan(reading.width + 40);
      const caption = figure.locator('figcaption');
      expect(await caption.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
      await expect(article.locator('.mb-cell details[data-mb-kind="code"]')).toHaveCount(1);
      await expect(article.locator('.mb-source-appendix')).toHaveCount(0);
      const contents = article.getByRole('navigation', { name: 'Table of contents' });
      await expect(contents).toHaveCount(1);
      const details = contents.locator('details');
      await expect(details).toHaveJSProperty('open', width === 1440);
      const summary = details.locator('summary');
      await expect(summary).toContainText('On this page');
      if (width === 1440) {
        await expect(contents).toHaveCSS('position', 'sticky');
        await summary.click();
        await expect(details).toHaveJSProperty('open', false);
        await expect(contents.getByRole('link', { name: 'Reading measure' })).toBeHidden();
        expect((await box(article.locator('.mb-cells'))).width).toBeGreaterThan(main.width + 100);
      }
      if (!(await details.evaluate((element: HTMLDetailsElement) => element.open))) await summary.click();
      await expect(contents.getByRole('link', { name: 'Reading measure' })).toBeVisible();
      await noDocumentOverflow(page);
    });
  }
}

test('the contents rail follows article container width, not the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await editorialFixture(page);
  await page.goto(showcase);
  const article = page.getByRole('article').first();
  const contents = article.getByRole('navigation', { name: 'Table of contents' });
  const main = article.locator('.mb-cells');
  await expect(article.locator('#reading-measure')).toBeVisible();
  expect((await box(article)).width).toBeLessThan(1088);
  expect((await box(contents)).y + (await box(contents)).height).toBeLessThanOrEqual((await box(main)).y + 2);
  await page.getByRole('button', { name: 'Use wide container' }).click();
  expect((await box(article)).width).toBeGreaterThanOrEqual(1088);
  await expect(contents).toHaveCSS('position', 'sticky');
  expect((await box(contents)).x).toBeGreaterThan((await box(main)).x + (await box(main)).width);
  await expect(contents).toHaveCount(1);
  const rail = contents.locator('.mb-switches');
  await expect(rail).toBeVisible();
  expect((await box(rail)).width).toBeLessThanOrEqual(12 * 16 + 1);
  const railBox = await box(rail);
  expect(railBox.y + railBox.height).toBeLessThanOrEqual((await box(contents.locator('summary'))).y + 1);
  const ys = await rail.getByRole('switch').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().y)));
  expect(new Set(ys).size).toBe(ys.length);
  await expect(article.locator('.mb-switches-bar')).toBeVisible();
  await expect(page.locator('.mb-view, a[download]')).toHaveCount(0);
  await noDocumentOverflow(page);
});

test('closed disclosures render as bordered cards', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await editorialFixture(page);
  await page.goto(showcase);
  const article = page.getByRole('article').first();
  const bar = article.locator('.mb-switches-bar[data-ready]');
  const results = bar.getByRole('switch', { name: 'Results' });
  if (await results.getAttribute('aria-checked') === 'true') await results.click();
  const summary = article.locator('details[data-mb-kind="results"] > summary').first();
  const card = () => summary.evaluate((el) => ({ border: getComputedStyle(el).borderTopColor, after: getComputedStyle(el, '::after').content, width: el.getBoundingClientRect().width }));
  const closed = await card();
  expect(closed.border).not.toBe('rgba(0, 0, 0, 0)');
  expect(closed.after).toContain('Show');
  const prose = await box(article.locator('.mb-prose p').first());
  expect(closed.width).toBeLessThanOrEqual(prose.width + 2);
  await summary.click();
  const open = await card();
  expect(open.after).toContain('Hide');
  // Open, the summary is the header row of a card framed by its details element.
  const details = article.locator('details[data-mb-kind="results"]').first();
  await expect(summary).toHaveCSS('border-top-width', '0px');
  expect(await summary.evaluate((el) => getComputedStyle(el).borderBottomWidth)).toBe('1px');
  expect(await details.evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe('rgba(0, 0, 0, 0)');
});

test('rail switches are hidden on narrow containers', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await editorialFixture(page);
  await page.goto(showcase);
  const article = page.getByRole('article').first();
  await expect(article.locator('.mb-switches-bar')).toBeVisible();
  await expect(article.locator('.mb-toc .mb-switches')).toBeHidden();
});

test('a loaded wide chart scrolls inside its figure without recoloring the author canvas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await editorialFixture(page);
  await page.goto(showcase);
  await page.getByRole('button', { name: 'Switch to dark' }).click();
  const article = page.getByRole('article').first();
  await article.locator('figure').first().scrollIntoViewIfNeeded();
  await article.getByRole('button', { name: 'Load interactive figure (6.0 MB)' }).click();
  const chart = article.getByRole('group', { name: 'Editorial saved points' });
  await expect(chart.locator('.scatterlayer .point')).toHaveCount(3);
  await expect(chart).toHaveAttribute('aria-busy', 'false');
  const viewport = await chart.evaluate((element) => {
    let parent = element.parentElement;
    while (parent && parent.tagName !== 'ARTICLE') {
      const style = getComputedStyle(parent);
      if (['auto', 'scroll'].includes(style.overflowX) && parent.scrollWidth > parent.clientWidth) {
        parent.scrollLeft = 100;
        return { width: parent.clientWidth, content: parent.scrollWidth, left: parent.scrollLeft };
      }
      parent = parent.parentElement;
    }
    return null;
  });
  expect(viewport).not.toBeNull();
  expect(viewport!.content).toBeGreaterThanOrEqual(640);
  expect(viewport!.width).toBeLessThan(390);
  expect(viewport!.left).toBeGreaterThan(0);
  await expect(chart.locator('.main-svg').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expect(await chart.evaluate((element) => getComputedStyle(element).filter)).toBe('none');
  await noDocumentOverflow(page);
});

test('ancestor public inputs survive both explicit themes and system preferences', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await editorialFixture(page);
  await page.goto(showcase);
  const article = page.getByRole('article').first();
  await expect(article.locator('.mb-cell details[data-mb-kind="code"]').first()).toBeAttached();
  await page.getByRole('button', { name: 'Use wide container' }).click();
  await page.addStyleTag({ content: `.showcase {
    --mb-text: #123456; --mb-muted: #526374; --mb-accent: #246810;
    --mb-border: #765432; --mb-surface: #f1e2d3; --mb-code-bg: #e3e4e5;
    --mb-font-body: Georgia, serif; --mb-font-heading: Arial, sans-serif;
    --mb-font-ui: Verdana, sans-serif; --mb-font-code: Courier, monospace;
    --mb-body-size: 20px; --mb-line-height: 2; --mb-prose-width: 36rem; --mb-max-width: 74rem;
    --mb-toc-offset: 112px; --mb-radius: 13px; --mb-figure-bg: #ffffff; --mb-syntax-number: #123456;
  }` });
  const keyword = article.locator('.mb-cell details[data-mb-kind="code"] .mb-hl-number').first();
  await keyword.evaluate((element) => { (element.closest('details') as HTMLDetailsElement).open = true; });
  await expect(keyword).toHaveCSS('color', 'rgb(18, 52, 86)');
  await keyword.evaluate((element) => { (element.closest('details') as HTMLDetailsElement).open = false; });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme === 'light' ? 'dark' : 'light' });
    await article.evaluate((element, value) => element.setAttribute('data-theme', value), theme);
    await expect(article).toHaveCSS('color', 'rgb(18, 52, 86)');
    await expect(article).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const paragraph = article.locator('.mb-prose p').first();
    await expect(paragraph).toHaveCSS('font-size', '20px');
    await expect(paragraph).toHaveCSS('line-height', '40px');
    expect(Math.abs((await box(paragraph)).width - 36 * 16)).toBeLessThanOrEqual(1);
    expect(Math.abs((await box(article)).width - 74 * 16)).toBeLessThanOrEqual(1);
    await expect(article.getByRole('navigation')).toHaveCSS('top', '112px');
    expect(await paragraph.evaluate((element) => getComputedStyle(element).fontFamily)).toContain('Georgia');
    expect(await article.locator('h1').evaluate((element) => getComputedStyle(element).fontFamily)).toContain('Arial');
    await expect(article.locator('.mb-meta')).toHaveCSS('color', 'rgb(82, 99, 116)');
    await expect(article.getByRole('link', { name: 'Continue reading' })).toHaveCSS('color', 'rgb(36, 104, 16)');
    const summary = article.locator('.mb-cell details[data-mb-kind="code"] > summary').first();
    expect(await summary.evaluate((element) => getComputedStyle(element).fontFamily)).toContain('Verdana');
    await summary.click();
    const pre = article.locator('.mb-cell details[data-mb-kind="code"] pre').first();
    expect(await pre.evaluate((element) => getComputedStyle(element).fontFamily)).toContain('Courier');
    await expect(article.locator('.mb-cell details[data-mb-kind="code"] .mb-codeblock').first()).toHaveCSS('background-color', 'rgb(227, 228, 229)');
    const card = article.locator('details.mb-disclosure-result[open]').filter({ has: page.locator('figure') }).first();
    await expect(card).toHaveCSS('border-top-color', 'rgb(118, 84, 50)');
    await expect(card).toHaveCSS('border-top-left-radius', '8px');
    await expect(card.locator('figure')).toHaveCSS('border-top-width', '0px');
    await expect(article.locator('.mb-figure-viewport').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await article.locator('.mb-cell details[data-mb-kind="code"]').first().getByRole('button', { name: 'Hide code' }).click();
  }
  await page.addStyleTag({ content: '.showcase { --mb-bg: #f0e0d0; }' });
  await expect(article).toHaveCSS('background-color', 'rgb(240, 224, 208)');
});

test('explicit themes beat host and system; auto honors dark and light ancestors', async ({ page }) => {
  await page.goto(showcase);
  const article = page.getByRole('article').first();
  await expect(article).toBeVisible();
  // Remove the showcase recipe only for this palette-default test, not the renderer CSS.
  await page.addStyleTag({ content: '.showcase { --mb-text: initial; }' });
  const color = () => article.evaluate((element) => getComputedStyle(element).color);
  const setTheme = (value: string) => article.evaluate((element, theme) => element.setAttribute('data-theme', theme), value);
  const hostClass = (value: string) => page.locator('.showcase').evaluate((element, name) => { element.classList.remove('light', 'dark'); if (name) element.classList.add(name); }, value);
  await page.emulateMedia({ colorScheme: 'light' });
  await hostClass('');
  await setTheme('light');
  const light = await color();
  await setTheme('dark');
  const dark = await color();
  expect(dark).not.toBe(light);
  for (const system of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: system });
    await hostClass('dark');
    await setTheme('light');
    expect(await color()).toBe(light);
    await hostClass('light');
    await setTheme('dark');
    expect(await color()).toBe(dark);
    await setTheme('auto');
    expect(await color()).toBe(light);
    await hostClass('dark');
    expect(await color()).toBe(dark);
    await hostClass('');
    expect(await color()).toBe(system === 'dark' ? dark : light);
  }
});

for (const width of [390, 1440]) {
  test(`SSR native contents and source work without JavaScript at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto(next);
      const article = page.getByRole('article');
      await expect(article.getByRole('heading', { level: 1 })).toHaveCount(1);
      const contents = article.getByRole('navigation', { name: 'Table of contents' });
      await expect(contents.locator('details')).not.toHaveAttribute('open');
      await contents.locator('summary').focus();
      await page.keyboard.press('Enter');
      const link = contents.getByRole('link').first();
      const href = await link.getAttribute('href');
      await link.click();
      expect(new URL(page.url()).hash).toBe(href);
      await expect(article.locator('.mb-source-appendix')).toHaveCount(0);
      const cellSource = article.locator('.mb-cell details[data-mb-kind="code"]').first();
      await expect(cellSource).not.toHaveAttribute('open');
      await cellSource.locator(':scope > summary').click();
      await expect(cellSource.locator('pre')).toBeVisible();
      expect((await cellSource.locator('pre').textContent())?.trim().length).toBeGreaterThan(0);
      await cellSource.locator(':scope > summary').click();
      await expect(cellSource.locator('pre')).toBeHidden();
      await noDocumentOverflow(page);
    } finally {
      await context.close();
    }
  });
}
