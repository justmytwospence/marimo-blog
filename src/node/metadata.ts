import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { z } from 'zod';
import { metadataSchema } from '../schema.js';
import { fail } from '../diagnostics.js';

const outputConfig = z.strictObject({ caption: z.string().optional(), alt: z.string().optional(), poster: z.string().optional(), html: z.enum(['sanitize', 'sandbox']).optional(), sandboxAllowEval: z.boolean().optional() }).refine((value) => !value.sandboxAllowEval || value.html === 'sandbox', 'sandboxAllowEval requires an explicit sandbox output');
const cellConfig = z.strictObject({ include: z.boolean().optional(), code: z.enum(['folded', 'visible', 'hidden']).optional(), allowDiagnostics: z.array(z.string()).optional(), outputs: z.record(z.string().regex(/^(0|[1-9][0-9]*)$/), outputConfig).optional() });
export const publicationSchema = metadataSchema.extend({ includeSource: z.boolean().optional(), code: z.enum(['folded', 'visible', 'hidden']).optional(), console: z.enum(['collapsed', 'visible', 'hidden']).optional(), cells: z.record(z.string(), cellConfig).optional(), resourceOrigins: z.array(z.url()).optional(), sandboxScriptUrls: z.array(z.url().startsWith('https://').refine((value) => !/[\s'"<>;]/.test(value) && new URL(value).href === value)).optional() }).strict();
export type PublicationConfig = z.infer<typeof publicationSchema>;
export function parseMetadataYaml(text: string): PublicationConfig {
  let raw: unknown;
  try { raw = YAML.parse(text, { uniqueKeys: true, strict: true }); }
  catch (error) { fail('MB_SCHEMA', `Invalid YAML: ${String(error)}`, 'Correct the metadata YAML.'); }
  const result = publicationSchema.safeParse(raw);
  if (!result.success) fail('MB_SCHEMA', result.error.message, 'Correct metadata fields and dates.');
  return result.data;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function hashPublicationConfig(config: PublicationConfig, linkedFileDigests: Record<string, string> = {}): string {
  return createHash('sha256').update(canonical({ config, linkedFileDigests })).digest('hex');
}
