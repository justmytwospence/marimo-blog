import { describe, expect, it } from 'vitest';
import { codeBlockHtml, highlightLines, lineLabel, resolveLanguage } from '../src/react/code.js';
import { sanitizeOutput } from '../src/node/sanitize.js';

const sample = '@decorator\ndef f(x: int) -> str:\n    """doc\n    string"""\n    return f"{x!r}" + 1  # c\n<script>';
const count = (value: string, needle: string) => value.split(needle).length - 1;

describe('code blocks', () => {
  it('resolves languages and aliases', () => {
    expect(resolveLanguage('py', 'plaintext')).toMatchObject({ id: 'python', label: 'Python', highlight: true });
    expect(resolveLanguage('sh', 'python').id).toBe('bash');
    expect(resolveLanguage('yml', 'python').id).toBe('yaml');
    expect(resolveLanguage('Brainfuck', 'python')).toEqual({ id: 'plaintext', label: 'Brainfuck', highlight: false });
    expect(resolveLanguage('', 'python').id).toBe('python');
    expect(resolveLanguage(undefined, 'plaintext')).toMatchObject({ id: 'plaintext', label: 'Text', highlight: false });
  });

  it('splits highlighted code into balanced lines and escapes markup', () => {
    const lines = highlightLines(sample, resolveLanguage('python', 'python'));
    expect(lines).toHaveLength(6);
    for (const line of lines) expect(count(line, '<span')).toBe(count(line, '</span>'));
    expect(lines[2]).toContain('mb-hl-string');
    expect(lines[3]).toContain('mb-hl-string');
    expect(lines.join('')).not.toContain('<script>');
    expect(highlightLines('<b>x</b>', resolveLanguage('text', 'python'))).toEqual(['&lt;b&gt;x&lt;/b&gt;']);
    expect(highlightLines('', resolveLanguage('python', 'python'))).toEqual(['']);
  });

  it('marks long blocks and keeps controls hidden until enhanced', () => {
    const long = codeBlockHtml(Array.from({ length: 30 }, (_, n) => 'x = ' + n).join('\n'), resolveLanguage('python', 'python'));
    expect(count(long, 'class="mb-code-line"')).toBe(30);
    expect(long).toContain('data-long=""');
    expect(long).toContain('Show all 30 lines');
    expect(long).toContain('--mb-gutter:2ch');
    expect(long).toContain('class="mb-codeblock-tools" hidden=""');
    const short = codeBlockHtml('x = 1', resolveLanguage('python', 'python'));
    expect(short).not.toContain('data-long');
    expect(short).not.toContain('mb-codeblock-more');
  });

  it('builds the shared header with four buttons and numbering defaults', () => {
    const short = codeBlockHtml('a\nb\nc', resolveLanguage('python', 'python'));
    expect(short).toContain('data-numbers="auto" data-numbers-default="off"');
    expect(count(short, 'class="mb-codeblock-button"')).toBe(4);
    expect(short).toContain('data-mb-code-action="collapse" hidden=""');
    expect(short).toContain('<span class="mb-codeblock-meta">3 lines</span>');
    expect(short).not.toContain('<svg');
    expect(codeBlockHtml(Array.from({ length: 30 }, () => 'x').join('\n'), resolveLanguage('python', 'python'))).toContain('data-numbers-default="on"');
  });

  it('builds a transcript header with Wrap and Copy but no line numbers', () => {
    const html = codeBlockHtml(Array.from({ length: 20 }, (_, n) => `row ${n}`).join('\n'), resolveLanguage('plaintext', 'plaintext'), { title: 'stderr', noun: 'output', lines: false, dot: true, header: true });
    expect(html).toContain('data-numbers="off" data-numbers-default="off"');
    expect(html).toContain('data-mb-header=""');
    expect(html).toContain('<span class="mb-disclosure-dot" aria-hidden="true"></span><span class="mb-codeblock-lang">stderr</span>');
    expect(html).not.toContain('data-mb-code-action="lines"');
    expect(count(html, 'class="mb-codeblock-button"')).toBe(3);
    expect(html).toContain('<span class="mb-sr-only"> output</span>');
  });

  it('labels line counts', () => {
    expect(lineLabel('a')).toBe('1 line');
    expect(lineLabel('a\nb\n')).toBe('2 lines');
  });

  it('keeps only language classes from the author', () => {
    const html = sanitizeOutput('<pre><code class="language-sql x">s</code></pre>');
    expect(html).toContain('language-sql');
    expect(html).not.toContain(' x');
  });
});
