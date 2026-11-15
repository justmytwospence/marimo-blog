import { useEffect, useState } from 'react';
import { parseDocument, type MarimoDocument } from 'marimo-blog';
import { MarimoArticle } from 'marimo-blog/react';

export function App() {
  const [documents, setDocuments] = useState<MarimoDocument[]>([]);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(['showcase', 'second'].map(async (name) => {
      const response = await fetch(`/documents/${name}.json`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Could not load ${name}: ${response.status}`);
      return parseDocument(await response.json());
    })).then(setDocuments).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => controller.abort();
  }, []);

  return <div className="showcase" data-theme={theme}>
    <header className="showcase-toolbar">
      <strong>marimo-blog showcase</strong>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>Switch to {theme === 'light' ? 'dark' : 'light'}</button>
      <button onClick={() => setWide(!wide)}>Use {wide ? 'narrow' : 'wide'} container</button>
    </header>
    <main className={wide ? 'container wide' : 'container'}>
      {error && <p role="alert">{error}</p>}
      {!error && documents.length === 0 && <p>Loading documents…</p>}
      {documents.map((document) => <MarimoArticle key={document.metadata.slug} document={document} theme={theme} />)}
    </main>
  </div>;
}
