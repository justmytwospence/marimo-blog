import { useId } from 'react';
import { parseFragment, serialize, type DefaultTreeAdapterTypes } from 'parse5';
import { safeHtml } from './safety.js';
import { codeBlockHtml, escapeHtml, lineLabel, resolveLanguage } from './code.js';

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;
function isElement(node: Node): node is Element { return 'tagName' in node; }
const textOf = (node: Node): string => 'value' in node && node.nodeName === '#text' ? (node as { value: string }).value : 'childNodes' in node ? node.childNodes.map(textOf).join('') : '';
function languageOf(pre: Element): string | undefined {
  const candidates = [...pre.childNodes.filter(isElement).filter((child) => child.tagName === 'code'), pre, pre.parentNode && isElement(pre.parentNode as Node) ? pre.parentNode as Element : undefined];
  for (const element of candidates) {
    const match = element?.attrs.find((attr) => attr.name === 'class')?.value.match(/(?:^|\s)language-([a-z0-9_+#-]+)/);
    if (match) return match[1];
  }
  return undefined;
}

/** Sanitize before inspection; authored details keep ownership of their code blocks. */
function htmlTree(html: string) {
  const root = parseFragment(safeHtml(html));
  const blocks: Element[] = [];
  const visit = (node: Node, inDetails = false): void => {
    if (isElement(node)) {
      // The sanitizer allows semantic/math classes. Package UI classes are never author input.
      node.attrs = node.attrs.flatMap((attr) => {
        if (attr.name !== 'class') return [attr];
        const value = attr.value.split(/\s+/).filter((name) => !name.startsWith('mb-')).join(' ');
        return value ? [{ ...attr, value }] : [];
      });
      if (node.tagName === 'pre' && !inDetails) blocks.push(node);
      inDetails ||= node.tagName === 'details';
    }
    if ('childNodes' in node) for (const child of node.childNodes) visit(child, inDetails);
  };
  visit(root);
  return { root, blocks };
}

export function countHtmlCodeBlocks(html: string): number { return htmlTree(html).blocks.length; }

export function HtmlOutput({ html, codeBlocks = 'expanded', foldCodeBlocks = true, qualifier }: {
  html: string;
  codeBlocks?: 'expanded' | 'collapsed';
  foldCodeBlocks?: boolean;
  qualifier?: string;
}) {
  const id = useId();
  const { root, blocks } = htmlTree(html);
  blocks.forEach((pre, index) => {
    const parent = pre.parentNode;
    if (!parent) return;
    // Only fixed package-owned markup is introduced after sanitization.
    const language = resolveLanguage(languageOf(pre), foldCodeBlocks ? 'python' : 'plaintext');
    const source = textOf(pre);
    const block = parseFragment(codeBlockHtml(source, language)).childNodes[0] as Element;
    if (!foldCodeBlocks) {
      block.parentNode = parent;
      parent.childNodes[parent.childNodes.indexOf(pre)] = block;
      return;
    }
    // Only fixed package-owned markup is introduced after sanitization.
    const fragment = parseFragment(`<details class="mb-disclosure mb-code-details mb-code-example" data-mb-disclosure="" data-mb-kind="code" data-mb-default-open="${codeBlocks === 'expanded'}"${codeBlocks === 'expanded' ? ' open' : ''}><summary><span class="mb-disclosure-label">${escapeHtml(language.label)}<span class="mb-sr-only"> code example${qualifier ? escapeHtml(` — ${qualifier}, code example ${index + 1}`) : ''}</span></span><span class="mb-disclosure-preview">${lineLabel(source)}</span></summary><div class="mb-disclosure-body"></div></details>`);
    const details = fragment.childNodes[0] as Element;
    const summary = details.childNodes[0] as Element;
    const body = details.childNodes[1] as Element;
    const summaryId = `${id}-code-${index + 1}-summary`;
    const bodyId = `${id}-code-${index + 1}-body`;
    summary.attrs.push({ name: 'id', value: summaryId }, { name: 'aria-controls', value: bodyId });
    body.attrs.push({ name: 'id', value: bodyId }, { name: 'aria-labelledby', value: summaryId });
    details.parentNode = parent;
    parent.childNodes[parent.childNodes.indexOf(pre)] = details;
    body.childNodes.push(block);
    block.parentNode = body;
  });
  return <div className="mb-output mb-prose" dangerouslySetInnerHTML={{ __html: serialize(root) }} />;
}
