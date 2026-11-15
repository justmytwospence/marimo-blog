import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import r from 'highlight.js/lib/languages/r';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';

// A private instance with a package prefix keeps host .hljs-* rules out of the article.
const engine = hljs.newInstance();
engine.configure({ classPrefix: 'mb-hl-' });
for (const [name, definition] of Object.entries({ python, sql, bash, json, yaml, javascript, typescript, r, markdown, plaintext })) engine.registerLanguage(name, definition);

export interface CodeLanguage { id: string; label: string; highlight: boolean }
export const LONG_CODE_LINES = 25;

const labels: Record<string, string> = { python: 'Python', sql: 'SQL', bash: 'Shell', json: 'JSON', yaml: 'YAML', javascript: 'JavaScript', typescript: 'TypeScript', r: 'R', markdown: 'Markdown', plaintext: 'Text' };
const aliases: Record<string, string> = { py: 'python', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', yml: 'yaml', js: 'javascript', ts: 'typescript', md: 'markdown', text: 'plaintext', txt: 'plaintext', plain: 'plaintext' };

export function resolveLanguage(input: string | undefined, fallback: 'python' | 'plaintext'): CodeLanguage {
  const raw = (input ?? '').trim();
  const key = raw.toLowerCase();
  const id = key ? aliases[key] ?? key : fallback;
  if (id in labels) return { id, label: labels[id]!, highlight: id !== 'plaintext' };
  return { id: 'plaintext', label: raw.slice(0, 20), highlight: false };
}

export const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** One balanced HTML fragment per source line; spans that cross a newline are closed and reopened. */
export function highlightLines(code: string, language: CodeLanguage): string[] {
  const source = code.endsWith('\n') ? code.slice(0, -1) : code;
  const html = language.highlight ? engine.highlight(source, { language: language.id, ignoreIllegals: true }).value : escapeHtml(source);
  const lines: string[] = [];
  const stack: string[] = [];
  let current = '';
  for (const part of html.split(/(<span class="[^"]*">|<\/span>|\n)/)) {
    if (part === '') continue;
    if (part === '\n') {
      lines.push(current + '</span>'.repeat(stack.length));
      current = stack.join('');
    } else {
      if (part === '</span>') stack.pop();
      else if (part.startsWith('<span')) stack.push(part);
      current += part;
    }
  }
  lines.push(current + '</span>'.repeat(stack.length));
  return lines;
}

export const NUMBERED_CODE_LINES = 15;

export function lineLabel(code: string): string {
  const count = highlightLines(code, { id: 'plaintext', label: '', highlight: false }).length;
  return count === 1 ? '1 line' : `${count} lines`;
}

const icon = (name: string) => `<span class="mb-icon mb-icon-${name}" aria-hidden="true"></span>`;

export interface CodeBlockOptions {
  /** Header text; defaults to the language label. */
  title?: string;
  /** What the block holds, for screen-reader button names ("code", "output"). */
  noun?: string;
  /** Offer line numbers (default true). Without them numbers stay off. */
  lines?: boolean;
  /** Show the warning dot before the title. */
  dot?: boolean;
  /** The bar replaces the surrounding disclosure's summary once enhanced. */
  header?: boolean;
}

export function codeBlockHtml(code: string, language: CodeLanguage, options: CodeBlockOptions = {}): string {
  const { title = language.label, noun = 'code', lines: numbered = true, dot = false, header = false } = options;
  const lines = highlightLines(code, language);
  const count = lines.length;
  const long = count > LONG_CODE_LINES;
  const gutter = Math.max(2, String(count).length);
  const button = (action: string, label: string, extra = '', suffix = '', attrs = '') =>
    `<button type="button" class="mb-codeblock-button" data-mb-code-action="${action}"${attrs}>${icon(action === 'collapse' ? 'hide' : action)}<span class="mb-codeblock-button-label${extra}">${label}</span>${suffix}</button>`;
  return `<div class="mb-codeblock" data-mb-codeblock="" data-lines="${count}" data-numbers="${numbered ? 'auto' : 'off'}" data-numbers-default="${numbered && count >= NUMBERED_CODE_LINES ? 'on' : 'off'}"${long ? ' data-long=""' : ''}${header ? ' data-mb-header=""' : ''} style="--mb-gutter:${gutter}ch">` +
    `<div class="mb-codeblock-bar"><span class="mb-codeblock-title" data-mb-code-action="collapse"><span class="mb-codeblock-chevron" aria-hidden="true"></span>${dot ? '<span class="mb-disclosure-dot" aria-hidden="true"></span>' : ''}<span class="mb-codeblock-lang">${escapeHtml(title)}</span><span class="mb-codeblock-meta">${count === 1 ? '1 line' : count + ' lines'}</span></span>` +
    '<span class="mb-codeblock-tools" hidden="">' +
    (numbered ? button('lines', 'Lines', '', '', ' aria-pressed="false"') : '') +
    button('wrap', 'Wrap', '', '<span class="mb-sr-only"> lines</span>', ' aria-pressed="false"') +
    button('copy', 'Copy', ' mb-codeblock-copy-label', `<span class="mb-sr-only"> ${escapeHtml(noun)}</span>`) +
    button('collapse', 'Hide', '', `<span class="mb-sr-only"> ${escapeHtml(noun)}</span>`, ' hidden=""') +
    '</span><span class="mb-sr-only" role="status" aria-live="polite"></span></div>' +
    '<pre class="mb-codeblock-pre" tabindex="0"><code class="mb-codeblock-code">' +
    lines.map((line) => `<span class="mb-code-line">${line}</span>`).join('\n') + '</code></pre>' +
    (long ? `<button type="button" class="mb-codeblock-more" data-mb-code-action="expand" aria-expanded="false" hidden="">Show all ${count} lines</button>` : '') + '</div>';
}
