import type { ReactNode } from 'react';
import type { MarimoDocument } from '../types.js';
import { ArticleControls } from '../client/ArticleControls.js';
import { TableOfContents } from '../client/TableOfContents.js';
import { CodeEnhancer } from '../client/CodeEnhancer.js';
import { MarimoCell } from './MarimoCell.js';
import { getPresentationInventory, resolvePresentation, type MarimoPresentationOptions } from './presentation.js';
import { safeAssetUrl } from './safety.js';

export interface MarimoArticleProps {
  document: MarimoDocument;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  theme?: 'auto' | 'light' | 'dark';
  toc?: boolean;
  code?: 'folded' | 'visible' | 'hidden';
  presentation?: MarimoPresentationOptions;
}

export function MarimoArticle({ document, header, footer, className, theme = 'auto', toc = true, code = 'folded', presentation }: MarimoArticleProps) {
  const settings = resolvePresentation(presentation);
  const interactive = document.interactive?.url && safeAssetUrl(document.interactive.url);
  const showToc = toc && document.toc.length > 0;
  const inventory = getPresentationInventory(document, code, presentation);
  inventory.contents = showToc;
  const hasView = inventory.contents || Object.values(inventory.categories).some((category) => category.total > 0);
  // Document replacement resets every reader disclosure; reader toggles never change this key.
  const identity = `${document.metadata.slug}:${document.provenance.inputSha256}:${document.provenance.publicationConfigSha256}`;
  return <article className={['marimo-blog', className].filter(Boolean).join(' ')} data-theme={theme} lang={document.metadata.language}>
    <div className="mb-article-layout" key={identity}>
      <div className="mb-article-main">
        <div className="mb-article-header">{header === undefined ? <header className="mb-header">
          <p className="mb-meta"><time dateTime={document.metadata.date}>{document.metadata.date}</time></p>
          <h1>{document.metadata.title}</h1>
          <p>{document.metadata.description}</p>
        </header> : header}</div>
        {(hasView || interactive) && <div className="mb-article-tools mb-actions">
          {hasView && <ArticleControls inventory={inventory} />}
          {interactive && <a href={interactive} target="_blank" rel="noopener noreferrer">Run interactively</a>}
        </div>}
        <div className="mb-cells">{document.cells.map((cell) => <MarimoCell key={cell.id} cell={cell} code={code} presentation={settings} />)}</div>
        {footer && <div className="mb-article-footer">{footer}</div>}
      </div>
      <CodeEnhancer />
      {showToc && <aside className="mb-article-aside"><TableOfContents entries={document.toc} initialMode={settings.contents} controls={inventory} /></aside>}
    </div>
  </article>;
}
