import type { ReactNode } from 'react';
import type { MarimoNode } from '../types.js';
import { Tabs } from '../client/Tabs.js';
import { Accordion } from '../client/Accordion.js';
import { PlotlyChart } from '../client/PlotlyChart.js';
import { VegaChart } from '../client/VegaChart.js';
import { DataTable } from '../client/DataTable.js';
import { JsonTree } from '../client/JsonTree.js';
import { SandboxOutput } from '../client/SandboxOutput.js';
import { CodeBlock } from './CodeBlock.js';
import { lineLabel, resolveLanguage } from './code.js';
import { FigureFrame } from '../client/FigureFrame.js';
import { Disclosure } from '../client/Disclosure.js';
import { HtmlOutput } from './HtmlOutput.js';
import { safeAssetUrl } from './safety.js';
import { isEmptyResult, presentationRuns, resolvePresentation, type MarimoPresentationOptions, type ResolvedPresentation } from './presentation.js';
import { calloutStyle } from '../shared/callout.js';

interface OutputProps { presentation?: MarimoPresentationOptions; qualifier?: string }
const sr = (qualifier?: string) => qualifier ? <span className="mb-sr-only"> — {qualifier}</span> : null;

function resultLabel(node: MarimoNode): string {
  switch (node.type) {
    case 'image': case 'media': case 'plotly': case 'vega': case 'sandbox': return 'Figure';
    case 'table': return 'Table';
    case 'json': return 'JSON';
    default: return 'Result';
  }
}
function caption(node: MarimoNode): string | undefined {
  return 'caption' in node && typeof node.caption === 'string' ? node.caption : undefined;
}

/** Raw saved content, without any reader-facing disclosure. */
function RawResult({ node }: { node: MarimoNode }) {
  switch (node.type) {
    case 'html': return <HtmlOutput html={node.html} foldCodeBlocks={false} />;
    case 'text': return <pre className="mb-output" aria-label={node.stream ?? 'Text output'}>{node.text}</pre>;
    case 'image': { const src = safeAssetUrl(node.src); return <FigureFrame caption={node.caption} state={src ? 'ready' : 'error'} fallback={<p>Image unavailable: {node.alt}</p>}>{src && <img className="mb-media" src={src} alt={node.alt} loading="lazy" />}</FigureFrame>; }
    case 'media': { const src = safeAssetUrl(node.src); return <FigureFrame caption={node.caption} state={src ? 'ready' : 'error'} fallback={<p>Media unavailable</p>}>{src && (node.mime.startsWith('audio/') ? <audio controls preload="none" src={src}>Audio unavailable</audio> : node.mime.startsWith('video/') ? <video controls preload="none" src={src}>Video unavailable</video> : <a href={src} download>Download media</a>)}</FigureFrame>; }
    case 'statistic': return <div className="mb-output mb-notice"><span>{node.label}</span><strong> {node.value}</strong>{node.caption && <p className="mb-caption">{node.caption}</p>}</div>;
    case 'json': return <JsonTree asset={node.asset} caption={node.caption} />;
    case 'table': return <DataTable asset={node.asset} caption={node.caption} preview={node.preview} />;
    case 'plotly': return <PlotlyChart asset={node.asset} caption={node.caption} alt={node.alt} poster={node.poster} />;
    case 'vega': return <VegaChart asset={node.asset} caption={node.caption} alt={node.alt} poster={node.poster} />;
    case 'sandbox': return <SandboxOutput asset={node.asset} caption={node.caption} allowEval={node.allowEval === true} scriptUrls={node.scriptUrls.filter((url): url is string => typeof url === 'string')} />;
    default: return null;
  }
}

/** Captured text joined into one transcript, or undefined when the run holds rich output. */
function streamText(nodes: MarimoNode[]): string | undefined {
  if (!nodes.every((node) => node.type === 'text')) return undefined;
  return nodes.map((node) => (node as Extract<MarimoNode, { type: 'text' }>).text)
    .reduce((all, text) => !all || all.endsWith('\n') ? all + text : `${all}\n${text}`, '');
}

/** A captured stream: plain text reads as a code-style transcript with Wrap and Copy in its header. */
function StreamDisclosure({ kind, variant, title, nodes, defaultOpen, qualifier }: { kind: 'logs' | 'warnings'; variant: 'log' | 'stderr'; title: string; nodes: MarimoNode[]; defaultOpen: boolean; qualifier?: string }) {
  const text = streamText(nodes);
  const preview = text !== undefined ? lineLabel(text) : nodes.length > 1 ? `${nodes.length} records` : undefined;
  return <Disclosure kind={kind} variant={variant} defaultOpen={defaultOpen} label={<>{title}{sr(qualifier)}</>} preview={preview}>
    {text !== undefined
      ? <CodeBlock code={text} language="plaintext" options={{ title, noun: 'output', lines: false, dot: variant === 'stderr', header: true }} />
      : nodes.map((node, item) => <RawResult node={node} key={item} />)}
  </Disclosure>;
}

/** Ordered outputs: adjacent captured streams fold together, nothing is regrouped. */
export function OutputSequence({ nodes, presentation, qualifier, consoleVisible = false, console = false }: OutputProps & { nodes: MarimoNode[]; consoleVisible?: boolean; console?: boolean }) {
  const settings = resolvePresentation(presentation);
  return <>{presentationRuns(nodes, console).map((run, index): ReactNode => {
    if (run.kind === 'logs') return <StreamDisclosure key={index} kind="logs" variant="log" title="Console output" nodes={run.nodes}
      defaultOpen={settings.logs === 'expanded' || consoleVisible} qualifier={qualifier} />;
    if (run.kind === 'warnings') return <StreamDisclosure key={index} kind="warnings" variant="stderr" title="stderr" nodes={run.nodes}
      defaultOpen={settings.warnings === 'expanded'} qualifier={qualifier} />;
    return run.nodes.map((node, item) => <StaticOutput key={`${index}-${item}`} node={node} presentation={settings} qualifier={qualifier} />);
  })}</>;
}

export function StaticOutput({ node, presentation, qualifier }: OutputProps & { node: MarimoNode }) {
  const settings: ResolvedPresentation = resolvePresentation(presentation);
  const sequence = (nodes: MarimoNode[]) => <OutputSequence nodes={nodes} presentation={settings} qualifier={qualifier} />;
  switch (node.type) {
    case 'html':
      if (node.role === 'result') return <Disclosure kind="results" variant="result" defaultOpen={settings.results === 'expanded'} label={<>Result{sr(qualifier)}</>}><RawResult node={node} /></Disclosure>;
      return <HtmlOutput html={node.html} codeBlocks={settings.codeBlocks} qualifier={qualifier} />;
    case 'math': return <HtmlOutput html={node.html} foldCodeBlocks={false} />;
    case 'text': if (node.stream) return sequence([node]); if (isEmptyResult(node)) return null; break;
    case 'code': return <Disclosure kind="code" variant="example" defaultOpen={settings.codeBlocks === 'expanded'} preview={lineLabel(node.code)} label={<>{resolveLanguage(node.language, 'python').label}<span className="mb-sr-only"> code example{qualifier ? ` — ${qualifier}` : ''}</span></>}>
      <div className="mb-output"><CodeBlock code={node.code} language={node.language} /></div>
    </Disclosure>;
    case 'error': return <aside className="mb-output mb-notice mb-error" role="alert"><strong>{node.name}</strong><p>{node.message}</p>
      {node.traceback.length > 0 && <Disclosure kind="errors" variant="traceback" defaultOpen={settings.errors === 'expanded'} label={<>Error details{sr(qualifier)}</>}>
        <pre>{node.traceback.join('\n')}</pre>
      </Disclosure>}
    </aside>;
    case 'layout': return <div className={`mb-output mb-layout mb-layout-${node.layout}`}>{node.children.map((child, index) => <div key={index}><StaticOutput node={child} presentation={settings} qualifier={qualifier} /></div>)}</div>;
    case 'tabs': return <Tabs panels={node.panels.map((panel) => ({ title: panel.title, content: sequence(panel.children) }))} />;
    case 'accordion': return <Accordion panels={node.panels.map((panel) => ({ title: panel.title, content: sequence(panel.children) }))} />;
    case 'callout': {
      const { tone, title } = calloutStyle(node.kind);
      return <aside className={`mb-output mb-callout mb-callout-${tone}`} role="note"><p className="mb-callout-title">{title}</p>{sequence(node.children)}</aside>;
    }
    case 'runtime-required': return <aside className="mb-output mb-notice"><strong>{node.value}</strong><p>{node.message || 'This control needs Python. Showing the exported value.'}</p></aside>;
    case 'unsupported': return <aside className="mb-output mb-notice" role="note"><strong>Output unavailable</strong><p>{node.message}</p><small>{node.mime}</small></aside>;
    default: break;
  }
  return <Disclosure kind="results" variant="result" defaultOpen={settings.results === 'expanded'} label={<>{resultLabel(node)}{sr(qualifier)}</>} preview={caption(node)}>
    <RawResult node={node} />
  </Disclosure>;
}
