export type CalloutTone = 'note' | 'tip' | 'warning' | 'danger';
const tones: Record<string, CalloutTone> = { note: 'note', info: 'note', neutral: 'note', abstract: 'note', summary: 'note', tldr: 'note', question: 'note', quote: 'note', example: 'note', seealso: 'note', admonition: 'note', tip: 'tip', hint: 'tip', important: 'tip', success: 'tip', check: 'tip', done: 'tip', warn: 'warning', warning: 'warning', caution: 'warning', attention: 'warning', danger: 'danger', error: 'danger', failure: 'danger', fail: 'danger', missing: 'danger', bug: 'danger' };

/** One tone and default title for marimo callout kinds and markdown admonition types. */
export function calloutStyle(kind: string): { tone: CalloutTone; title: string } {
  const key = kind.trim().toLowerCase();
  const title = !key || key === 'neutral' || key === 'admonition' ? 'Note' : key === 'warn' ? 'Warning' : key[0]!.toUpperCase() + key.slice(1);
  return { tone: tones[key] ?? 'note', title };
}
