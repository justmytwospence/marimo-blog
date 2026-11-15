export type ContentsMode = 'auto' | 'expanded' | 'collapsed';
export const contentsModeEvent = 'mb:contents-mode';

/** Article-local coordination between the native contents summary and view switches. */
export function setContentsMode(article: Element, mode: ContentsMode) {
  article.setAttribute('data-mb-contents-mode', mode);
  article.dispatchEvent(new CustomEvent(contentsModeEvent, { detail: { mode } }));
}
