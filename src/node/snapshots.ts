import { z } from 'zod';
import { fail } from '../diagnostics.js';

const notebookCell = z.object({ id: z.string().min(1), code: z.string().nullable(), code_hash: z.string().nullable(), name: z.string().nullable(), config: z.object({ hide_code: z.boolean().nullable().optional(), disabled: z.boolean().nullable().optional() }).passthrough() });
const notebook = z.object({ version: z.literal('1'), cells: z.array(notebookCell), metadata: z.object({ marimo_version: z.string().nullable().optional() }).passthrough() });
const sessionCell = z.object({ id: z.string(), code_hash: z.string().nullable(), outputs: z.array(z.unknown()), console: z.array(z.unknown()) });
const session = z.object({ version: z.literal('1'), cells: z.array(sessionCell), metadata: z.object({ marimo_version: z.string().nullable().optional() }).passthrough() });
const snapshotSchema = z.object({ exporterVersion: z.enum(['0.25.0', '0.25.1', '0.25.2']), notebook, session, source: z.string().optional(), files: z.record(z.string(), z.string()), layout: z.unknown().optional(), inputSha256: z.string().regex(/^[a-f0-9]{64}$/) });
export type MarimoSnapshot = z.infer<typeof snapshotSchema>;
export function validateSnapshots(input: unknown): MarimoSnapshot {
  const parsed = snapshotSchema.safeParse(input);
  if (!parsed.success) fail('MB_SCHEMA', parsed.error.message, 'Use a complete official marimo 0.25.0–0.25.2 HTML export.');
  const result = parsed.data;
  const visited = new WeakSet<object>();
  let entries = 0;
  const jsonOnly = (value: unknown, depth: number): void => {
    if (++entries > 200_000 || depth > 100) fail('MB_SCHEMA', 'Snapshot exceeds structural limits', 'Reduce output complexity before exporting.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value !== 'object' || visited.has(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null && !Array.isArray(value)) fail('MB_SCHEMA', 'Snapshot contains non-JSON values or cycles', 'Use a literal official export.');
    visited.add(value);
    if (Array.isArray(value)) { for (const item of value) jsonOnly(item, depth + 1); return; }
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('MB_SCHEMA', 'Unsafe snapshot property', 'Remove prototype pollution keys.');
      if (depth === 0 && item === undefined && (key === 'layout' || key === 'source')) continue;
      jsonOnly(item, depth + 1);
    }
  };
  jsonOnly(result, 0);
  const ids = new Set<string>();
  for (const cell of result.notebook.cells) {
    if (ids.has(cell.id)) fail('MB_SCHEMA', `Duplicate notebook cell ${cell.id}`, 'Re-export a valid notebook.');
    ids.add(cell.id);
  }
  const sessionIds = new Set<string>();
  for (const cell of result.session.cells) {
    if (sessionIds.has(cell.id) || !ids.has(cell.id)) fail('MB_SCHEMA', `Duplicate or orphan session cell ${cell.id}`, 'Re-export a valid notebook.');
    sessionIds.add(cell.id);
    const sourceCell = result.notebook.cells.find((item) => item.id === cell.id);
    if (sourceCell?.code_hash && cell.code_hash && sourceCell.code_hash !== cell.code_hash) fail('MB_CELL_HASH', `Conflicting source and output for cell ${cell.id}`, 'Re-execute and export this notebook.');
  }
  return result;
}
