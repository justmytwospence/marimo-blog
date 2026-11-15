import { expect, test } from '@playwright/test';

const host = process.env.MARIMO_BLOG_HOST_URL;

test.describe('optional real blog host', () => {
  test.skip(!host, 'Set MARIMO_BLOG_HOST_URL to an already-running, locally verified blog build.');

  for (const width of [390, 768, 1440]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`K-Core editorial host at ${width}px in ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: theme });
        await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
        await page.goto(new URL('/blog/kcore', host!).href);
        const article = page.locator('article.blog-marimo');
        await expect(article).toBeVisible();
        await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
        expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
        await expect(article.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(article.locator('.blog-marimo-header')).toHaveCount(1);
        expect(await article.locator('.mb-cell details[data-mb-kind="code"]').count()).toBeGreaterThan(0);
        // Host resets must not strip the renderer's own output padding and background.
        const log = article.locator('details[data-mb-kind="logs"] .mb-codeblock-code').first();
        if (await log.count()) {
          const style = await log.evaluate((el) => { const s = getComputedStyle(el); return { pad: parseFloat(s.paddingLeft), bg: s.backgroundColor }; });
          expect(style.pad).toBeGreaterThan(8);
        }
        await expect(article.locator('details.mb-source-appendix')).toHaveCount(0);
        await expect(article.locator('span.paragraph, span.markdown')).toHaveCount(0);
        expect(await article.locator('.mb-prose p').count()).toBeGreaterThan(10);
        const paragraph = article.locator('.mb-prose p').first();
        const metrics = await paragraph.evaluate((element) => {
          const style = getComputedStyle(element);
          return { display: style.display, size: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight), margin: parseFloat(style.marginBottom), font: style.fontFamily, width: element.getBoundingClientRect().width };
        });
        expect(metrics.display).toBe('block');
        expect(metrics.font.toLowerCase()).toContain('merriweather');
        expect(metrics.size).toBeGreaterThanOrEqual(17);
        expect(metrics.lineHeight / metrics.size).toBeGreaterThanOrEqual(1.8);
        expect(metrics.margin).toBeGreaterThanOrEqual(metrics.size);
        expect(metrics.width).toBeLessThanOrEqual(42 * 16 + 1);
        expect((await article.locator('h1').evaluate((element) => getComputedStyle(element).fontFamily)).toLowerCase()).toContain('inter');
        await expect(article).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(article).toHaveCSS('color', theme === 'dark' ? 'rgb(212, 212, 212)' : 'rgb(31, 41, 55)');
        const contents = article.getByRole('navigation', { name: 'Table of contents' });
        await expect(contents).toHaveCount(1);
        const wide = (await article.boundingBox())!.width >= 1088;
        await expect(contents.locator('details')).toHaveJSProperty('open', wide);
        if (wide) {
          await expect(contents).toHaveCSS('position', 'sticky');
          await expect(contents).toHaveCSS('top', '112px');
        }
        const main = article.locator('.mb-cells');
        const before = (await main.boundingBox())!.width;
        if (!wide) await contents.locator('summary').click();
        await contents.locator('summary').click();
        await expect(contents.getByRole('link').first()).toBeHidden();
        if (wide) expect((await main.boundingBox())!.width).toBeGreaterThan(before + 100);
        await expect(page.locator('a[download]')).toHaveCount(0);
        const bar = article.locator('.mb-switches-bar[data-ready]');
        await expect(bar).toBeVisible();
        const results = bar.getByRole('switch', { name: 'Results' });
        if (await results.count()) {
          await results.click();
          await expect(results).toHaveAttribute('aria-checked', 'false');
          await expect(article.getByRole('heading', { level: 1 })).toBeVisible();
          await expect(paragraph).toBeVisible();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
      });
    }
  }

  test('K-Core source and contents remain accessible without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto(new URL('/blog/kcore', host!).href);
      const article = page.locator('article.blog-marimo');
      const contents = article.getByRole('navigation', { name: 'Table of contents' });
      await expect(contents.locator('details')).not.toHaveAttribute('open');
      await contents.locator('summary').click();
      const link = contents.getByRole('link').first();
      const href = await link.getAttribute('href');
      await link.click();
      expect(new URL(page.url()).hash).toBe(href);
      await expect(article.locator('details.mb-source-appendix')).toHaveCount(0);
      await expect(article.locator('details[data-mb-kind="results"]')).toHaveCount(3);
      expect(await article.locator('.mb-cell .mb-codeblock .mb-hl-keyword').count()).toBeGreaterThan(0);
      const summaries = article.locator('.mb-cells details > summary');
      const total = Math.min(await summaries.count(), 8);
      const snap = () => article.locator('.mb-cells details').evaluateAll((els) => els.map((el) => (el as HTMLDetailsElement).open));
      for (let index = 0; index < total; index++) {
        if (!(await summaries.nth(index).isVisible())) continue;
        const before = await snap();
        await summaries.nth(index).click();
        const after = await snap();
        expect(after.map((v, j) => (v !== before[j] ? j : -1)).filter((j) => j >= 0)).toEqual([index]);
        await article.locator('.mb-cells details').nth(index).evaluate((el, open) => { (el as HTMLDetailsElement).open = open; }, before[index]!);
      }
      const cell = article.locator('.mb-cell details[data-mb-kind="code"]').first();
      await cell.locator('summary').click();
      await expect(cell.locator('pre')).toBeVisible();
      expect((await cell.locator('pre').textContent())?.trim().length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });
});
