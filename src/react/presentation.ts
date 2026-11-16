import type { MarimoCell, MarimoDocument, MarimoNode } from '../types.js';
import { countHtmlCodeBlocks } from './HtmlOutput.js';

export type PresentationKind = 'code' | 'results' | 'logs' | 'warnings' | 'errors';
export interface MarimoPresentationOptions {
  contents?: 'auto' | 'expanded' | 'collapsed';
  results?: 'expanded' | 'collapsed';
  codeBlocks?: 'expanded' | 'collapsed';
  logs?: 'expanded' | 'collapsed';
  warnings?: 'expanded' | 'collapsed';
  errors?: 'expanded' | 'collapsed';
}
export type ResolvedPresentation = Required<MarimoPresentationOptions>;
export interface PresentationInventory {
  categories: Record<PresentationKind, { total: number; expanded: number }>;
  contents: boolean;
}

export function resolvePresentation(options: MarimoPresentationOptions = {}): ResolvedPresentation {
  return {
    contents: options.contents ?? 'auto', results: options.results ?? 'expanded',
    codeBlocks: options.codeBlocks ?? 'expanded', logs: options.logs ?? 'collapsed',
    warnings: options.warnings ?? 'collapsed', errors: options.errors ?? 'collapsed',
  };
}

export function sourceVisibility(cell: MarimoCell, code: MarimoCell['code'] = 'folded'): MarimoCell['code'] {
  return cell.code === 'hidden' || cell.hideCode ? 'hidden' : code === 'folded' ? cell.code : code;
}

export function classifyNode(node: MarimoNode): PresentationKind | 'narrative' | 'mixed' | 'protected' {
  switch (node.type) {
    case 'html': return 'role' in node && node.role === 'result' ? 'results' : 'narrative';
    case 'math': return 'narrative';
    case 'code': return 'code';
    case 'text': return node.stream === 'stderr' ? 'warnings' : node.stream === 'stdout' ? 'logs' : 'results';
    case 'callout': return 'mixed';
    case 'layout': case 'tabs': case 'accordion': return 'mixed';
    case 'error': case 'unsupported': case 'runtime-required': return 'protected';
    default: return 'results';
  }
}

/** Plain-text results with no content (artifacts compiled before empty results were dropped). */
export function isEmptyResult(node: MarimoNode): boolean {
  return node.type === 'text' && !node.stream && node.text.trim() === '';
}

export interface PresentationRun { nodes: MarimoNode[]; kind: 'logs' | 'warnings' | undefined }
/** Coalesce only adjacent captured streams, never regroup non-adjacent records. */
export function presentationRuns(nodes: MarimoNode[], console = false): PresentationRun[] {
  const runs: PresentationRun[] = [];
  for (const node of nodes) {
    if (!console && isEmptyResult(node)) continue;
    // Unlabelled text captured on the console channel is a log, not a result.
    const kind = node.type === 'text' ? node.stream === 'stderr' ? 'warnings' : node.stream === 'stdout' || console ? 'logs' : undefined : undefined;
    const previous = runs.at(-1);
    if (kind && previous?.kind === kind) previous.nodes.push(node);
    else runs.push({ kind, nodes: [node] });
  }
  return runs;
}

export function getPresentationInventory(document: MarimoDocument, code: MarimoCell['code'] = 'folded', options: MarimoPresentationOptions = {}): PresentationInventory {
  const settings = resolvePresentation(options);
  const inventory: PresentationInventory = {
    categories: { code: { total: 0, expanded: 0 }, results: { total: 0, expanded: 0 }, logs: { total: 0, expanded: 0 }, warnings: { total: 0, expanded: 0 }, errors: { total: 0, expanded: 0 } },
    contents: document.toc.length > 0,
  };
  const add = (kind: PresentationKind, open: boolean, count = 1) => {
    inventory.categories[kind].total += count;
    if (open) inventory.categories[kind].expanded += count;
  };
  const sequence = (nodes: MarimoNode[], consoleVisible = false, console = false): void => {
    for (const run of presentationRuns(nodes, console)) {
      if (run.kind) add(run.kind, settings[run.kind] === 'expanded' || (run.kind === 'logs' && consoleVisible));
      else run.nodes.forEach((node) => visit(node, consoleVisible));
    }
  };
  const visit = (node: MarimoNode, consoleVisible = false): void => {
    if (isEmptyResult(node)) return;
    switch (node.type) {
      case 'layout': case 'callout': sequence(node.children, consoleVisible); return;
      case 'tabs': case 'accordion': node.panels.forEach((panel) => sequence(panel.children, consoleVisible)); return;
      case 'error': if (node.traceback.length) add('errors', settings.errors === 'expanded'); return;
      case 'unsupported': case 'runtime-required': return;
      case 'html':
        if (classifyNode(node) === 'results') add('results', settings.results === 'expanded');
        else add('code', settings.codeBlocks === 'expanded', countHtmlCodeBlocks(node.html));
        return;
      case 'math': return;
      case 'code': add('code', settings.codeBlocks === 'expanded'); return;
      case 'text': {
        const kind = classifyNode(node) as 'results' | 'logs' | 'warnings';
        add(kind, settings[kind] === 'expanded' || (kind === 'logs' && consoleVisible)); return;
      }
      default: add('results', settings.results === 'expanded');
    }
  };
  for (const cell of document.cells) {
    const visibility = sourceVisibility(cell, code);
    if (cell.source !== undefined && visibility !== 'hidden') add('code', visibility === 'visible');
    sequence(cell.outputs);
    if (cell.console !== 'hidden') sequence(cell.consoleOutputs, cell.console === 'visible' && options.logs === undefined, true);
  }
  return inventory;
}
