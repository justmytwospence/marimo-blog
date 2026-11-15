import { safeAssetBase, sanitizeOutput } from './node/sanitize.js';
import { z } from 'zod';
import type { MarimoDocument, TocEntry } from './types.js';
import { fail } from './diagnostics.js';

export const metadataSchema = z.strictObject({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1), date: z.iso.date(), description: z.string().min(1),
  authors: z.array(z.string()).optional(), tags: z.array(z.string()).optional(),
  draft: z.boolean().optional(), featured: z.boolean().optional(), language: z.string().optional(),
  sourceUrl: z.url().startsWith('https://').optional(),
});
const diagnosticSchema = z.strictObject({ severity: z.enum(['error', 'warning', 'info']), code: z.string(), message: z.string(), remediation: z.string(), cellId: z.string().optional(), outputIndex: z.number().int().nonnegative().optional() });
const assetSchema = z.strictObject({ path: z.string(), mime: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative() });
const nodeSchema: z.ZodType<import('./types.js').MarimoNode> = z.lazy(() => z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('html'), html: z.string(), role: z.enum(['narrative', 'result']).optional() }),
  z.strictObject({ type: z.literal('text'), text: z.string(), stream: z.enum(['stdout', 'stderr']).optional() }),
  z.strictObject({ type: z.literal('error'), name: z.string(), message: z.string(), traceback: z.array(z.string()) }),
  z.strictObject({ type: z.literal('image'), src: z.string(), alt: z.string(), caption: z.string().optional() }),
  z.strictObject({ type: z.literal('media'), src: z.string(), mime: z.string(), caption: z.string().optional() }),
  z.strictObject({ type: z.literal('math'), source: z.string(), html: z.string(), display: z.boolean() }),
  z.strictObject({ type: z.literal('code'), code: z.string(), language: z.string() }),
  z.strictObject({ type: z.literal('layout'), layout: z.enum(['stack', 'grid', 'linear']), children: z.array(nodeSchema) }),
  z.strictObject({ type: z.enum(['tabs', 'accordion']), panels: z.array(z.strictObject({ title: z.string(), children: z.array(nodeSchema) })) }),
  z.strictObject({ type: z.literal('callout'), kind: z.string(), children: z.array(nodeSchema) }),
  z.strictObject({ type: z.literal('statistic'), label: z.string(), value: z.string(), caption: z.string().optional() }),
  z.strictObject({ type: z.enum(['json', 'plotly', 'vega']), asset: z.string(), caption: z.string().optional(), alt: z.string().optional(), poster: z.string().optional() }),
  z.strictObject({ type: z.literal('table'), asset: z.string(), caption: z.string().optional(), alt: z.string().optional(), preview: z.strictObject({ headers: z.array(z.string()), rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))), totalRows: z.number().int().nonnegative().optional(), download: z.boolean().optional() }).optional() }),
  z.strictObject({ type: z.literal('sandbox'), asset: z.string(), caption: z.string().optional(), alt: z.string().optional(), scriptUrls: z.array(z.url().startsWith('https://').refine((value) => !/[\s'"<>;]/.test(value) && new URL(value).href === value)), allowEval: z.boolean().optional() }),
  z.strictObject({ type: z.literal('runtime-required'), value: z.string(), message: z.string() }),
  z.strictObject({ type: z.literal('unsupported'), mime: z.string(), message: z.string() }),
]));
const documentSchema = z.strictObject({
  schemaVersion: z.literal(1), metadata: metadataSchema,
  provenance: z.strictObject({ exporterVersion: z.string(), notebookVersion: z.literal('1'), sessionVersion: z.literal('1'), inputSha256: z.string().regex(/^[a-f0-9]{64}$/), publicationConfigSha256: z.string().regex(/^[a-f0-9]{64}$/), producerVersion: z.string(), sourceHashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/).optional() }),
  assetBase: z.string().regex(/^\/(?!\/)(?:[^?#]*)$/),
  cells: z.array(z.strictObject({ id: z.string(), ordinal: z.number().int().nonnegative(), name: z.string().optional(), source: z.string().optional(), sourceLanguage: z.string(), hideCode: z.boolean(), disabled: z.boolean(), code: z.enum(['folded', 'visible', 'hidden']), console: z.enum(['collapsed', 'visible', 'hidden']), outputs: z.array(nodeSchema), consoleOutputs: z.array(nodeSchema) })),
  toc: z.array(z.strictObject({ id: z.string(), title: z.string(), level: z.number().int().min(1).max(6) })),
  plainText: z.string(), assets: z.array(assetSchema), diagnostics: z.array(diagnosticSchema), sourceDownload: z.string().optional(),
  interactive: z.strictObject({ url: z.string().regex(/^\/(?!\/)/), exporterVersion: z.string(), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/) }).optional(),
});

export function parseDocument(value: unknown): MarimoDocument {
  const parsed = documentSchema.safeParse(value);
  if (!parsed.success) fail('MB_SCHEMA', parsed.error.message, 'Rebuild the publication from its supported export.');
  const document = parsed.data;
  if (safeAssetBase(document.assetBase) !== document.assetBase) fail('MB_SCHEMA', 'Noncanonical asset base', 'Rebuild with a canonical root-relative asset base.');
  if (new Set(document.cells.map((cell) => cell.id)).size !== document.cells.length) fail('MB_SCHEMA', 'Duplicate document cell IDs', 'Rebuild the document.');
  const assetUrls = new Set(document.assets.map((asset) => `${document.assetBase}/${asset.path}`));
  if (assetUrls.size !== document.assets.length) fail('MB_SCHEMA', 'Duplicate asset inventory entries', 'Rebuild the document.');
  const localAsset = (value: string): boolean => {
    if (!value.startsWith('/') || value.startsWith('//') || /[\\\\\s]|%(?:2e|2f|5c|25)/i.test(value) || value.split(/[/?#]/).some((part) => part === '..' || part === '.')) return false;
    const url = new URL(value, 'https://marimo-blog.invalid/');
    return url.origin === 'https://marimo-blog.invalid' && assetUrls.has(url.pathname);
  };
  for (const asset of document.assets) if (!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(asset.path) || !asset.path.startsWith(asset.sha256)) fail('MB_SCHEMA', 'Invalid asset path in manifest', 'Rebuild the publication.');
  const assertAsset = (url: string): void => {
    if (!localAsset(url) && !(url.startsWith('https://') && !/[\\\\\s@]/.test(url))) fail('MB_SCHEMA', `Unverified resource URL ${url}`, 'Rebuild with bundled resources.');
  };
  const walk = (nodes: typeof document.cells[number]['outputs']): void => {
    for (const node of nodes) {
      if (node.type === 'html' || node.type === 'math') {
        const cleaned = sanitizeOutput(node.html);
        if (cleaned !== node.html || /(?:href|src|poster)=["']data:/i.test(node.html)) fail('MB_SCHEMA', 'Manifest contains HTML outside the publication allowlist', 'Rebuild from a trusted export.');
        for (const match of node.html.matchAll(/(?:src|poster)="([^"]+)"/g)) assertAsset(match[1]!);
        for (const match of node.html.matchAll(/srcset="([^"]+)"/g)) for (const candidate of match[1]!.split(',')) assertAsset(candidate.trim().split(/\s+/)[0]!);
      }
      if (node.type === 'image' || node.type === 'media') assertAsset(node.src);
      if ('poster' in node && node.poster) assertAsset(node.poster);
      if ('asset' in node && !localAsset(node.asset)) fail('MB_SCHEMA', 'External structured payload', 'Rebuild with bundled chart/table assets.');
      if (node.type === 'table' && node.preview && (node.preview.rows.length > 20 || node.preview.rows.some((row) => row.length !== node.preview!.headers.length) || (node.preview.totalRows !== undefined && node.preview.totalRows < node.preview.rows.length))) fail('MB_SCHEMA', 'Invalid bounded table preview', 'Rebuild the captured table.');
      if (node.type === 'layout' || node.type === 'callout') walk(node.children);
      if (node.type === 'tabs' || node.type === 'accordion') for (const panel of node.panels) walk(panel.children);
    }
  };
  for (const cell of document.cells) { walk(cell.outputs); walk(cell.consoleOutputs); }
  if (document.sourceDownload && !localAsset(document.sourceDownload)) fail('MB_SCHEMA', 'Unbundled source download', 'Rebuild with bundled source.');
  return document;
}
export function getPlainText(document: MarimoDocument): string { return document.plainText; }
export function getTableOfContents(document: MarimoDocument): TocEntry[] { return document.toc; }
