import sanitizeHtml from 'sanitize-html';
import { parseFragment, serialize } from 'parse5';
import * as cssTree from 'css-tree';
import { fail } from '../diagnostics.js';

const safeProperties = new Set(['color', 'background-color', 'font-size', 'font-weight', 'font-style', 'font-family', 'line-height', 'display', 'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'vertical-align', 'border', 'border-width', 'border-style', 'border-color', 'border-bottom', 'border-bottom-width', 'border-bottom-style', 'border-top', 'border-top-width', 'border-top-style', 'opacity', 'text-align', 'white-space']);
function safeStyle(value: string): string | undefined {
  if (!value) return undefined;
  try {
    const ast = cssTree.parse(value, { context: 'declarationList', parseValue: true, onParseError: () => { throw Error('CSS parse error'); } });
    let valid = true;
    cssTree.walk(ast, (node) => {
      if (node.type === 'Declaration' && !safeProperties.has(node.property.toLowerCase())) valid = false;
      if (node.type === 'Url' || node.type === 'Atrule' || node.type === 'Raw' || node.type === 'Function' && !['rgb', 'rgba', 'hsl', 'hsla'].includes(node.name.toLowerCase())) valid = false;
    });
    return valid ? cssTree.generate(ast) : undefined;
  } catch { return undefined; }
}
function attributes(tag: string, attrs: Record<string, string>): sanitizeHtml.Attributes {
  const result: sanitizeHtml.Attributes = { ...attrs };
  if (result.class) result.class = result.class.split(/\s+/).filter((name) => /^(?:mb-[a-z0-9-]+|katex(?:-[a-z0-9-]+)?|(?:mord|mop|mrel|mbin|mopen|mclose|mpunct|minner|mspace|vlist|vlist-t|vlist-r|pstrut|strut|base|sizing|reset-size[0-9]*|size[0-9]*|mathnormal|mathit|mathrm|text|textbf|textit|textsf|texttt|delimsizing|delimcenter|nulldelimiter|svg-align|rule|frac-line|sqrt|sqrt-line|accent|accent-body|enclosing|cancel-pad|mfrac|mroot|mstyle|msupsub|mtight|new-line|newline|arraycolsep|arraystretch))$/.test(name)).join(' ');
  if (result.style) result.style = safeStyle(result.style) ?? '';
  if (tag === 'a') result.rel = 'noopener noreferrer';
  return result;
}
export const htmlPolicy: sanitizeHtml.IOptions = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'span', 'div', 'figure', 'figcaption', 'section', 'details', 'summary', 'audio', 'video', 'source', 'math', 'semantics', 'annotation', 'mrow', 'mi', 'mn', 'mo', 'mtext', 'mspace', 'ms', 'mfrac', 'msqrt', 'mroot', 'mstyle', 'merror', 'mpadded', 'mphantom', 'mfenced', 'menclose', 'msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover', 'mmultiscripts', 'mprescripts', 'none', 'mtable', 'mtr', 'mtd'],
  allowedAttributes: { '*': ['id', 'class', 'style', 'aria-label', 'aria-describedby', 'role'], a: ['href', 'title', 'rel'], img: ['src', 'srcset', 'alt', 'width', 'height', 'loading'], audio: ['src', 'controls'], video: ['src', 'controls', 'poster'], source: ['src', 'type'], td: ['colspan', 'rowspan'], th: ['scope', 'colspan', 'rowspan'], ol: ['start'], math: ['xmlns', 'display'], annotation: ['encoding'], mo: ['stretchy', 'fence', 'separator', 'largeop', 'movablelimits', 'lspace', 'rspace', 'minsize', 'maxsize'], mi: ['mathvariant'], mn: ['mathvariant'], mtext: ['mathvariant'], mstyle: ['mathvariant', 'displaystyle', 'scriptlevel', 'mathsize'], mspace: ['width', 'height', 'depth'], mfrac: ['linethickness', 'numalign', 'denomalign'], mpadded: ['width', 'height', 'depth', 'lspace', 'voffset'], mtable: ['columnalign', 'rowalign', 'columnspacing', 'rowspacing'], mtd: ['columnalign', 'rowalign', 'columnspan', 'rowspan'], menclose: ['notation'] },
  allowedSchemes: ['http', 'https', 'mailto', 'data'], allowedSchemesAppliedToAttributes: ['href', 'src', 'poster'],
  allowedSchemesByTag: {}, allowProtocolRelative: false,
  transformTags: { '*': (tag, attrs) => ({ tagName: tag, attribs: attributes(tag, attrs) }), a: (tag, attrs) => ({ tagName: tag, attribs: attributes(tag, attrs) }) },
};
export function sanitizeOutput(html: string): string { return sanitizeHtml(html, htmlPolicy); }

/** External SVG can be opened as a top-level document: do not publish active bytes. */
export function sanitizeSvg(svg: string): string {
  type Node = { nodeName: string; childNodes?: Node[]; attrs?: { name: string; value: string }[] };
  const allowed = new Set(['svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'desc', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'use', 'symbol']);
  const attributes = new Set(['xmlns', 'xlink', 'version', 'id', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'opacity', 'clip-path', 'clip-rule', 'clipPathUnits', 'mask', 'maskUnits', 'maskContentUnits', 'gradientUnits', 'gradientTransform', 'offset', 'stop-color', 'stop-opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'dx', 'dy', 'preserveAspectRatio', 'href', 'role', 'aria-label']);
  const tree = parseFragment(svg) as unknown as Node;
  const roots = (tree.childNodes ?? []).filter((node) => node.nodeName !== '#comment' && node.nodeName !== '#text');
  if (roots.length !== 1 || roots[0]?.nodeName !== 'svg') fail('MB_SCHEMA', 'Invalid SVG root', 'Export a complete SVG image.');
  let count = 0;
  const visit = (node: Node, depth: number): void => {
    if (++count > 200_000 || depth > 100) fail('MB_SCHEMA', 'SVG exceeds structural limits', 'Export a simpler or raster image.');
    if (!node.nodeName.startsWith('#') && !allowed.has(node.nodeName)) fail('MB_UNSAFE_URL', `Unsupported active SVG element ${node.nodeName}`, 'Export an inert SVG or raster image.');
    for (const attr of node.attrs ?? []) {
      if (!attributes.has(attr.name)) fail('MB_UNSAFE_URL', `Unsupported SVG attribute ${attr.name}`, 'Export an inert SVG without scripts or inline CSS.');
      if (attr.name === 'href' && !/^#[a-zA-Z0-9_.:-]+$/.test(attr.value)) fail('MB_UNSAFE_URL', 'External SVG reference', 'Embed the image without external resources.');
      if (/url\s*\(/i.test(attr.value) && !/^url\(#[a-zA-Z0-9_.:-]+\)$/.test(attr.value)) fail('MB_UNSAFE_URL', 'External SVG paint resource', 'Use local SVG definitions only.');
    }
    for (const child of node.childNodes ?? []) visit(child, depth + 1);
  };
  visit(tree, 0);
  return serialize(tree as never);
}
export function safeAssetBase(value: string): string {
  if (!/^\/(?!\/)[a-zA-Z0-9/_-]*\/?$/.test(value) || value.includes('..')) fail('MB_UNSAFE_URL', 'Asset base must be a root-relative URL path', 'Supply a root-relative --asset-base with no traversal.');
  return value.replace(/\/$/, '');
}
