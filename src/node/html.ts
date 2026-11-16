import { parseFragment, serialize } from 'parse5';
import { sanitizeOutput } from './sanitize.js';
import type { TocEntry } from '../types.js';
import { calloutStyle } from '../shared/callout.js';

type Node = { nodeName: string; tagName?: string; value?: string; parentNode?: Node | null; childNodes?: Node[]; attrs?: { name: string; value: string }[] };
export interface HtmlContext { cellId: string; title: string; toc: TocEntry[]; usedIds: Set<string>; consumedTitle: boolean; headingShift?: number }
function text(node: Node): string { return (node.value ?? '') + (node.childNodes ?? []).map(text).join(''); }
function slug(value: string): string { return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section'; }
function unique(value: string, ids: Set<string>): string { let next = value; let n = 2; while (ids.has(next)) next = `${value}-${n++}`; ids.add(next); return next; }
// Normalize exporter-specific wrappers before sanitization removes their classes.
export function normalizeMarimoMarkup(html: string): string {
  const root = parseFragment(html) as unknown as Node;
  const classesOf = (node: Node): string[] => node.attrs?.find((attr) => attr.name === 'class')?.value.split(/\s+/).filter(Boolean) ?? [];
  const retag = (node: Node, tag: string, classes: string): void => {
    node.nodeName = tag; node.tagName = tag;
    node.attrs = [...(node.attrs ?? []).filter((attr) => attr.name !== 'class'), { name: 'class', value: classes }];
  };
  const walk = (node: Node): void => {
    const classes = classesOf(node);
    if (node.tagName === 'span') {
      const tag = classes.includes('markdown') ? 'div' : classes.includes('paragraph') ? 'p' : undefined;
      if (tag) {
        node.nodeName = tag;
        node.tagName = tag;
        node.attrs = node.attrs?.filter((attr) => attr.name !== 'class');
      }
    } else if (node.tagName === 'div' && classes.includes('admonition')) {
      const { tone } = calloutStyle(classes.find((name) => name !== 'admonition') ?? '');
      node.attrs = [{ name: 'class', value: `mb-callout mb-callout-${tone}` }, { name: 'role', value: 'note' }];
      for (const child of node.childNodes ?? []) if (child.tagName === 'span' && classesOf(child).includes('admonition-title')) retag(child, 'p', 'mb-callout-title');
    } else if (node.tagName === 'ul' && classes.includes('task-list')) {
      retag(node, 'ul', 'mb-task-list');
    } else if (node.tagName === 'li' && classes.includes('task-list-item')) {
      retag(node, 'li', 'mb-task-item');
      node.childNodes = (node.childNodes ?? []).flatMap((child) => {
        if (child.tagName !== 'input' || child.attrs?.find((attr) => attr.name === 'type')?.value !== 'checkbox') return [child];
        const checked = child.attrs.some((attr) => attr.name === 'checked');
        const replacement = (parseFragment(`<span class="mb-task-box${checked ? ' mb-task-checked' : ''}"></span><span class="mb-sr-only">${checked ? 'Done: ' : 'Not done: '}</span>`) as unknown as Node).childNodes ?? [];
        for (const item of replacement) item.parentNode = node;
        return replacement;
      });
    }
    for (const child of node.childNodes ?? []) walk(child);
  };
  walk(root);
  return serialize(root as never);
}
export function compileHtml(html: string, context: HtmlContext): { html: string; plainText: string } {
  const root = parseFragment(sanitizeOutput(normalizeMarimoMarkup(html))) as unknown as Node;
  const referenceMap = new Map<string, string>();
  const walk = (node: Node): void => {
    const tag = node.tagName;
    if (tag && /^h[1-6]$/.test(tag)) {
      const title = text(node).trim();
      let level = Number(tag[1]);
      if (level === 1 && title === context.title && !context.consumedTitle) {
        context.consumedTitle = true; node.tagName = 'span'; node.nodeName = 'span';
        const titleId = node.attrs?.find((attr) => attr.name === 'id')?.value;
        node.attrs = titleId ? [{ name: 'id', value: unique(slug(titleId), context.usedIds) }] : []; node.childNodes = [];
      } else {
        if (level === 1) { level = 2; context.headingShift = 1; }
        else level = Math.min(6, level + (context.headingShift ?? 0));
        node.tagName = `h${level}`; node.nodeName = `h${level}`;
        const original = node.attrs?.find((attr) => attr.name === 'id')?.value;
        const id = unique(original && /^[a-zA-Z][a-zA-Z0-9_:.-]*$/.test(original) ? original : slug(title), context.usedIds);
        node.attrs = [...(node.attrs ?? []).filter((attr) => attr.name !== 'id'), { name: 'id', value: id }];
        context.toc.push({ id, title, level });
      }
    } else if (node.attrs) {
      node.attrs = node.attrs.map((attr) => {
        if (attr.name !== 'id') return attr;
        const next = unique(`${slug(context.cellId)}-${slug(attr.value)}`, context.usedIds);
        referenceMap.set(attr.value, next);
        return { ...attr, value: next };
      });
    }
    for (const child of node.childNodes ?? []) walk(child);
  };
  for (const node of root.childNodes ?? []) walk(node);
  const rewrite = (node: Node): void => {
    node.attrs = node.attrs?.map((attr) => attr.name === 'href' && attr.value.startsWith('#') && referenceMap.has(attr.value.slice(1)) ? { ...attr, value: `#${referenceMap.get(attr.value.slice(1))}` } : attr);
    for (const child of node.childNodes ?? []) rewrite(child);
  };
  for (const node of root.childNodes ?? []) rewrite(node);
  const plainText = text(root).replace(/\s+/g, ' ').trim();
  return { html: sanitizeOutput(serialize(root as never)), plainText };
}
