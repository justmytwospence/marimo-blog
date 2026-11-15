'use client';

import { useMemo, useState } from 'react';
import { safeAssetUrl } from '../react/safety.js';

type Value = string | number | boolean | null;
type TablePayload = { headers: string[]; rows: Value[][]; totalRows?: number; download?: boolean };
function isTable(value: unknown): value is TablePayload {
  if (!value || typeof value !== 'object') return false;
  const table = value as Partial<TablePayload>;
  return Array.isArray(table.headers) && table.headers.every((item) => typeof item === 'string') && Array.isArray(table.rows) && table.rows.every((row) => Array.isArray(row) && row.length === table.headers?.length && row.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item)));
}
const label = (value: Value) => value === null ? '' : String(value);
function csvField(value: Value) {
  let text = label(value);
  const leading = text.split('').find((character) => character.charCodeAt(0) > 32);
  if (leading && '=+-@'.includes(leading)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function DataTable({ asset, caption, preview }: { asset: string; caption?: string; preview?: TablePayload }) {
  const url = safeAssetUrl(asset);
  const [table, setTable] = useState<TablePayload | undefined>(isTable(preview) ? preview : undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ column: number; descending: boolean }>();
  const [page, setPage] = useState(0);
  const rows = useMemo(() => {
    const filtered = (table?.rows ?? []).filter((row) => row.some((value) => label(value).toLocaleLowerCase().includes(query.toLocaleLowerCase())));
    if (!sort) return filtered;
    return filtered.map((row, index) => ({ row, index })).sort((left, right) => {
      const a = left.row[sort.column], b = right.row[sort.column];
      const cmp = typeof a === 'number' && typeof b === 'number' ? a - b : label(a ?? null).localeCompare(label(b ?? null), undefined, { numeric: true });
      return (sort.descending ? -cmp : cmp) || left.index - right.index;
    }).map(({ row }) => row);
  }, [table, query, sort]);
  const pageRows = loaded ? rows.slice(page * 20, page * 20 + 20) : (table?.rows ?? []).slice(0, 20);
  return <figure className="mb-output mb-figure"><div className="mb-actions">
    {url && !loaded && <button type="button" onClick={async () => {
      try { const response = await fetch(url, { credentials: 'omit' }); if (!response.ok) throw Error('Table unavailable'); const data: unknown = await response.json(); if (!isTable(data)) throw Error('Invalid table'); setTable(data); setLoaded(true); setError(false); } catch { setError(true); }
    }}>{error ? 'Retry table' : 'Search and sort exported rows'}</button>}
    {loaded && <><label>Search exported rows <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
      {table?.download !== false && <button type="button" onClick={() => {
        if (!table) return;
        const csv = [table.headers.map(csvField), ...table.rows.map((row) => row.map(csvField))].map((row) => row.join(',')).join('\r\n');
        const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'exported-rows.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0);
      }}>Download captured rows (CSV)</button>}</>}
  </div>
    {table && <div className="mb-table-wrap"><table className="mb-table">{caption && <caption>{caption}</caption>}<thead><tr>{table.headers.map((header, index) => <th key={index} scope="col" aria-sort={sort?.column === index ? sort.descending ? 'descending' : 'ascending' : 'none'}>{loaded ? <button type="button" onClick={() => { setSort((previous) => previous?.column === index ? { column: index, descending: !previous.descending } : { column: index, descending: false }); setPage(0); }}>{header}</button> : header}</th>)}</tr></thead><tbody>{pageRows.map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column}>{label(value)}</td>)}</tr>)}</tbody></table></div>}
    {!table && <p>{caption || 'Table preview unavailable.'} {url && <a href={url} download>Download captured table data (JSON)</a>}</p>}
    {table && <p className="mb-muted">Showing {loaded ? table.rows.length : pageRows.length} exported rows{table.totalRows !== undefined ? ` of ${table.totalRows}` : ''}{loaded && query ? `; ${rows.length} match` : ''}.</p>}
    {loaded && rows.length > 20 && <div className="mb-actions"><button type="button" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>Previous page</button><span>Page {page + 1} of {Math.ceil(rows.length / 20)}</span><button type="button" disabled={(page + 1) * 20 >= rows.length} onClick={() => setPage((n) => n + 1)}>Next page</button></div>}
    {error && <p role="alert">Unable to load captured rows.</p>}
  </figure>;
}
