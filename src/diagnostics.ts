import type { MarimoDiagnostic } from './types.js';

export class MarimoBlogError extends Error {
  constructor(public readonly diagnostics: MarimoDiagnostic[]) {
    super(diagnostics.map((d) => `${d.code}: ${d.message}`).join('\n'));
    this.name = 'MarimoBlogError';
  }
}

export function diagnostic(code: string, message: string, remediation: string, cellId?: string, outputIndex?: number): MarimoDiagnostic {
  return { severity: 'error', code, message, remediation, ...(cellId === undefined ? {} : { cellId }), ...(outputIndex === undefined ? {} : { outputIndex }) };
}

export function fail(code: string, message: string, remediation: string): never {
  throw new MarimoBlogError([diagnostic(code, message, remediation)]);
}
