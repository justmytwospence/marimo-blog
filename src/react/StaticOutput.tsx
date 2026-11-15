import type { MarimoNode } from '../types.js';
import { Tabs } from '../client/Tabs.js';
import { Accordion } from '../client/Accordion.js';
import { PlotlyChart } from '../client/PlotlyChart.js';
import { VegaChart } from '../client/VegaChart.js';
import { DataTable } from '../client/DataTable.js';
import { JsonTree } from '../client/JsonTree.js';
import { SandboxOutput } from '../client/SandboxOutput.js';
import { CodeBlock } from '../client/CodeBlock.js';
import { safeAssetUrl, safeHtml } from './safety.js';

export function StaticOutput({ node }: { node: MarimoNode }) {
  switch (node.type) {
    case 'html': case 'math': return <div className="mb-output mb-prose" dangerouslySetInnerHTML={{ __html: safeHtml(node.html) }} />;
    case 'text': return <pre className="mb-output" aria-label={node.stream ?? 'Text output'}>{node.text}</pre>;
    case 'error': return <aside className="mb-output mb-notice" role="alert"><strong>{node.name}</strong><p>{node.message}</p>{node.traceback.length > 0 && <details><summary>Traceback</summary><pre>{node.traceback.join('\n')}</pre></details>}</aside>;
    case 'image': { const src = safeAssetUrl(node.src); return <figure className="mb-output mb-figure">{src ? <img className="mb-media" src={src} alt={node.alt} loading="lazy" /> : <p>Image unavailable: {node.alt}</p>}{node.caption && <figcaption className="mb-caption">{node.caption}</figcaption>}</figure>; }
    case 'media': { const src = safeAssetUrl(node.src); return <figure className="mb-output mb-figure">{src && (node.mime.startsWith('audio/') ? <audio controls preload="none" src={src}>Audio unavailable</audio> : node.mime.startsWith('video/') ? <video controls preload="none" src={src}>Video unavailable</video> : <a href={src} download>Download media</a>)}{!src && <p>Media unavailable</p>}{node.caption && <figcaption className="mb-caption">{node.caption}</figcaption>}</figure>; }
    case 'code': return <div className="mb-output"><CodeBlock code={node.code} language={node.language} /></div>;
    case 'layout': return <div className={`mb-output mb-layout mb-layout-${node.layout}`}>{node.children.map((child, index) => <StaticOutput node={child} key={index} />)}</div>;
    case 'tabs': return <Tabs panels={node.panels.map((panel) => ({ title: panel.title, content: panel.children.map((child, index) => <StaticOutput node={child} key={index} />) }))} />;
    case 'accordion': return <Accordion panels={node.panels.map((panel) => ({ title: panel.title, content: panel.children.map((child, index) => <StaticOutput node={child} key={index} />) }))} />;
    case 'callout': return <aside className="mb-output mb-notice"><strong>{node.kind}</strong>{node.children.map((child, index) => <StaticOutput node={child} key={index} />)}</aside>;
    case 'statistic': return <div className="mb-output mb-notice"><span>{node.label}</span><strong> {node.value}</strong>{node.caption && <p className="mb-caption">{node.caption}</p>}</div>;
    case 'json': return <JsonTree asset={node.asset} caption={node.caption} />;
    case 'table': return <DataTable asset={node.asset} caption={node.caption} preview={'preview' in node ? node.preview as { headers: string[]; rows: (string | number | boolean | null)[][]; totalRows?: number; download?: boolean } : undefined} />;
    case 'plotly': return <PlotlyChart asset={node.asset} caption={node.caption} alt={node.alt} poster={node.poster} />;
    case 'vega': return <VegaChart asset={node.asset} caption={node.caption} alt={node.alt} poster={node.poster} />;
    case 'sandbox': return <SandboxOutput asset={node.asset} caption={node.caption} allowEval={node.allowEval === true} scriptUrls={'scriptUrls' in node && Array.isArray(node.scriptUrls) ? node.scriptUrls.filter((url): url is string => typeof url === 'string') : []} />;
    case 'runtime-required': return <aside className="mb-output mb-notice"><strong>{node.value}</strong><p>{node.message || 'This control needs Python. Showing the exported value.'}</p></aside>;
    case 'unsupported': return <aside className="mb-output mb-notice" role="note"><strong>Output unavailable</strong><p>{node.message}</p><small>{node.mime}</small></aside>;
  }
}
