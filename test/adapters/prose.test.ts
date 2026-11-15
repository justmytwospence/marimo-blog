import { describe, expect, it } from 'vitest';
import { compileHtml, normalizeMarimoMarkup } from '../../src/node/html.js';

const context = () => ({ cellId: 'prose', title: 'Article', toc: [], usedIds: new Set<string>(), consumedTitle: false });

describe('marimo prose normalization', () => {
  it('converts only exporter wrappers, preserving inline spans and structure', () => {
    const html = '<span class="markdown prose"><span class="paragraph">First <span>inline</span>.</span><span class="paragraph">Second</span><ul><li>Item</li></ul><h2 id="section">Heading</h2></span>';
    const normalized = normalizeMarimoMarkup(html);
    expect(normalizeMarimoMarkup(normalized)).toBe(normalized);
    const result = compileHtml(html, context());
    expect(result.html).toContain('<p>First <span>inline</span>.</p><p>Second</p>');
    expect(result.html).toContain('<ul><li>Item</li></ul>');
    expect(result.html).toContain('<h2 id="section">Heading</h2>');
  });

  it('continues to sanitize scripts and event handlers after normalization', () => {
    const result = compileHtml('<span class="markdown"><span class="paragraph" onclick="alert(1)">Safe<script>alert(1)</script></span></span>', context());
    expect(result.html).toContain('<p>Safe</p>');
    expect(result.html).not.toMatch(/script|onclick/);
  });
});
