import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'marimo-blog';
import { MarimoArticle } from 'marimo-blog/react';

export default async function Page() {
  const json = await readFile(path.join(process.cwd(), 'content', 'showcase.json'), 'utf8');
  const document = parseDocument(JSON.parse(json));
  return <main><MarimoArticle document={document} /></main>;
}
