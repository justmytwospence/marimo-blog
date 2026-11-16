import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../src');
const forbidden = ['sanitize-html', 'parse5', 'css-tree', 'highlight.js', 'katex', 'zod', 'yaml', 'acorn', 'csv-parse', 'node:'];

function resolveLocal(from: string, specifier: string): string | undefined {
  const base = resolve(dirname(from), specifier.replace(/\.js$/, ''));
  return ['.ts', '.tsx', '/index.ts'].map((suffix) => base + suffix).find((candidate) => existsSync(candidate));
}

describe('browser bundles', () => {
  it('client islands never reach server-only modules', () => {
    const visited = new Set<string>();
    const bare = new Set<string>();
    const queue = readdirSync(join(root, 'client')).filter((name) => /\.tsx?$/.test(name)).map((name) => join(root, 'client', name));
    while (queue.length) {
      const file = queue.pop()!;
      if (visited.has(file)) continue;
      visited.add(file);
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/^\s*(?:import|export)\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gm)) {
        if (match[1]) continue;
        const specifier = match[2] ?? match[3]!;
        if (specifier.startsWith('.')) {
          const local = resolveLocal(file, specifier);
          if (local) queue.push(local);
        } else bare.add(specifier);
      }
    }
    expect([...visited].map((file) => relative(root, file))).toContain('shared/url.ts');
    expect([...bare].filter((name) => forbidden.some((bad) => name === bad || name.startsWith(`${bad}/`) || (bad.endsWith(':') && name.startsWith(bad))))).toEqual([]);
  });
});
