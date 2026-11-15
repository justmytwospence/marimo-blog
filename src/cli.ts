#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { MarimoBlogError } from './index.js';
import { importMarimoHtml, compileSnapshot, readDocument, verifyBuild, writeBuild, parseMetadataYaml, hashPublicationConfig, inspectWasm, importWasm } from './node/index.js';
import type { WasmInventory } from './node/index.js';
import type { InteractiveDescriptor } from './types.js';

const usage = 'Usage: marimo-blog inspect <export.html> [--json] | build <export.html> --metadata <post.yaml> --out <post.marimo.json> --assets <directory> --asset-base <URL-path> [--public-dir <directory>] [--interactive <interactive.json>] | check <post.marimo.json> --assets <directory> --asset-base <URL-path> [--metadata <post.yaml>] | inspect-wasm <directory> --json | import-wasm <directory> --inventory <reviewed.json> --out <directory> --base-url <URL-path>';
function parseArgs(args: string[]): { command: string; target: string; flags: Record<string, string | boolean> } {
  const [command, target, ...rest] = args;
  if (!command || !target || target.startsWith('--') || !['inspect', 'build', 'check', 'inspect-wasm', 'import-wasm'].includes(command)) throw Error(usage);
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < rest.length; index++) {
    const item = rest[index]!;
    if (!item.startsWith('--') || item in flags) throw Error(usage);
    if (item === '--json') { flags[item] = true; continue; }
    if (!['--metadata', '--out', '--assets', '--asset-base', '--public-dir', '--interactive', '--inventory', '--base-url'].includes(item) || !rest[index + 1] || rest[index + 1]!.startsWith('--')) throw Error(usage);
    flags[item] = rest[++index]!;
  }
  const expected = command === 'inspect' || command === 'inspect-wasm' ? ['--json'] : command === 'build' ? ['--metadata', '--out', '--assets', '--asset-base', '--public-dir', '--interactive'] : command === 'check' ? ['--assets', '--asset-base', '--metadata'] : ['--inventory', '--out', '--base-url'];
  if (Object.keys(flags).some((key) => !expected.includes(key))) throw Error(usage);
  if ((command === 'build' && !['--metadata', '--out', '--assets', '--asset-base'].every((key) => typeof flags[key] === 'string')) || (command === 'check' && !['--assets', '--asset-base'].every((key) => typeof flags[key] === 'string')) || (command === 'import-wasm' && !['--inventory', '--out', '--base-url'].every((key) => typeof flags[key] === 'string'))) throw Error(usage);
  return { command, target, flags };
}
async function main(): Promise<void> {
  let parsed;
  try { parsed = parseArgs(process.argv.slice(2)); }
  catch { console.error(usage); process.exitCode = 2; return; }
  const { command, target, flags } = parsed;
  try {
    if (command === 'inspect-wasm') {
      const inventory = await inspectWasm(target);
      console.log(JSON.stringify(inventory, null, 2));
    } else if (command === 'import-wasm') {
      const reviewed = JSON.parse(await readFile(flags['--inventory'] as string, 'utf8')) as WasmInventory;
      console.log(JSON.stringify(await importWasm(target, reviewed, flags['--out'] as string, flags['--base-url'] as string), null, 2));
    } else if (command === 'inspect') {
      const html = await readFile(target, 'utf8');
      const snapshot = importMarimoHtml(html);
      const summary = { exporterVersion: snapshot.exporterVersion, notebookVersion: snapshot.notebook.version, cells: snapshot.notebook.cells.map((cell) => ({ id: cell.id, outputs: snapshot.session.cells.find((session) => session.id === cell.id)?.outputs.map((out) => out && typeof out === 'object' && 'data' in out && out.data && typeof out.data === 'object' ? Object.keys(out.data) : ['stream/error']) ?? [] })), bytes: Buffer.byteLength(html), hasSource: !!snapshot.source };
      console.log(flags['--json'] ? JSON.stringify(summary, null, 2) : `marimo ${summary.exporterVersion}: ${summary.cells.length} cells, ${summary.bytes} bytes\n${summary.cells.map((cell) => `${cell.id}: ${cell.outputs.flat().join(', ')}`).join('\n')}`);
    } else if (command === 'build') {
      const metadata = parseMetadataYaml(await readFile(flags['--metadata'] as string, 'utf8'));
      const snapshot = importMarimoHtml(await readFile(target, 'utf8'));
      const interactive = flags['--interactive'] ? JSON.parse(await readFile(flags['--interactive'] as string, 'utf8')) as InteractiveDescriptor : undefined;
      const result = await compileSnapshot(snapshot, { metadata, assetBase: flags['--asset-base'] as string, ...(flags['--public-dir'] ? { publicDir: flags['--public-dir'] as string } : {}), ...(interactive ? { interactive } : {}) });
      const ownerId = relative(process.cwd(), resolve(flags['--out'] as string)).replaceAll('\\', '/');
      await writeBuild(result, { documentPath: flags['--out'] as string, assetsDir: flags['--assets'] as string, ownerId });
      console.log(`Wrote ${result.document.cells.length} cells, ${result.document.assets.length} assets; owner ${ownerId}`);
    } else {
      const document = await readDocument(target);
      const ownerId = relative(process.cwd(), resolve(target)).replaceAll('\\', '/');
      const diagnostics = await verifyBuild(document, { assetsDir: flags['--assets'] as string, expectedAssetBase: flags['--asset-base'] as string, ownerId });
      if (flags['--metadata']) {
        const config = parseMetadataYaml(await readFile(flags['--metadata'] as string, 'utf8'));
        if (hashPublicationConfig(config) !== document.provenance.publicationConfigSha256) diagnostics.push({ severity: 'error', code: 'MB_STALE_CONFIG', message: 'Publication metadata changed since build', remediation: 'Rebuild the export with the new YAML.' });
      }
      for (const item of diagnostics) console.error(`${item.severity} ${item.code}: ${item.message}`);
      if (diagnostics.some((item) => item.severity === 'error')) process.exitCode = 1;
      else console.log(`Valid publication: ${document.metadata.slug}`);
    }
  } catch (error) {
    console.error(error instanceof MarimoBlogError ? error.message : error);
    process.exitCode = 1;
  }
}
void main();
