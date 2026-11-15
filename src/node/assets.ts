import { createHash } from 'node:crypto';
import { readFile, realpath, lstat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { parseFragment, serialize } from 'parse5';
import type { MarimoAsset, MarimoDiagnostic, MarimoNode } from '../types.js';
import { fail } from '../diagnostics.js';
import { safeAssetBase, sanitizeOutput, sanitizeSvg } from './sanitize.js';

type HtmlNode = { nodeName: string; tagName?: string; childNodes?: HtmlNode[]; attrs?: { name: string; value: string }[] };
export interface AssetContext { files: Record<string, string>; publicDir?: string; assetBase: string; resourceOrigins?: string[]; maxAssetBytes?: number; maxOutputBytes?: number; maxNodes?: number }
export interface CollectedAssets { nodes: MarimoNode[]; bytes: Map<string, Uint8Array>; assets: MarimoAsset[]; diagnostics: MarimoDiagnostic[] }
export class AssetCollector {
  readonly bytes = new Map<string, Uint8Array>();
  readonly assets: MarimoAsset[] = [];
  readonly diagnostics: MarimoDiagnostic[] = [];
  private nodes = 0;
  private totalBytes = 0;
  constructor(readonly context: AssetContext) { safeAssetBase(context.assetBase); }
  add(data: Uint8Array, mime: string): string {
    if (data.byteLength > (this.context.maxAssetBytes ?? 64 * 1024 * 1024)) fail('MB_SCHEMA', 'Individual asset exceeds byte limit', 'Raise the explicit byte limit after reviewing the output.');
    if (mime === 'image/svg+xml') data = Buffer.from(sanitizeSvg(Buffer.from(data).toString('utf8')));
    const sha256 = createHash('sha256').update(data).digest('hex');
    const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/json': 'json', 'text/csv': 'csv', 'text/html': 'txt', 'text/x-python': 'py', 'audio/mpeg': 'mp3', 'video/mp4': 'mp4' } as Record<string, string>)[mime] ?? 'bin';
    const path = `${sha256}.${ext}`;
    if (!this.bytes.has(path)) {
      if (this.totalBytes + data.byteLength > (this.context.maxOutputBytes ?? 256 * 1024 * 1024)) fail('MB_SCHEMA', 'Output assets exceed byte limit', 'Raise the explicit byte limit after reviewing the output.');
      this.bytes.set(path, data); this.assets.push({ path, sha256, mime, bytes: data.byteLength }); this.totalBytes += data.byteLength;
    }
    return `${safeAssetBase(this.context.assetBase)}/${path}`;
  }
  private dataUri(url: string): { bytes: Uint8Array; mime: string } {
    const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)(;base64)?,([\s\S]*)$/i.exec(url);
    if (!match) fail('MB_UNSAFE_URL', 'Malformed data URI', 'Re-export with complete image/media bytes.');
    const [, mime = '', encoding, data = ''] = match;
    if (encoding && (!/^[a-zA-Z0-9+/]*={0,2}$/.test(data) || data.length % 4 !== 0)) fail('MB_UNSAFE_URL', 'Malformed base64 asset', 'Re-export with complete image/media bytes.');
    let bytes: Uint8Array;
    try { bytes = encoding ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data)); }
    catch { fail('MB_UNSAFE_URL', 'Malformed encoded asset', 'Re-export with valid asset data.'); }
    return { bytes, mime };
  }
  async url(value: string, kind: 'resource' | 'link', visited = new Set<string>()): Promise<string> {
    const ownPrefix = `${safeAssetBase(this.context.assetBase)}/`;
    if (value.startsWith(ownPrefix) && this.bytes.has(value.slice(ownPrefix.length).split(/[?#]/, 1)[0]!)) return value;
    if ([...value].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) fail('MB_UNSAFE_URL', 'Whitespace/control characters in URL', 'Use a valid encoded URL.');
    if (value.startsWith('data:')) { const data = this.dataUri(value); return this.add(data.bytes, data.mime); }
    if (value.startsWith('//') || value.startsWith('file:') || value.startsWith('javascript:') || value.startsWith('blob:') || value.includes('\\') || value.split(/[/?#]/).includes('..')) fail('MB_UNSAFE_URL', `Unsafe ${kind} URL`, 'Use a bundled asset or safe hyperlink.');
    if (value.startsWith('#')) return value;
    let url: URL;
    try { url = new URL(value, 'https://marimo-blog.invalid/'); }
    catch { fail('MB_UNSAFE_URL', 'Invalid asset URL', 'Use a valid relative URL.'); }
    if (url.origin !== 'https://marimo-blog.invalid') {
      if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) fail('MB_UNSAFE_URL', 'Unsafe URL scheme', 'Use HTTPS or a bundled resource.');
      if (kind === 'resource' && !this.context.resourceOrigins?.includes(url.origin)) fail('MB_UNSAFE_URL', `Remote resource not allowlisted: ${url.origin}`, 'List the exact origin after reviewing it.');
      return value;
    }
    const original = url.pathname;
    if (/%2f|%5c|%00|%2e/i.test(value) || original.split('/').includes('..') || value.startsWith('/Users/') || value.startsWith('/home/')) fail('MB_UNSAFE_URL', 'Path traversal or filesystem URL', 'Bundle the resource into the export.');
    const virtual = original.startsWith('/@file/') ? this.context.files[original] ?? this.context.files[`./${original.slice(1)}`] : undefined;
    if (virtual !== undefined) {
      if (visited.has(original) || visited.size >= 100) fail('MB_UNSAFE_URL', 'Cyclic or overly deep virtual asset reference', 'Re-export complete virtual file bytes.');
      visited.add(original);
      return `${await this.url(virtual, 'resource', visited)}${url.search}${url.hash}`;
    }
    if (original.startsWith('/@file/')) fail('MB_ASSET_MISSING', `Missing virtual file ${original}`, 'Re-export with the referenced virtual file.');
    if (original.startsWith('/public/') || value.startsWith('public/')) {
      if (!this.context.publicDir) fail('MB_ASSET_MISSING', 'Public asset not bundled in export', 'Supply --public-dir for reviewed local resources.');
      const root = await realpath(this.context.publicDir);
      const file = resolve(root, original.replace(/^\/(?:public\/)?/, '').replace(/^public\//, ''));
      const location = relative(root, file);
      if (location.startsWith('..') || location.includes(`..${sep}`) || file === root) fail('MB_UNSAFE_URL', 'Asset escaped public directory', 'Use paths inside the public directory.');
      let stat;
      try { stat = await lstat(file); }
      catch { fail('MB_ASSET_MISSING', `Missing public asset ${original}`, 'Restore the referenced public file.'); }
      if (!stat.isFile() || stat.isSymbolicLink() || await realpath(file) !== file) fail('MB_UNSAFE_URL', 'Public asset is not a regular confined file', 'Replace symlinked assets with reviewed files.');
      const data = await readFile(file);
      const mime = file.endsWith('.png') ? 'image/png' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
      return `${this.add(data, mime)}${url.search}${url.hash}`;
    }
    // Ordinary relative links are allowed; resources must be bundled or explicitly allowlisted.
    if (kind === 'resource') fail('MB_ASSET_MISSING', `Unbundled resource ${value}`, 'Bundle the resource in the export or provide its public directory.');
    return value;
  }
  async rewrite(nodes: MarimoNode[]): Promise<MarimoNode[]> {
    const result: MarimoNode[] = [];
    for (const node of nodes) {
      if (++this.nodes > (this.context.maxNodes ?? 200_000)) fail('MB_SCHEMA', 'Expanded node count exceeds limit', 'Reduce publication size.');
      if (node.type === 'html') {
        const root = parseFragment(node.html) as unknown as HtmlNode;
        const walk = async (element: HtmlNode, depth = 0): Promise<void> => {
          if (++this.nodes > (this.context.maxNodes ?? 200_000) || depth > 100) fail('MB_SCHEMA', 'HTML output exceeds structural limits', 'Reduce publication size.');
          if (element.attrs) for (const attr of element.attrs) {
            if (['src', 'href', 'poster'].includes(attr.name)) attr.value = await this.url(attr.value, attr.name === 'href' ? 'link' : 'resource');
            if (attr.name === 'srcset') attr.value = (await Promise.all(attr.value.split(',').map(async (candidate) => { const [url, size] = candidate.trim().split(/\s+/, 2); return `${await this.url(url ?? '', 'resource')}${size ? ` ${size}` : ''}`; }))).join(', ');
          }
          for (const child of element.childNodes ?? []) await walk(child, depth + 1);
        };
        await walk(root);
        result.push({ type: 'html', html: sanitizeOutput(serialize(root as never)) });
      } else if (node.type === 'image' || node.type === 'media') result.push({ ...node, src: await this.url(node.src, 'resource') });
      else if (node.type === 'layout' || node.type === 'callout') result.push({ ...node, children: await this.rewrite(node.children) });
      else if (node.type === 'tabs' || node.type === 'accordion') result.push({ ...node, panels: await Promise.all(node.panels.map(async (panel) => ({ ...panel, children: await this.rewrite(panel.children) }))) });
      else if ('poster' in node && node.poster) result.push({ ...node, poster: await this.url(node.poster, 'resource') });
      else result.push(node);
    }
    return result;
  }
}
export async function collectAssets(nodes: MarimoNode[], context: AssetContext): Promise<CollectedAssets> {
  const collector = new AssetCollector(context);
  return { nodes: await collector.rewrite(nodes), bytes: collector.bytes, assets: collector.assets, diagnostics: collector.diagnostics };
}
