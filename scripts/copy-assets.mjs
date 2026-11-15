import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import * as cssTree from 'css-tree';
await mkdir('dist', { recursive: true });
const articleCss = await readFile('src/styles.css', 'utf8');
const katexCss = await readFile('node_modules/katex/dist/katex.min.css', 'utf8');
const katexTree = cssTree.parse(katexCss);
cssTree.walk(katexTree, { visit: 'Rule', enter(rule) {
  if (rule.prelude?.type !== 'SelectorList') return;
  const selectors = [...rule.prelude.children].map((selector) => `.marimo-blog ${cssTree.generate(selector)}`).join(',');
  rule.prelude = cssTree.parse(selectors, { context: 'selectorList' });
} });
await writeFile('dist/styles.css', `${articleCss}\n/* KaTeX styles and local fonts, scoped to marimo-blog. */\n${cssTree.generate(katexTree)}\n`);
await cp('node_modules/katex/dist/fonts', 'dist/fonts', { recursive: true });
await mkdir('dist/licenses', { recursive: true });
await cp('node_modules/katex/LICENSE', 'dist/licenses/KaTeX-LICENSE');
