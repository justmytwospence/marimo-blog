// Dependency-free: imported by browser islands, so it must never pull in the sanitizer.
/** Only publication-root paths are allowed for compiled assets; no remote or data URLs. */
export function safeAssetUrl(value: string): string | undefined {
  if (!value.startsWith('/') || value.startsWith('//') || [...value].some((character) => character === '\\' || character.charCodeAt(0) < 32)) return undefined;
  try {
    const url = new URL(value, 'https://article.invalid');
    const path = value.split(/[?#]/, 1)[0]!;
    if (url.origin !== 'https://article.invalid' || /%(?:2e|2f|5c|25)/i.test(path) || path.split('/').some((segment) => {
      const decoded = decodeURIComponent(segment);
      return decoded === '..' || decoded === '.' || decoded.includes('/') || decoded.includes('\\');
    })) return undefined;
    return value;
  } catch { return undefined; }
}
