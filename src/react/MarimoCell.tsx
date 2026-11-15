import type { MarimoCell as Cell } from '../types.js';
import { CodeBlock } from '../client/CodeBlock.js';
import { StaticOutput } from './StaticOutput.js';

export function MarimoCell({ cell, code }: { cell: Cell; code: 'folded' | 'visible' | 'hidden' }) {
  const visibility = cell.code === 'hidden' || cell.hideCode ? 'hidden' : code === 'folded' ? cell.code : code;
  return <section className="mb-cell" data-cell-id={cell.id} aria-label={cell.name && cell.name !== '_' ? cell.name : `Cell ${cell.ordinal + 1}`}>
    {cell.source !== undefined && visibility !== 'hidden' && <details className="mb-code-details" open={visibility === 'visible'}>
      <summary>Code</summary>
      <CodeBlock code={cell.source} language={cell.sourceLanguage} />
    </details>}
    {cell.disabled && <p className="mb-muted">This cell was disabled in the export.</p>}
    {cell.outputs.map((node, index) => <StaticOutput node={node} key={index} />)}
    {cell.consoleOutputs.length > 0 && cell.console !== 'hidden' && <details className="mb-console-details" open={cell.console === 'visible'}>
      <summary>Console output</summary>
      {cell.consoleOutputs.map((node, index) => <StaticOutput node={node} key={index} />)}
    </details>}
  </section>;
}
