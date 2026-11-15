import type { MarimoCell as Cell } from '../types.js';
import { CodeBlock } from './CodeBlock.js';
import { lineLabel, resolveLanguage } from './code.js';
import { Disclosure } from '../client/Disclosure.js';
import { OutputSequence } from './StaticOutput.js';
import { resolvePresentation, sourceVisibility, type MarimoPresentationOptions } from './presentation.js';

export function MarimoCell({ cell, code = 'folded', presentation }: { cell: Cell; code?: 'folded' | 'visible' | 'hidden'; presentation?: MarimoPresentationOptions }) {
  const settings = resolvePresentation(presentation);
  const visibility = sourceVisibility(cell, code);
  const showSource = cell.source !== undefined && visibility !== 'hidden';
  const showConsole = cell.consoleOutputs.length > 0 && cell.console !== 'hidden';
  if (!showSource && !cell.disabled && !cell.outputs.length && !showConsole) return null;
  const qualifier = cell.name && cell.name !== '_' ? cell.name : `Cell ${cell.ordinal + 1}`;
  return <section className="mb-cell" data-cell-id={cell.id} aria-label={qualifier}>
    {cell.disabled && <p className="mb-muted">This cell was disabled in the export.</p>}
    <OutputSequence nodes={cell.outputs} presentation={settings} qualifier={qualifier} />
    {showConsole && <OutputSequence console nodes={cell.consoleOutputs} presentation={settings} qualifier={qualifier}
      consoleVisible={cell.console === 'visible' && presentation?.logs === undefined} />}
    {showSource && <Disclosure kind="code" variant="source" defaultOpen={visibility === 'visible'} preview={lineLabel(cell.source!)} label={<>{resolveLanguage(cell.sourceLanguage, 'python').label}<span className="mb-sr-only"> source — {qualifier}</span></>}>
      <CodeBlock code={cell.source!} language={cell.sourceLanguage} />
    </Disclosure>}
  </section>;
}
