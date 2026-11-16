import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssetCollector } from '../src/node/assets.js';
import { writeBuild, readDocument, verifyBuild } from '../src/node/write.js';
import { createHash } from 'node:crypto';
import type { MarimoDocument } from '../src/types.js';

const temps: string[] = [];
async function temp(): Promise<string> { const path = await mkdtemp(join(tmpdir(), 'mb-test-')); temps.push(path); return path; }
afterEach(async () => { for (const dir of temps.splice(0)) await rm(dir, { recursive: true, force: true }); });
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
function fixture(): { document: MarimoDocument; assets: Map<string, Uint8Array> } {
  const hash = sha('hello');
  const path = `${hash}.png`;
  return { document: { schemaVersion: 1, metadata: { slug: 'post', title: 'Post', date: '2025-11-25', description: 'Example' }, provenance: { exporterVersion: '0.25.1', notebookVersion: '1', sessionVersion: '1', inputSha256: sha('html'), publicationConfigSha256: sha('config'), producerVersion: '0.1.0', sourceHashes: {} }, assetBase: '/posts/post/assets', cells: [], toc: [], plainText: '', assets: [{ path, sha256: hash, mime: 'image/png', bytes: 5 }], diagnostics: [] }, assets: new Map([[path, Buffer.from('hello')]]) };
}
describe('safe content-addressed publication', () => {
  it('deduplicates data URLs, enforces budgets and never resolves unreviewed resources', async () => {
    const collector = new AssetCollector({ files: {}, assetBase: '/assets', maxAssetBytes: 6 });
    expect(await collector.url('data:image/png;base64,aGVsbG8=', 'resource')).toBe(await collector.url('data:image/png;base64,aGVsbG8=', 'resource'));
    expect(collector.assets).toHaveLength(1);
    await expect(collector.url('data:image/png;base64,aGVsbG8gd29ybGQ=', 'resource')).rejects.toThrow(/limit/);
    await expect(collector.url('https://unknown.invalid/photo.png', 'resource')).rejects.toThrow(/MB_UNSAFE_URL/);
    await expect(collector.url('../secret.png', 'resource')).rejects.toThrow(/MB_ASSET_MISSING|MB_UNSAFE_URL/);
    await expect(collector.url('/@file/absent', 'resource')).rejects.toThrow(/MB_ASSET_MISSING/);
  });
  it('preserves HTML roles through recursive URL rewriting and sanitization', async () => {
    const collector = new AssetCollector({ files: {}, assetBase: '/assets' });
    const nodes = await collector.rewrite([{ type: 'callout', kind: 'note', children: [{ type: 'html', role: 'result', html: '<p onclick="bad()"><img src="data:image/png;base64,aGVsbG8="></p>' }, { type: 'html', html: '<p>Unmarked</p>' }] }]);
    expect(nodes).toMatchObject([{ type: 'callout', children: [{ type: 'html', role: 'result', html: expect.stringMatching(/src="\/assets\/[a-f0-9]{64}\.png"/) }, { type: 'html', html: '<p>Unmarked</p>' }] }]);
    expect(JSON.stringify(nodes)).not.toContain('onclick');
    const callout = nodes[0]!;
    if (callout.type !== 'callout') throw Error('Expected callout');
    expect(callout.children[1]).not.toHaveProperty('role');
  });
  it('rejects symlinks and confines public assets', async () => {
    const root = await temp();
    await mkdir(join(root, 'public'));
    await writeFile(join(root, 'secret'), 'private');
    await symlink(join(root, 'secret'), join(root, 'public', 'link.png'));
    const collector = new AssetCollector({ files: {}, assetBase: '/assets', publicDir: join(root, 'public') });
    await expect(collector.url('public/link.png', 'resource')).rejects.toThrow(/MB_UNSAFE_URL/);
    await expect(collector.url('public/../secret', 'resource')).rejects.toThrow(/MB_UNSAFE_URL/);
  });
  it('rejects active SVG bytes and keeps safe vector geometry', async () => {
    const collector = new AssetCollector({ files: {}, assetBase: '/assets' });
    const safe = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M0 0L20 20" stroke="black"></path></svg>';
    expect(collector.add(Buffer.from(safe), 'image/svg+xml')).toMatch(/\.svg$/);
    for (const svg of ['<svg><script>alert(1)</script></svg>', '<svg onload="alert(1)"></svg>', '<svg><use href="https://evil.invalid/x.svg#id"/></svg>', '<svg><foreignObject><iframe src="https://evil.invalid"/></foreignObject></svg>', '<svg><rect style="fill:url(https://evil.invalid/a)"/></svg>', '<svg><image href="https://evil.invalid/a.png"/></svg>', '<svg><a href="javascript:alert(1)"><rect onclick="x()"/></a></svg>']) {
      expect(() => collector.add(Buffer.from(svg), 'image/svg+xml')).toThrow(/MB_UNSAFE_URL/);
    }
    expect(Buffer.from([...collector.bytes.values()][0]!).toString()).toContain('viewBox="0 0 20 20"');
  });

  it('sanitizes real matplotlib SVG, keeping its inline styles and raster', async () => {
    const collector = new AssetCollector({ files: {}, assetBase: '/assets' });
    collector.add(await readFile(new URL('./fixtures/svg/matplotlib.svg', import.meta.url)), 'image/svg+xml');
    const stored = Buffer.from([...collector.bytes.values()][0]!).toString();
    expect(stored).not.toContain('<metadata');
    expect(stored).not.toContain('<style');
    expect(stored).toContain('style="fill:');
    expect(stored).toContain('data:image/png;base64,');
    expect(collector.diagnostics).toHaveLength(1);
    expect(collector.diagnostics[0]).toMatchObject({ code: 'MB_SVG_SANITIZED', severity: 'warning' });
    expect(collector.diagnostics[0]!.message).toMatch(/element metadata.*element style/);
  });

  it('sanitizes real graphviz SVG by unwrapping links and dropping classes', async () => {
    const collector = new AssetCollector({ files: {}, assetBase: '/assets' });
    collector.add(await readFile(new URL('./fixtures/svg/graphviz.svg', import.meta.url)), 'image/svg+xml');
    const stored = Buffer.from([...collector.bytes.values()][0]!).toString();
    expect(stored).not.toContain('<a ');
    expect(stored).not.toContain('class=');
    expect(stored).toContain('<text');
    expect(collector.diagnostics[0]!.message).toMatch(/attribute class.*element a/);
  });

  it('bounds virtual references and charges duplicate assets only once', async () => {
    const collector = new AssetCollector({ files: { '/@file/a': '/@file/b', '/@file/b': '/@file/a' }, assetBase: '/assets', maxOutputBytes: 5 });
    const uri = 'data:image/png;base64,aGVsbG8=';
    expect(await collector.url(uri, 'resource')).toBe(await collector.url(uri, 'resource'));
    await expect(collector.url('/@file/a', 'resource')).rejects.toThrow(/Cyclic/);
    const limited = new AssetCollector({ files: {}, assetBase: '/assets', maxNodes: 3 });
    await expect(limited.rewrite([{ type: 'html', html: '<div><p>one</p><p>two</p></div>' }])).rejects.toThrow(/structural limits/);
  });

  it('locks, owns, verifies and preserves the previous manifest on a failed second write', async () => {
    const root = await temp();
    const assetsDir = join(root, 'assets');
    const documentPath = join(root, 'post.marimo.json');
    const original = fixture();
    await writeBuild(original, { documentPath, assetsDir, ownerId: 'post.marimo.json' });
    expect(await readDocument(documentPath)).toEqual(original.document);
    expect(await verifyBuild(original.document, { assetsDir, expectedAssetBase: '/posts/post/assets', ownerId: 'post.marimo.json' })).toEqual([]);
    expect((await verifyBuild(original.document, { assetsDir, expectedAssetBase: '/wrong' })).map((item) => item.code)).toContain('MB_ASSET_MISSING');
    await expect(writeBuild(original, { documentPath: join(root, 'other.json'), assetsDir, ownerId: 'other.json' })).rejects.toThrow(/another publication/);
    expect(await readDocument(documentPath)).toEqual(original.document);
    await writeFile(join(assetsDir, '.marimo-blog.lock'), 'active');
    await expect(writeBuild(original, { documentPath, assetsDir, ownerId: 'post.marimo.json' })).rejects.toThrow(/MB_OUTPUT_BUSY/);
    await rm(join(assetsDir, '.marimo-blog.lock'));
    const corrupt = fixture(); corrupt.assets.set(corrupt.document.assets[0]!.path, Buffer.from('changed'));
    await expect(writeBuild(corrupt, { documentPath, assetsDir, ownerId: 'post.marimo.json' })).rejects.toThrow(/Invalid asset/);
    expect(await readFile(documentPath, 'utf8')).toContain('"slug": "post"');
    expect(await verifyBuild(original.document, { assetsDir, expectedAssetBase: '/posts/post/assets' })).toEqual([]);
  });
});
