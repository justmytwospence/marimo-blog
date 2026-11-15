import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HtmlOutput, countHtmlCodeBlocks } from '../src/react/HtmlOutput.js';

describe('published code examples', () => {
  it('folds block code only, preserving inline code and surrounding prose', () => {
    const html = renderToStaticMarkup(<HtmlOutput html='<p>Use <code>x</code> here.</p><pre><code>print(1)</code></pre>' codeBlocks="collapsed" />);
    expect(html).toContain('<p>Use <code>x</code> here.</p>');
    expect(html.match(/<details /g)).toHaveLength(1);
    expect(html).toMatch(/<details class="mb-disclosure mb-code-details mb-code-example" data-mb-disclosure="" data-mb-kind="code" data-mb-default-open="false"><summary[^>]*><span class="mb-disclosure-label">Python<span class="mb-sr-only"> code example<\/span><\/span><span class="mb-disclosure-preview">1 line<\/span><\/summary>/);
    expect(html).not.toContain('>Code example<');
    expect(html).toContain('<span class="mb-codeblock-lang">Python</span>');
    expect(html).toContain('<span class="mb-hl-built_in">print</span>');
  });

  it('reads the language class and falls back to text outside folding contexts', () => {
    const sql = renderToStaticMarkup(<HtmlOutput html='<pre><code class="language-sql">select 1</code></pre>' />);
    expect(sql).toContain('>SQL<');
    expect(sql).toContain('mb-hl-keyword');
    const plain = renderToStaticMarkup(<HtmlOutput html='<pre>a</pre>' foldCodeBlocks={false} />);
    expect(plain).toContain('>Text<');
    expect(plain).not.toContain('mb-hl-');
    expect(plain).not.toContain('<details');
  });

  it('opens examples by default and does not double-wrap authored details', () => {
    const source = '<pre>a</pre><details><summary>Mine</summary><pre>b</pre></details>';
    expect(countHtmlCodeBlocks(source)).toBe(1);
    const html = renderToStaticMarkup(<HtmlOutput html={source} />);
    expect(html.match(/data-mb-kind="code"/g)).toHaveLength(1);
    expect(html).toContain('data-mb-default-open="true" open=""');
  });

  it('still strips unsafe markup and author-supplied package classes', () => {
    const html = renderToStaticMarkup(<HtmlOutput html='<pre class="mb-disclosure" onclick="x()">a</pre><script>alert(1)</script>' />);
    expect(html).not.toMatch(/onclick|<script/);
    expect(html).not.toContain('<pre class="mb-disclosure"');
  });
});
