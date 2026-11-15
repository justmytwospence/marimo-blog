import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 300_000 });
  if (result.status !== 0) throw Error(`${command} ${args.join(' ')} failed (${result.status}): ${result.stdout}`);
  return result.stdout;
}
const root = process.cwd();
const temp = await mkdtemp(join(tmpdir(), 'marimo-blog-examples-'));
try {
  run('npm', ['run', 'build'], root);
  const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', temp], root));
  for (const example of ['showcase', 'next']) {
    const cwd = join(root, 'examples', example);
    run('npm', ['install', '--no-package-lock', '--no-save', '--no-audit', '--no-fund', join(temp, packed[0].filename)], cwd);
    run('npm', ['run', 'build'], cwd);
  }
} finally { await rm(temp, { recursive: true, force: true }); }
