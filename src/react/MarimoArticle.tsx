import type { ReactNode } from 'react';
import type { MarimoDocument } from '../types.js';
import { ArticleControls } from '../client/ArticleControls.js';
import { TableOfContents } from '../client/TableOfContents.js';
import { MarimoCell } from './MarimoCell.js';
import { safeAssetUrl } from './safety.js';

export interface MarimoArticleProps {
  document: MarimoDocument;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  theme?: 'auto' | 'light' | 'dark';
  toc?: boolean;
  code?: 'folded' | 'visible' | 'hidden';
}

export function MarimoArticle({ document, header, footer, className, theme = 'auto', toc = true, code = 'folded' }: MarimoArticleProps) {
  const source = document.sourceDownload && safeAssetUrl(document.sourceDownload);
  const hasVisibleCode = code !== 'hidden' && document.cells.some((cell) => cell.source !== undefined && !cell.hideCode && cell.code !== 'hidden');
  const interactive = document.interactive?.url && safeAssetUrl(document.interactive.url);
  return <article className={['marimo-blog', className].filter(Boolean).join(' ')} data-theme={theme} lang={document.metadata.language}>
    {header === undefined ? <header className="mb-header">
      <h1>{document.metadata.title}</h1>
      <p className="mb-meta"><time dateTime={document.metadata.date}>{document.metadata.date}</time></p>
      <p>{document.metadata.description}</p>
    </header> : header}
    <div className="mb-actions">
      {hasVisibleCode && <ArticleControls key={document.provenance.inputSha256} />}
      {source && <a href={source} download>Download notebook</a>}
      {interactive && <a href={interactive} target="_blank" rel="noopener noreferrer">Run interactively</a>}
    </div>
    {toc && document.toc.length > 0 && <TableOfContents entries={document.toc} />}
    <div className="mb-cells">{document.cells.map((cell) => <MarimoCell key={cell.id} cell={cell} code={code} />)}</div>
    {footer}
  </article>;
}
