import { createHash } from 'node:crypto';
import { parseFragment } from 'parse5';
import type { InteractiveDescriptor, MarimoDocument, MarimoDiagnostic, MarimoMetadata, MarimoNode } from '../types.js';
import { MarimoBlogError, fail } from '../diagnostics.js';
import { parseDocument, metadataSchema } from '../schema.js';
import { AssetCollector } from './assets.js';
import { compileMime, type OutputAdapter } from './mime.js';
import { hashPublicationConfig, publicationSchema, type PublicationConfig } from './metadata.js';
import { safeAssetBase } from './sanitize.js';
import { validateSnapshots, type MarimoSnapshot } from './snapshots.js';

export interface CompileOptions { metadata: PublicationConfig | MarimoMetadata; assetBase: string; publicDir?: string; interactive?: InteractiveDescriptor; strict?: boolean; maxAssetBytes?: number; maxOutputBytes?: number; adapters?: readonly OutputAdapter[] }
export interface BuildResult { document: MarimoDocument; assets: Map<string, Uint8Array> }
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const version = '0.1.0';
function plain(html: string): string {
  type Node = { tagName?: string; value?: string; childNodes?: Node[] };
  const walk = (node: Node): string => ['pre', 'table', 'script', 'style'].includes(node.tagName ?? '') ? '' : (node.value ?? '') + (node.childNodes ?? []).map(walk).join(' ');
  return walk(parseFragment(html) as unknown as Node).replace(/\s+/g, ' ').trim();
}
function prose(nodes: MarimoNode[]): string[] {
  return nodes.flatMap((node): string[] => {
    if (node.type === 'html') return [plain(node.html)];
    if (node.type === 'math') return [node.source];
    if (node.type === 'layout' || node.type === 'callout') return prose(node.children);
    if (node.type === 'tabs' || node.type === 'accordion') return node.panels.flatMap((panel) => [panel.title, ...prose(panel.children)]);
    if ('caption' in node && node.caption) return [node.caption];
    return [];
  });
}
export async function compileSnapshot(input: MarimoSnapshot, options: CompileOptions): Promise<BuildResult> {
  const snapshot = validateSnapshots(input);
  if (new Set(options.adapters?.map((adapter) => adapter.name)).size !== (options.adapters?.length ?? 0) || options.adapters?.some((adapter) => !adapter.name || !adapter.exporterVersions.length)) fail('MB_SCHEMA', 'Adapters require unique names and explicit exporter versions', 'Review the build-time adapter registrations.');
  const configResult = publicationSchema.safeParse(options.metadata);
  if (!configResult.success) fail('MB_SCHEMA', configResult.error.message, 'Correct publication metadata.');
  const config = configResult.data;
  const metadata = metadataSchema.parse(Object.fromEntries(Object.entries(config).filter(([key]) => !['includeSource', 'code', 'console', 'cells', 'resourceOrigins', 'sandboxScriptUrls'].includes(key))));
  const assetBase = safeAssetBase(options.assetBase);
  for (const id of Object.keys(config.cells ?? {})) if (!snapshot.notebook.cells.some((cell) => cell.id === id)) fail('MB_SCHEMA', `Unknown cell override ${id}`, 'Update metadata after inspecting the current export.');
  const assetCollector = new AssetCollector({ files: snapshot.files, publicDir: options.publicDir, assetBase, resourceOrigins: config.resourceOrigins, maxAssetBytes: options.maxAssetBytes, maxOutputBytes: options.maxOutputBytes });
  const diagnostics: MarimoDiagnostic[] = [];
  const toc: MarimoDocument['toc'] = [];
  const usedIds = new Set<string>();
  const htmlState = { title: metadata.title, toc, usedIds, consumedTitle: false, cellId: '' };
  const sessionCells = new Map(snapshot.session.cells.map((cell) => [cell.id, cell]));
  const cells: MarimoDocument['cells'] = [];
  const sourceHashes: Record<string, string> = {};
  const paragraphs: string[] = [];
  for (const [ordinal, cell] of snapshot.notebook.cells.entries()) {
    if (cell.code !== null && cell.code !== '') sourceHashes[cell.id] = hash(cell.code.replace(/\r\n/g, '\n'));
    const override = config.cells?.[cell.id];
    if (override?.include === false) continue;
    const session = sessionCells.get(cell.id);
    const outputs: MarimoNode[] = [];
    const consoleOutputs: MarimoNode[] = [];
    for (const [index, output] of (session?.outputs ?? []).entries()) {
      const outputConfig = override?.outputs?.[String(index)];
      htmlState.cellId = cell.id;
      const nodes = await compileMime(output, { html: htmlState, assets: assetCollector, diagnostics, cellId: cell.id, outputIndex: index, htmlMode: outputConfig?.html, htmlRole: outputConfig?.htmlRole, caption: outputConfig?.caption, alt: outputConfig?.alt, poster: outputConfig?.poster, sandboxScriptUrls: config.sandboxScriptUrls, sandboxAllowEval: outputConfig?.sandboxAllowEval, exporterVersion: snapshot.exporterVersion, adapters: options.adapters });
      const rewritten = await assetCollector.rewrite(nodes);
      outputs.push(...rewritten);
      paragraphs.push(...prose(rewritten));
    }
    for (const key of Object.keys(override?.outputs ?? {})) if (Number(key) >= (session?.outputs.length ?? 0)) fail('MB_SCHEMA', `Unknown output index ${key} for cell ${cell.id}`, 'Inspect the current export before applying overrides.');
    for (const [index, output] of (session?.console ?? []).entries()) {
      const consoleHtml = { title: '', toc: [], usedIds, consumedTitle: true, cellId: cell.id };
      const nodes = await compileMime(output, { html: consoleHtml, assets: assetCollector, diagnostics, cellId: cell.id, outputIndex: index, exporterVersion: snapshot.exporterVersion, adapters: options.adapters });
      consoleOutputs.push(...await assetCollector.rewrite(nodes));
    }
    cells.push({ id: cell.id, ordinal, ...(cell.name ? { name: cell.name } : {}), ...(config.includeSource !== false && cell.code !== null ? { source: cell.code } : {}), sourceLanguage: 'python', hideCode: cell.config.hide_code ?? false, disabled: cell.config.disabled ?? false, code: cell.config.hide_code ? 'hidden' : override?.code ?? config.code ?? 'folded', console: config.console ?? 'collapsed', outputs, consoleOutputs });
  }
  if (options.interactive && (!snapshot.source || options.interactive.sourceSha256 !== hash(snapshot.source.replace(/\r\n/g, '\n')) || options.interactive.exporterVersion !== snapshot.exporterVersion)) fail('MB_CELL_HASH', 'Interactive export source/version differs from static export', 'Export WASM from the same source and marimo version.');
  const sourceDownload = config.includeSource !== false && snapshot.source ? assetCollector.add(Buffer.from(snapshot.source), 'text/x-python') : undefined;
  const acknowledged = [...diagnostics, ...assetCollector.diagnostics].map((item) => item.severity === 'error' && item.cellId && config.cells?.[item.cellId]?.allowDiagnostics?.includes(item.code)
    ? { ...item, severity: 'warning' as const, remediation: `Acknowledged for cell ${item.cellId} by publication config. ${item.remediation}` }
    : item);
  const document: MarimoDocument = {
    schemaVersion: 1, metadata, provenance: {
      exporterVersion: snapshot.exporterVersion, notebookVersion: '1', sessionVersion: '1', inputSha256: snapshot.inputSha256,
      publicationConfigSha256: hashPublicationConfig(config), producerVersion: version, sourceHashes,
      ...(snapshot.source ? { sourceSha256: hash(snapshot.source.replace(/\r\n/g, '\n')) } : {}),
    }, assetBase, cells, toc, plainText: paragraphs.filter(Boolean).join('\n\n'), assets: assetCollector.assets,
    diagnostics: acknowledged, ...(sourceDownload ? { sourceDownload } : {}), ...(options.interactive ? { interactive: options.interactive } : {}),
  };
  const unresolved = acknowledged.filter((item) => item.severity === 'error');
  if (options.strict !== false && unresolved.length) throw new MarimoBlogError(unresolved);
  return { document: parseDocument(document), assets: assetCollector.bytes };
}
