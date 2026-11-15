export interface MarimoMetadata {
  slug: string;
  title: string;
  date: string;
  description: string;
  authors?: string[];
  tags?: string[];
  draft?: boolean;
  featured?: boolean;
  language?: string;
  sourceUrl?: string;
}

export interface MarimoDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  cellId?: string;
  outputIndex?: number;
  remediation: string;
}

export interface MarimoAsset {
  path: string;
  mime: string;
  sha256: string;
  bytes: number;
}

export interface InteractiveDescriptor {
  url: string;
  exporterVersion: string;
  sourceSha256: string;
}

export type MarimoNode =
  | { type: 'html'; html: string; role?: 'narrative' | 'result' }
  | { type: 'text'; text: string; stream?: 'stdout' | 'stderr' }
  | { type: 'error'; name: string; message: string; traceback: string[] }
  | { type: 'image'; src: string; alt: string; caption?: string }
  | { type: 'media'; src: string; mime: string; caption?: string }
  | { type: 'math'; source: string; html: string; display: boolean }
  | { type: 'code'; code: string; language: string }
  | { type: 'layout'; layout: 'stack' | 'grid' | 'linear'; children: MarimoNode[] }
  | { type: 'tabs' | 'accordion'; panels: { title: string; children: MarimoNode[] }[] }
  | { type: 'callout'; kind: string; children: MarimoNode[] }
  | { type: 'statistic'; label: string; value: string; caption?: string }
  | { type: 'json' | 'plotly' | 'vega'; asset: string; caption?: string; alt?: string; poster?: string }
  | { type: 'table'; asset: string; caption?: string; alt?: string; preview?: { headers: string[]; rows: (string | number | boolean | null)[][]; totalRows?: number; download?: boolean } }
  | { type: 'sandbox'; asset: string; caption?: string; alt?: string; scriptUrls: string[]; allowEval?: boolean }
  | { type: 'runtime-required'; value: string; message: string }
  | { type: 'unsupported'; mime: string; message: string };

export interface MarimoCell {
  id: string;
  ordinal: number;
  name?: string;
  source?: string;
  sourceLanguage: string;
  hideCode: boolean;
  disabled: boolean;
  code: 'folded' | 'visible' | 'hidden';
  console: 'collapsed' | 'visible' | 'hidden';
  outputs: MarimoNode[];
  consoleOutputs: MarimoNode[];
}

export interface TocEntry { id: string; title: string; level: number }

export interface MarimoDocument {
  schemaVersion: 1;
  metadata: MarimoMetadata;
  provenance: {
    exporterVersion: string;
    notebookVersion: '1';
    sessionVersion: '1';
    inputSha256: string;
    publicationConfigSha256: string;
    producerVersion: string;
    sourceHashes: Record<string, string>;
    sourceSha256?: string;
  };
  assetBase: string;
  cells: MarimoCell[];
  toc: TocEntry[];
  plainText: string;
  assets: MarimoAsset[];
  diagnostics: MarimoDiagnostic[];
  sourceDownload?: string;
  interactive?: InteractiveDescriptor;
}
