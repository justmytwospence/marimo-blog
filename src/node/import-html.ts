import { createHash } from 'node:crypto';
import { parse } from 'parse5';
import { parse as parseScript } from 'acorn';
import { fail } from '../diagnostics.js';
import { validateSnapshots, type MarimoSnapshot } from './snapshots.js';

type HtmlNode = { nodeName: string; value?: string; childNodes?: HtmlNode[]; attrs?: { name: string; value: string }[] };
type JsNode = { type: string; [key: string]: unknown };
const globals = ['__MARIMO_MOUNT_CONFIG__', '__MARIMO_STATIC__', '__MARIMO_EXPORT_CONTEXT__'] as const;
export interface ImportOptions { maxInputBytes?: number; maxDepth?: number }
function object(value: unknown): JsNode {
  if (typeof value !== 'object' || value === null || !('type' in value)) fail('MB_SCHEMA', 'Unexpected JavaScript expression in export', 'Re-export using supported marimo.');
  return value as JsNode;
}
function member(node: JsNode, owner: string, property: string): boolean {
  return node.type === 'MemberExpression' && node.computed === false && object(node.object).type === 'Identifier' && object(node.object).name === owner && object(node.property).name === property;
}
function literal(node: JsNode, depth: number, maxDepth: number, allowFreeze = false): unknown {
  if (depth > maxDepth) fail('MB_SCHEMA', 'Export nesting exceeds limit', 'Reduce nested export payloads.');
  if (node.type === 'Literal') {
    if (node.regex || typeof node.value === 'bigint' || typeof node.value === 'number' && !Number.isFinite(node.value)) fail('MB_SCHEMA', 'Non-JSON literal', 'Re-export a valid notebook.');
    return node.value;
  }
  if (allowFreeze && node.type === 'CallExpression' && member(object(node.callee), 'Object', 'freeze')) {
    const args = node.arguments as unknown[];
    if (args.length !== 1) fail('MB_SCHEMA', 'Invalid Object.freeze wrapper', 'Re-export a valid notebook.');
    return literal(object(args[0]), depth + 1, maxDepth, true);
  }
  if (node.type === 'UnaryExpression' && node.operator === '-' && node.prefix === true && object(node.argument).type === 'Literal') {
    const value = literal(object(node.argument), depth + 1, maxDepth);
    if (typeof value !== 'number') fail('MB_SCHEMA', 'Invalid numeric literal', 'Re-export a valid notebook.');
    return -value;
  }
  if (node.type === 'ArrayExpression') {
    const elements = node.elements as unknown[];
    if (elements.some((el) => el === null)) fail('MB_SCHEMA', 'Sparse export arrays are not JSON', 'Re-export a valid notebook.');
    return elements.map((el) => literal(object(el), depth + 1, maxDepth, allowFreeze));
  }
  if (node.type === 'ObjectExpression') {
    const result: Record<string, unknown> = Object.create(null);
    for (const entry of node.properties as unknown[]) {
      const property = object(entry);
      if (property.type !== 'Property' || property.computed || property.kind !== 'init' || property.method || property.shorthand) fail('MB_SCHEMA', 'Executable property in export data', 'Remove injected export code.');
      const keyNode = object(property.key);
      const key = keyNode.type === 'Identifier' ? keyNode.name : literal(keyNode, depth + 1, maxDepth);
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key) || Object.hasOwn(result, key)) fail('MB_SCHEMA', 'Unsafe or duplicate export key', 'Re-export a valid notebook.');
      result[key] = literal(object(property.value), depth + 1, maxDepth, allowFreeze);
    }
    return result;
  }
  fail('MB_SCHEMA', `Executable ${node.type} in export data`, 'Only literal official HTML exports are accepted.');
}
export function decodeWrapper(source: string, maxDepth: number): { name: string; value: unknown } {
  let program: JsNode;
  try { program = parseScript(source, { ecmaVersion: 'latest', sourceType: 'script' }) as unknown as JsNode; }
  catch { fail('MB_SCHEMA', 'Invalid export script syntax', 'Re-export a valid notebook.'); }
  const statements = program.body as unknown[];
  if (statements.length !== 1) fail('MB_SCHEMA', 'Unexpected statements in export wrapper', 'Re-export a valid notebook.');
  const statement = object(statements[0]);
  const call = object(statement.expression);
  if (statement.type !== 'ExpressionStatement' || call.type !== 'CallExpression' || !member(object(call.callee), 'Object', 'defineProperty')) fail('MB_SCHEMA', 'Unexpected export global definition', 'Re-export a valid notebook.');
  const args = call.arguments as unknown[];
  if (args.length !== 3 || object(args[0]).type !== 'Identifier' || object(args[0]).name !== 'window') fail('MB_SCHEMA', 'Invalid export global target', 'Re-export a valid notebook.');
  const name = literal(object(args[1]), 0, maxDepth);
  if (typeof name !== 'string' || !globals.includes(name as typeof globals[number])) fail('MB_SCHEMA', 'Unknown export global', 'Re-export a supported marimo export.');
  const descriptor = object(args[2]);
  if (descriptor.type !== 'ObjectExpression') fail('MB_SCHEMA', 'Invalid export descriptor', 'Re-export a valid notebook.');
  const properties = descriptor.properties as unknown[];
  const values = new Map<string, JsNode>();
  for (const item of properties) {
    const prop = object(item);
    if (prop.type !== 'Property' || prop.kind !== 'init' || prop.computed || prop.method || prop.shorthand) fail('MB_SCHEMA', 'Executable export descriptor', 'Re-export a valid notebook.');
    const key = object(prop.key);
    const nameKey = key.type === 'Identifier' ? key.name : key.value;
    if (typeof nameKey !== 'string' || values.has(nameKey) || !['value', 'writable', 'configurable'].includes(nameKey)) fail('MB_SCHEMA', 'Invalid export descriptor key', 'Re-export a valid notebook.');
    values.set(nameKey, object(prop.value));
  }
  if (values.size !== 3 || literal(object(values.get('writable')), 0, maxDepth) !== false || literal(object(values.get('configurable')), 0, maxDepth) !== false) fail('MB_SCHEMA', 'Mutable export descriptor', 'Re-export a valid notebook.');
  const frozen = object(values.get('value'));
  if (frozen.type !== 'CallExpression' || !member(object(frozen.callee), 'Object', 'freeze') || (frozen.arguments as unknown[]).length !== 1 || object((frozen.arguments as unknown[])[0]).type !== 'ObjectExpression') fail('MB_SCHEMA', 'Export mount/static value must be a frozen object literal', 'Export the notebook; do not use an HTML template or string-valued wrapper.');
  return { name, value: literal(frozen, 0, maxDepth, true) };
}

export function readExportGlobals(html: string, options: ImportOptions = {}): { found: Map<string, unknown>; code?: string } {
  if (Buffer.byteLength(html) > (options.maxInputBytes ?? 100 * 1024 * 1024)) fail('MB_SCHEMA', 'HTML export exceeds input limit', 'Use an explicitly reviewed higher byte limit.');
  const tree = parse(html) as unknown as HtmlNode;
  const found = new Map<string, unknown>();
  let code: string | undefined;
  const visit = (node: HtmlNode, depth: number): void => {
    if (depth > (options.maxDepth ?? 100)) fail('MB_SCHEMA', 'HTML nesting exceeds limit', 'Re-export a valid notebook.');
    if (node.nodeName === 'marimo-code') {
      if (code !== undefined) fail('MB_SCHEMA', 'Duplicate marimo-code', 'Re-export a valid notebook.');
      const encoded = node.childNodes?.map((child) => child.value ?? '').join('') ?? '';
      // static_notebook_template adds a literal newline/indent around URI-encoded source;
      // source newlines themselves are percent-encoded. WASM uses an unframed element.
      const framed = encoded.startsWith('\n    ') && encoded.endsWith('\n') ? encoded.slice(5, -1) : encoded;
      if (framed) {
        try { code = decodeURIComponent(framed).replace(/\r\n/g, '\n'); }
        catch { fail('MB_SCHEMA', 'Invalid marimo-code percent encoding', 'Re-export a valid notebook.'); }
      } else code = '';
    }
    if (node.nodeName === 'script') {
      const source = node.childNodes?.map((child) => child.value ?? '').join('') ?? '';
      if (globals.some((name) => source.includes(name)) && !source.includes('"{{ mount_config }}"')) {
        const { name, value } = decodeWrapper(source, options.maxDepth ?? 100);
        if (found.has(name)) fail('MB_SCHEMA', `Duplicate ${name} definition`, 'Re-export a valid notebook.');
        found.set(name, value);
      } else if (source.includes('{{ mount_config }}')) fail('MB_SCHEMA', 'Unrendered marimo export template', 'Run marimo export html, not the frontend template.');
    }
    for (const child of node.childNodes ?? []) visit(child, depth + 1);
  };
  visit(tree, 0);
  return { found, code };
}
export function importMarimoHtml(html: string, options: ImportOptions = {}): MarimoSnapshot {
  const { found, code } = readExportGlobals(html, options);
  if (!found.has('__MARIMO_MOUNT_CONFIG__') || !found.has('__MARIMO_STATIC__')) fail('MB_SCHEMA', 'Missing marimo export globals', 'Use a complete official static HTML export.');
  const mount = found.get('__MARIMO_MOUNT_CONFIG__') as Record<string, unknown>;
  const staticState = found.get('__MARIMO_STATIC__') as Record<string, unknown>;
  const context = found.get('__MARIMO_EXPORT_CONTEXT__') as Record<string, unknown> | undefined;
  if (context && (context.trusted !== true || typeof context.notebookCode !== 'string' || context.notebookCode.replace(/\r\n/g, '\n') !== (code ?? ''))) fail('MB_CELL_HASH', 'Export context source differs from marimo-code', 'Re-export without modifying the HTML artifact.');
  if (!['0.25.0', '0.25.1', '0.25.2'].includes(String(mount.version))) fail('MB_EXPORT_VERSION', `Unsupported exporter ${String(mount.version)}`, 'Re-export with marimo 0.25.0, 0.25.1, or 0.25.2.');
  return validateSnapshots({ exporterVersion: mount.version, notebook: mount.notebook, session: mount.session, source: code || undefined, files: staticState.files, layout: mount.layout, inputSha256: createHash('sha256').update(html).digest('hex') });
}
