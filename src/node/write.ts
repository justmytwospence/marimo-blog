import { createHash } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseFragment } from 'parse5';
import { diagnostic, fail } from '../diagnostics.js';
import { parseDocument } from '../schema.js';
import type { MarimoDiagnostic, MarimoDocument } from '../types.js';
import type { BuildResult } from './compile.js';
import { safeAssetBase } from './sanitize.js';

export interface WriteOptions { documentPath: string; assetsDir: string; ownerId: string }
interface Owner { ownerId: string; owned: string[] }
const ownerFile = '_marimo-blog-owner.json';
export async function writeBuild(result: BuildResult, options: WriteOptions): Promise<void> {
  if (!options.ownerId || options.ownerId.startsWith('/') || options.ownerId.includes('..')) fail('MB_SCHEMA', 'Invalid publication ownerId', 'Use a stable relative publication key.');
  parseDocument(result.document);
  await mkdir(options.assetsDir, { recursive: true });
  const lockPath = join(options.assetsDir, '.marimo-blog.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch { fail('MB_OUTPUT_BUSY', 'Asset directory is locked', 'Wait for the other publication write to complete.'); }
  const tempPaths: string[] = [];
  try {
    const ownershipPath = join(options.assetsDir, ownerFile);
    let old: Owner | undefined;
    try { old = JSON.parse(await readFile(ownershipPath, 'utf8')) as Owner; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (old && old.ownerId !== options.ownerId) fail('MB_SCHEMA', 'Asset directory belongs to another publication', 'Choose a separate asset directory.');
    if (!old && (await readdir(options.assetsDir)).some((name) => name !== '.marimo-blog.lock')) fail('MB_SCHEMA', 'Refusing a nonempty unowned asset directory', 'Choose an empty dedicated asset directory.');
    const files = new Set(result.document.assets.map((item) => item.path));
    if (files.size !== result.document.assets.length || files.size !== result.assets.size) fail('MB_SCHEMA', 'Asset inventory differs from bytes', 'Recompile before writing.');
    for (const item of result.document.assets) {
      const bytes = result.assets.get(item.path);
      if (!bytes || !/^[a-f0-9]{64}\.[a-z0-9]+$/.test(item.path) || createHash('sha256').update(bytes).digest('hex') !== item.sha256 || bytes.byteLength !== item.bytes) fail('MB_SCHEMA', `Invalid asset ${item.path}`, 'Recompile before writing.');
      const target = join(options.assetsDir, item.path);
      const staged = `${target}.${randomUUID()}.tmp`;
      await writeFile(staged, bytes, { flag: 'wx' }); tempPaths.push(staged);
      await rename(staged, target);
    }
    await mkdir(dirname(options.documentPath), { recursive: true });
    const documentTemp = `${options.documentPath}.${randomUUID()}.tmp`;
    await writeFile(documentTemp, JSON.stringify(result.document, null, 2) + '\n', { flag: 'wx' }); tempPaths.push(documentTemp);
    const ownerTemp = `${ownershipPath}.${randomUUID()}.tmp`;
    await writeFile(ownerTemp, JSON.stringify({ ownerId: options.ownerId, owned: [...files].sort() }, null, 2) + '\n', { flag: 'wx' }); tempPaths.push(ownerTemp);
    await rename(documentTemp, options.documentPath);
    await rename(ownerTemp, ownershipPath);
    for (const path of old?.owned ?? []) if (!files.has(path) && /^[a-f0-9]{64}\.[a-z0-9]+$/.test(path)) await rm(join(options.assetsDir, path), { force: true });
  } finally {
    for (const path of tempPaths) await rm(path, { force: true });
    await lock.close(); await rm(lockPath, { force: true });
  }
}
export async function readDocument(path: string): Promise<MarimoDocument> { return parseDocument(JSON.parse(await readFile(path, 'utf8')) as unknown); }
export async function verifyBuild(document: MarimoDocument, options: { assetsDir: string; expectedAssetBase: string; ownerId?: string }): Promise<MarimoDiagnostic[]> {
  const diagnostics: MarimoDiagnostic[] = [];
  try { parseDocument(document); }
  catch { return [diagnostic('MB_SCHEMA', 'Invalid document manifest', 'Rebuild the document.')]; }
  if (document.assetBase !== safeAssetBase(options.expectedAssetBase)) diagnostics.push(diagnostic('MB_ASSET_MISSING', 'Document asset base does not match deployed public path', 'Rebuild with the correct --asset-base.'));
  let owner: Owner | undefined;
  try { owner = JSON.parse(await readFile(join(options.assetsDir, ownerFile), 'utf8')) as Owner; }
  catch { diagnostics.push(diagnostic('MB_ASSET_MISSING', 'Missing asset ownership manifest', 'Rebuild into a dedicated asset directory.')); }
  if (options.ownerId && owner?.ownerId !== options.ownerId) diagnostics.push(diagnostic('MB_SCHEMA', 'Publication owner does not match', 'Use the directory belonging to this document.'));
  for (const asset of document.assets) {
    try {
      if (!owner?.owned.includes(asset.path) || !/^[a-f0-9]{64}\.[a-z0-9]+$/.test(asset.path)) throw Error('not owned');
      const file = join(options.assetsDir, asset.path);
      const info = await stat(file);
      const bytes = await readFile(file);
      if (!info.isFile() || bytes.byteLength !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw Error('digest mismatch');
    } catch { diagnostics.push(diagnostic('MB_ASSET_MISSING', `Missing or changed asset ${asset.path}`, 'Rebuild and commit its matching assets.')); }
  }
  const anchors = new Set(document.toc.map((entry) => entry.id));
  const references: { id: string; cellId: string }[] = [];
  type HtmlNode = { attrs?: { name: string; value: string }[]; childNodes?: HtmlNode[] };
  for (const cell of document.cells) for (const node of cell.outputs) if (node.type === 'html') {
    const walk = (element: HtmlNode): void => {
      for (const attr of element.attrs ?? []) {
        if (attr.name === 'id') anchors.add(attr.value);
        if (attr.name === 'href' && attr.value.startsWith('#')) references.push({ id: attr.value.slice(1), cellId: cell.id });
      }
      for (const child of element.childNodes ?? []) walk(child);
    };
    walk(parseFragment(node.html) as unknown as HtmlNode);
  }
  for (const reference of references) if (!anchors.has(reference.id)) diagnostics.push({ ...diagnostic('MB_UNSAFE_URL', `Unresolved local anchor #${reference.id}`, 'Correct the heading or link.', reference.cellId), severity: 'warning' });
  diagnostics.push(...document.diagnostics.filter((item) => item.severity === 'error'));
  return diagnostics;
}
