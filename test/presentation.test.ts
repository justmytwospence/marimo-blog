import { describe, expect, it } from 'vitest';
import type { MarimoCell, MarimoDocument, MarimoNode } from '../src/types.js';
import { classifyNode, getPresentationInventory, presentationRuns, resolvePresentation, sourceVisibility } from '../src/react/presentation.js';

const cell = (overrides: Partial<MarimoCell> = {}): MarimoCell => ({ id: 'a', ordinal: 0, source: 'x = 1', sourceLanguage: 'python', hideCode: false, disabled: false, code: 'folded', console: 'collapsed', outputs: [], consoleOutputs: [], ...overrides });
const doc = (cells: MarimoCell[]): MarimoDocument => ({
  schemaVersion: 1, metadata: { slug: 's', title: 'T', date: '2025-01-01', description: 'd' },
  provenance: { exporterVersion: '0.25.2', notebookVersion: '1', sessionVersion: '1', inputSha256: 'a'.repeat(64), publicationConfigSha256: 'b'.repeat(64), producerVersion: '0.1.0', sourceHashes: {} },
  assetBase: '/a', cells, toc: [], plainText: '', assets: [], diagnostics: [],
});

describe('presentation contract', () => {
  it('defaults to a reading-first view', () => {
    expect(resolvePresentation()).toEqual({ contents: 'auto', results: 'expanded', codeBlocks: 'expanded', logs: 'collapsed', warnings: 'collapsed', errors: 'collapsed' });
  });

  it('protects narrative and never fabricates warning semantics', () => {
    expect(classifyNode({ type: 'html', html: '<p>Prose</p>' })).toBe('narrative');
    expect(classifyNode({ type: 'html', html: '<p>x</p>', role: 'result' })).toBe('results');
    expect(classifyNode({ type: 'math', source: 'x', html: '<math></math>', display: true })).toBe('narrative');
    expect(classifyNode({ type: 'text', text: 'Warning: looks like one', stream: 'stdout' })).toBe('logs');
    expect(classifyNode({ type: 'text', text: 'plain', stream: 'stderr' })).toBe('warnings');
    expect(classifyNode({ type: 'error', name: 'E', message: 'm', traceback: [] })).toBe('protected');
    expect(classifyNode({ type: 'callout', kind: 'info', children: [] })).toBe('mixed');
  });

  it('treats authored callouts as visible narrative', () => {
    const error: MarimoNode = { type: 'error', name: 'E', message: 'm', traceback: [] };
    const warning: MarimoNode = { type: 'callout', kind: 'warn', children: [{ type: 'html', html: '<p>a</p>' }, error, { type: 'html', html: '<p>b</p>' }] };
    expect(classifyNode(warning)).toBe('mixed');
    const { categories } = getPresentationInventory(doc([cell({ source: undefined, outputs: [warning] })]));
    expect(categories.warnings.total).toBe(0);
    expect(categories.errors.total).toBe(0);
  });

  it('ignores empty plain-text results', () => {
    const empty = { type: 'text', text: '' } as MarimoNode;
    expect(getPresentationInventory(doc([cell({ source: undefined, outputs: [empty] })])).categories.results.total).toBe(0);
    expect(presentationRuns([empty])).toEqual([]);
  });
  it('coalesces only adjacent streams in original order', () => {
    const runs = presentationRuns([
      { type: 'text', text: '1', stream: 'stdout' }, { type: 'text', text: '2', stream: 'stdout' },
      { type: 'text', text: '3', stream: 'stderr' }, { type: 'text', text: '4', stream: 'stdout' },
    ]);
    expect(runs.map((run) => [run.kind, run.nodes.length])).toEqual([['logs', 2], ['warnings', 1], ['logs', 1]]);
  });

  it('honors source eligibility, which global controls cannot override', () => {
    expect(sourceVisibility(cell({ hideCode: true }), 'visible')).toBe('hidden');
    expect(sourceVisibility(cell({ code: 'hidden' }), 'visible')).toBe('hidden');
    expect(sourceVisibility(cell(), 'hidden')).toBe('hidden');
    expect(sourceVisibility(cell({ code: 'visible' }))).toBe('visible');
  });

  it('inventories categories with initial expanded counts and no payloads', () => {
    const inventory = getPresentationInventory(doc([
      cell({ outputs: [{ type: 'html', html: '<p>Prose</p><pre><code>example</code></pre>' }, { type: 'plotly', asset: '/a/x.json' }], consoleOutputs: [{ type: 'text', text: 'log' }] }),
      cell({ id: 'b', hideCode: true, outputs: [{ type: 'error', name: 'E', message: 'm', traceback: ['t'] }] }),
    ]));
    expect(inventory.categories).toEqual({
      code: { total: 2, expanded: 1 }, results: { total: 1, expanded: 1 }, logs: { total: 1, expanded: 0 },
      warnings: { total: 0, expanded: 0 }, errors: { total: 1, expanded: 0 },
    });
    expect(JSON.stringify(inventory)).not.toContain('x = 1');
  });
});
