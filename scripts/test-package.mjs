import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 240_000 });
  if (result.status !== 0) throw Error(`${command} ${args.join(' ')} failed (${result.status}): ${result.stdout}`);
  return result.stdout;
}
const root = process.cwd();
const temp = await mkdtemp(join(tmpdir(), 'marimo-blog-package-'));
try {
  run('npm', ['run', 'build'], root);
  run('node', [join(root, 'node_modules', '.bin', 'publint')], root);
  const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', temp], root));
  const entries = packed[0].files.map((file) => file.path);
  for (const required of ['LICENSE', 'NOTICE', 'README.md', 'dist/styles.css', 'dist/index.d.ts', 'dist/react/index.js', 'dist/node/index.js']) {
    if (!entries.includes(required)) throw Error(`Missing release file: ${required}`);
  }
  if (entries.some((path) => !/^(?:dist\/|README\.md$|NOTICE$|LICENSE$|package\.json$)/.test(path))) throw Error('Unexpected private/development file in package');
  if (!entries.some((path) => path.endsWith('.woff2'))) throw Error('Missing bundled math fonts');
  const tarball = join(temp, packed[0].filename);
  const nodeDir = join(temp, 'node'); await mkdir(nodeDir);
  await writeFile(join(nodeDir, 'package.json'), '{"type":"module","private":true}');
  run('npm', ['install', '--no-audit', '--no-fund', tarball], nodeDir);
  const probe = `import { parseDocument } from 'marimo-blog'; import { importMarimoHtml } from 'marimo-blog/node'; import fs from 'node:fs'; if (!parseDocument || !importMarimoHtml || !fs.existsSync('node_modules/marimo-blog/dist/styles.css')) process.exit(1);`;
  await writeFile(join(nodeDir, 'probe.mjs'), probe);
  run('node', ['probe.mjs'], nodeDir);
  for (const react of ['18.3.1', '19.2.0']) {
    const dir = join(temp, `react-${react}`); await mkdir(dir);
    await writeFile(join(dir, 'package.json'), '{"type":"module","private":true}');
    run('npm', ['install', '--no-audit', '--no-fund', tarball, `react@${react}`, `react-dom@${react}`, `@types/react@${react.split('.')[0]}`, `@types/react-dom@${react.split('.')[0]}`], dir);
    await writeFile(join(dir, 'probe.tsx'), `import { MarimoArticle } from 'marimo-blog/react'; import { parseDocument, type MarimoDocument } from 'marimo-blog'; import { compileSnapshot, type OutputAdapter } from 'marimo-blog/node'; const document: MarimoDocument = parseDocument({}); const element = <MarimoArticle document={document} />; const adapter: OutputAdapter = {name:'test', exporterVersions:['0.25.1'], matches:()=>false, compile:()=>[]}; void [element,adapter,compileSnapshot];`);
    run('node', [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '--strict', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--jsx', 'react-jsx', 'probe.tsx'], dir);
    await writeFile(join(dir, 'probe.mjs'), `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { MarimoArticle } from 'marimo-blog/react'; if (!renderToStaticMarkup(React.createElement(MarimoArticle, {document: {schemaVersion:1, metadata:{slug:'smoke',title:'Smoke',date:'2025-11-25',description:'Smoke'}, provenance:{exporterVersion:'0.25.1',notebookVersion:'1',sessionVersion:'1',inputSha256:'a'.repeat(64),publicationConfigSha256:'b'.repeat(64),producerVersion:'0.1.0',sourceHashes:{}},assetBase:'/assets',cells:[],toc:[],plainText:'',assets:[],diagnostics:[]}})).includes('Smoke')) process.exit(1);`);
    run('node', ['probe.mjs'], dir);
  }
  const nextDir = join(temp, 'next');
  await mkdir(join(nextDir, 'app'), { recursive: true });
  await writeFile(join(nextDir, 'package.json'), '{"type":"module","private":true,"scripts":{"build":"next build"}}');
  run('npm', ['install', '--no-audit', '--no-fund', tarball, 'react@19.2.0', 'react-dom@19.2.0', 'next@^16.0.0'], nextDir);
  await writeFile(join(nextDir, 'app', 'layout.jsx'), `import 'marimo-blog/styles.css'; export default function Layout({children}) { return <html><body>{children}</body></html> }`);
  await writeFile(join(nextDir, 'app', 'page.jsx'), `import { MarimoArticle } from 'marimo-blog/react'; const document = { schemaVersion:1, metadata:{slug:'smoke',title:'Smoke',date:'2025-11-25',description:'Smoke'}, provenance:{exporterVersion:'0.25.1',notebookVersion:'1',sessionVersion:'1',inputSha256:'a'.repeat(64),publicationConfigSha256:'b'.repeat(64),producerVersion:'0.1.0',sourceHashes:{}},assetBase:'/assets',cells:[],toc:[],plainText:'',assets:[],diagnostics:[] }; export default function Page(){ return <MarimoArticle document={document}/> }`);
  run('npm', ['run', 'build'], nextDir);
  console.log('Tarball inventory, publint, Node ESM, React 18/19 types/SSR and Next 16 build passed.');
} finally { await rm(temp, { recursive: true, force: true }); }
