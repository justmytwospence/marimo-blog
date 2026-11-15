import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { parse } from 'parse5';
import { fail } from '../diagnostics.js';
import { safeAssetBase } from './sanitize.js';
import { readExportGlobals } from './import-html.js';
import type { InteractiveDescriptor } from '../types.js';

type HtmlNode = { nodeName: string; attrs?: { name: string; value: string }[]; childNodes?: HtmlNode[] };
export interface WasmFile { path: string; bytes: number; sha256: string; kind: 'runtime' | 'public'; publish: boolean }
export interface WasmInventory { exporterVersion: string; sourceSha256: string; files: WasmFile[] }
const sha = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
async function files(root: string, dir = ''): Promise<string[]> {
  const result: string[] = [];
  for (const name of await readdir(join(root, dir))) {
    if (name.startsWith('.') || /^(?:\.env|id_rsa|credentials)(?:\.|$)/i.test(name)) fail('MB_UNSAFE_URL', `Hidden or environment file ${name} in WASM export`, 'Remove private files before inventory.');
    const path = dir ? `${dir}/${name}` : name;
    const stat = await lstat(join(root, path));
    if (stat.isSymbolicLink()) fail('MB_UNSAFE_URL', `Symlink in WASM export: ${path}`, 'Export only regular files.');
    if (stat.isDirectory()) result.push(...await files(root, path));
    else if (stat.isFile()) result.push(path);
    else fail('MB_UNSAFE_URL', `Non-file in WASM export: ${path}`, 'Remove unsupported filesystem entries.');
  }
  return result.sort();
}
export async function inspectWasm(directory: string): Promise<WasmInventory> {
  const paths = await files(directory);
  if (!paths.includes('index.html')) fail('MB_SCHEMA', 'WASM export has no index.html', 'Supply an official marimo directory export.');
  const html = await readFile(join(directory, 'index.html'), 'utf8');
  const { found, code } = readExportGlobals(html);
  const mount = found.get('__MARIMO_MOUNT_CONFIG__') as Record<string, unknown> | undefined;
  if (!mount || !['0.25.0', '0.25.1', '0.25.2'].includes(String(mount.version)) || !code) fail('MB_EXPORT_VERSION', 'Missing source or unsupported marimo WASM export', 'Export WASM with marimo 0.25.0–0.25.2 and source included.');
  return { exporterVersion: String(mount.version), sourceSha256: sha(code.replace(/\r\n/g, '\n')), files: await Promise.all(paths.map(async (path) => { const bytes = await readFile(join(directory, path)); return { path, bytes: bytes.byteLength, sha256: sha(bytes), kind: path.startsWith('public/') ? 'public' as const : 'runtime' as const, publish: false }; })) };
}
function references(html: string): string[] {
  const tree = parse(html) as unknown as HtmlNode;
  const found: string[] = [];
  const visit = (node: HtmlNode): void => {
    for (const attr of node.attrs ?? []) {
      if (!['src', 'href', 'poster'].includes(attr.name)) continue;
      const value = attr.value;
      if (!value || value.startsWith('#') || value.startsWith('data:') || /^(?:https?:)?\/\//.test(value)) continue;
      const url = new URL(value, 'https://marimo-blog.invalid/');
      if (url.origin !== 'https://marimo-blog.invalid' || /%2f|%5c|%2e|\\/i.test(value)) fail('MB_UNSAFE_URL', `Invalid WASM reference ${value}`, 'Use local, safe runtime paths.');
      const path = decodeURIComponent(url.pathname).replace(/^\//, '');
      if (path) found.push(path);
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(tree);
  return found;
}
export async function importWasm(directory: string, reviewed: WasmInventory, out: string, baseUrl: string): Promise<InteractiveDescriptor> {
  const base = safeAssetBase(baseUrl);
  const actual = await inspectWasm(directory);
  const expectedPaths = new Set(actual.files.map((file) => file.path));
  if (reviewed.exporterVersion !== actual.exporterVersion || reviewed.sourceSha256 !== actual.sourceSha256 || reviewed.files.length !== actual.files.length) fail('MB_SCHEMA', 'WASM inventory changed after review', 'Review a new inventory before publishing.');
  const seen = new Set<string>();
  for (const file of reviewed.files) {
    const original = actual.files.find((item) => item.path === file.path);
    if (seen.has(file.path) || !original || !expectedPaths.has(file.path) || file.sha256 !== original.sha256 || file.bytes !== original.bytes || typeof file.publish !== 'boolean' || file.kind !== original.kind) fail('MB_SCHEMA', `WASM file changed or omitted: ${file.path}`, 'Review a new inventory before publishing.');
    seen.add(file.path);
  }
  const approved = new Set(reviewed.files.filter((file) => file.publish).map((file) => file.path));
  if (!approved.has('index.html')) fail('MB_SCHEMA', 'WASM index.html was not approved', 'Explicitly approve the entry document.');
  // Exported scripts can load other chunks dynamically. Require a reviewed decision to
  // publish every runtime file rather than pretending HTML references cover that graph.
  for (const file of actual.files) if (file.kind === 'runtime' && !approved.has(file.path)) fail('MB_ASSET_MISSING', `WASM runtime file not approved: ${file.path}`, 'Review and approve every runtime file.');
  const html = await readFile(join(directory, 'index.html'), 'utf8');
  for (const path of references(html)) if (!approved.has(path)) fail('MB_ASSET_MISSING', `WASM referenced file not approved: ${path}`, 'Review and approve the referenced file.');
  const sourceDir = resolve(directory); const targetDir = resolve(out);
  const fromSource = relative(sourceDir, targetDir);
  if (!fromSource || (fromSource !== '..' && !fromSource.startsWith(`..${sep}`))) fail('MB_SCHEMA', 'WASM output must be outside source export', 'Choose a separate destination.');
  try { await lstat(targetDir); fail('MB_SCHEMA', 'WASM output already exists', 'Choose a new destination; never overwrite a reviewed export.'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await mkdir(dirname(targetDir), { recursive: true });
  const stage = await mkdtemp(join(dirname(targetDir), '.marimo-blog-wasm-'));
  const descriptor: InteractiveDescriptor = { url: `${base}/index.html`, exporterVersion: actual.exporterVersion, sourceSha256: actual.sourceSha256 };
  try {
    for (const file of reviewed.files.filter((item) => item.publish)) {
      const sourceFile = join(sourceDir, file.path);
      if (!(await lstat(sourceFile)).isFile()) fail('MB_UNSAFE_URL', `WASM source changed: ${file.path}`, 'Review a new inventory before publishing.');
      const bytes = await readFile(sourceFile);
      if (bytes.byteLength !== file.bytes || sha(bytes) !== file.sha256) fail('MB_SCHEMA', `WASM file changed while copying: ${file.path}`, 'Review a new inventory before publishing.');
      const destination = join(stage, file.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    }
    await writeFile(join(stage, 'interactive.json'), JSON.stringify(descriptor, null, 2) + '\n');
    await rename(stage, targetDir);
  } finally { await rm(stage, { recursive: true, force: true }); }
  return descriptor;
}
