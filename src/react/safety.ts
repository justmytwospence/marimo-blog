import sanitizeHtml from 'sanitize-html';
import { htmlPolicy, sanitizeOutput } from '../node/sanitize.js';
import { safeAssetUrl } from '../shared/url.js';

/** Defense in depth: manifests can be constructed outside the official compiler. */
export function safeHtml(value: string): string {
  return sanitizeHtml(sanitizeOutput(value), {
    allowedTags: [...(htmlPolicy.allowedTags as string[]), 'a', 'abbr', 'annotation', 'b', 'blockquote', 'br', 'caption', 'code', 'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'kbd', 'li', 'mark', 'math', 'mfrac', 'mi', 'mn', 'mo', 'mroot', 'mrow', 'msqrt', 'msub', 'msup', 'mtext', 'ol', 'p', 'pre', 's', 'section', 'semantics', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tfoot', 'tr', 'u', 'ul'],
    nonTextTags: ['script', 'style', 'textarea', 'option'],
    allowedAttributes: {
      ...htmlPolicy.allowedAttributes,
      '*': ['id', 'class', 'title', 'lang', 'dir', 'role', 'aria-label', 'aria-hidden', 'aria-describedby', 'style'],
      a: ['href', 'title', 'id'], img: ['src', 'alt', 'width', 'height', 'loading'],
      th: ['scope', 'colspan', 'rowspan'], td: ['colspan', 'rowspan'],
      math: ['xmlns'], annotation: ['encoding'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attrs) => ({ tagName: 'a', attribs: { ...attrs, rel: 'noopener noreferrer' } }),
      img: (_tag, attrs) => ({ tagName: 'img', attribs: { ...attrs, ...(safeAssetUrl(attrs.src ?? '') ? {} : { src: '' }) } }),
    },
  });
}
