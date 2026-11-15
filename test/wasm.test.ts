import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectWasm, importWasm } from '../src/node/wasm.js';

describe('reviewed WASM inventory', () => {
  it('copies only approved files and rejects changed, missing and newly added entries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mb-wasm-'));
    try {
      const source = join(dir, 'export'); const out = join(dir, 'published');
      await mkdir(join(source, 'public'), { recursive: true });
      await writeFile(join(source, 'index.html'), `<html><head><script data-marimo="true">Object.defineProperty(window,"__MARIMO_MOUNT_CONFIG__",{value:Object.freeze({version:"0.25.1"}),writable:false,configurable:false});</script><marimo-code>${encodeURIComponent('print(0)\r\n')}</marimo-code><script src="./runtime.js"></script></head></html>`);
      await writeFile(join(source, 'runtime.js'), 'console.log(1)');
      await writeFile(join(source, 'public', 'private.csv'), 'secret');
      const inventory = await inspectWasm(source);
      expect(inventory.files.map((file) => [file.path, file.publish])).toEqual([['index.html', false], ['public/private.csv', false], ['runtime.js', false]]);
      await expect(importWasm(source, inventory, out, '/interact')).rejects.toThrow(/index.html/);
      const reviewed = { ...inventory, files: inventory.files.map((file) => ({ ...file, publish: file.kind !== 'public' })) };
      const missingRuntime = { ...reviewed, files: reviewed.files.map((file) => file.path === 'runtime.js' ? { ...file, publish: false } : file) };
      await expect(importWasm(source, missingRuntime, out, '/interact')).rejects.toThrow(/runtime file not approved/);
      await expect(readdir(out)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await importWasm(source, reviewed, out, '/interact')).toEqual({ url: '/interact/index.html', exporterVersion: '0.25.1', sourceSha256: inventory.sourceSha256 });
      expect(await readdir(out)).not.toContain('public');
      expect(JSON.parse(await readFile(join(out, 'interactive.json'), 'utf8'))).toHaveProperty('url', '/interact/index.html');
      await writeFile(join(source, 'runtime.js'), 'modified');
      await expect(importWasm(source, reviewed, out, '/interact')).rejects.toThrow(/changed/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
