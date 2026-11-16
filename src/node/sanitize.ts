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
  if (result.class) result.class = result.class.split(/\s+/).filter((name) => /^(?:mb-[a-z0-9-]+|language-[a-z0-9_+#-]{1,32}|katex(?:-[a-z0-9-]+)?|(?:mord|mop|mrel|mbin|mopen|mclose|mpunct|minner|mspace|vlist|vlist-t|vlist-r|pstrut|strut|base|sizing|reset-size[0-9]*|size[0-9]*|mathnormal|mathit|mathrm|text|textbf|textit|textsf|texttt|delimsizing|delimcenter|nulldelimiter|svg-align|rule|frac-line|sqrt|sqrt-line|accent|accent-body|enclosing|cancel-pad|mfrac|mroot|mstyle|msupsub|mtight|new-line|newline|arraycolsep|arraystretch))$/.test(name)).join(' ');
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

const svgElements = new Set(['svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'desc', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'use', 'symbol', 'marker', 'pattern', 'image']);
const activeSvgElements = new Set(['script', 'foreignObject', 'iframe', 'object', 'embed', 'animate', 'animateMotion', 'animateTransform', 'set', 'handler', 'listener', 'audio', 'video', 'discard', 'feImage']);
const svgAttributes = new Set(['xmlns', 'xlink', 'version', 'id', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'opacity', 'clip-path', 'clip-rule', 'clipPathUnits', 'mask', 'maskUnits', 'maskContentUnits', 'gradientUnits', 'gradientTransform', 'offset', 'stop-color', 'stop-opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'dx', 'dy', 'preserveAspectRatio', 'href', 'role', 'aria-label', 'style', 'space', 'markerWidth', 'markerHeight', 'refX', 'refY', 'orient', 'markerUnits', 'patternUnits', 'patternContentUnits', 'patternTransform', 'visibility', 'display', 'letter-spacing', 'baseline-shift', 'paint-order', 'vector-effect', 'shape-rendering', 'text-rendering', 'image-rendering', 'font-variant', 'font-stretch', 'textLength', 'lengthAdjust', 'fx', 'fy', 'spreadMethod']);
const svgStyleProperties = new Set(['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'opacity', 'clip-path', 'clip-rule', 'mask', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-stretch', 'text-anchor', 'dominant-baseline', 'baseline-shift', 'letter-spacing', 'visibility', 'display', 'stop-color', 'stop-opacity', 'paint-order', 'vector-effect', 'shape-rendering', 'text-rendering', 'image-rendering', 'white-space']);
const rasterDataUri = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/;
const localPaint = /^url\(\s*["']?#[a-zA-Z0-9_.:-]+["']?\s*\)$/;

function svgStyle(value: string, removed: Set<string>): string {
  let ast: cssTree.CssNode;
  try { ast = cssTree.parse(value, { context: 'declarationList', parseValue: true, onParseError: () => { throw Error('CSS parse error'); } }); }
  catch { removed.add('attribute style'); return ''; }
  const kept: string[] = [];
  (ast as cssTree.DeclarationList).children.forEach((declaration) => {
    if (declaration.type !== 'Declaration') { removed.add('style rule'); return; }
    let ok = svgStyleProperties.has(declaration.property.toLowerCase());
    cssTree.walk(declaration, (node) => {
      if (node.type === 'Url' && !/^#[a-zA-Z0-9_.:-]+$/.test(node.value)) fail('MB_UNSAFE_URL', 'External SVG paint resource', 'Use local SVG definitions only.');
      if (node.type === 'Function' && !['rgb', 'rgba', 'hsl', 'hsla'].includes(node.name.toLowerCase())) ok = false;
    });
    if (ok) kept.push(cssTree.generate(declaration)); else removed.add(`style property ${declaration.property}`);
  });
  return kept.join(';');
}

/**
 * External SVG can be opened as a top-level document: never publish active bytes.
 * Inert extras (metadata, stylesheets, classes, links) are removed and reported; active content fails.
 */
export function sanitizeSvg(svg: string): { svg: string; removed: string[] } {
  type Node = { nodeName: string; parentNode?: Node | null; childNodes?: Node[]; attrs?: { name: string; value: string; prefix?: string }[] };
  const removed = new Set<string>();
  const tree = parseFragment(svg) as unknown as Node;
  const roots = (tree.childNodes ?? []).filter((node) => !node.nodeName.startsWith('#'));
  if (roots.length !== 1 || roots[0]?.nodeName !== 'svg') fail('MB_SCHEMA', 'Invalid SVG root', 'Export a complete SVG image.');
  let count = 0;
  const cleanAttributes = (element: Node): void => {
    const kept: NonNullable<Node['attrs']> = [];
    for (const attr of element.attrs ?? []) {
      const full = `${attr.prefix ? `${attr.prefix}:` : ''}${attr.name}`;
      if (/^on/i.test(attr.name)) fail('MB_UNSAFE_URL', `Unsupported SVG attribute ${full}`, 'Export an inert SVG without scripts.');
      if (attr.name === 'href' && (element.nodeName === 'image' ? !rasterDataUri.test(attr.value) : !/^#[a-zA-Z0-9_.:-]+$/.test(attr.value))) fail('MB_UNSAFE_URL', 'External SVG reference', 'Embed the image without external resources.');
      if (attr.name !== 'style' && /url\s*\(/i.test(attr.value) && !localPaint.test(attr.value)) fail('MB_UNSAFE_URL', 'External SVG paint resource', 'Use local SVG definitions only.');
      const prefixOk = !attr.prefix || (attr.prefix === 'xlink' && attr.name === 'href') || (attr.prefix === 'xmlns' && attr.name === 'xlink') || attr.prefix === 'xml';
      if (!svgAttributes.has(attr.name) || !prefixOk) { removed.add(`attribute ${full}`); continue; }
      if (attr.name === 'style') { const style = svgStyle(attr.value, removed); if (style) kept.push({ ...attr, value: style }); continue; }
      kept.push(attr);
    }
    element.attrs = kept;
  };
  const clean = (node: Node, depth: number): void => {
    const next: Node[] = [];
    for (const child of node.childNodes ?? []) {
      if (++count > 200_000 || depth > 100) fail('MB_SCHEMA', 'SVG exceeds structural limits', 'Export a simpler or raster image.');
      if (child.nodeName === '#comment') continue;
      if (child.nodeName.startsWith('#')) { next.push(child); continue; }
      if (activeSvgElements.has(child.nodeName) || /^on/i.test(child.nodeName)) fail('MB_UNSAFE_URL', `Unsupported active SVG element ${child.nodeName}`, 'Export an inert SVG or raster image.');
      if (child.nodeName === 'a') {
        removed.add('element a');
        clean(child, depth + 1);
        for (const grandchild of child.childNodes ?? []) { grandchild.parentNode = node; next.push(grandchild); }
        continue;
      }
      if (!svgElements.has(child.nodeName)) { removed.add(`element ${child.nodeName}`); continue; }
      cleanAttributes(child);
      clean(child, depth + 1);
      next.push(child);
    }
    node.childNodes = next;
  };
  const root = roots[0]!;
  cleanAttributes(root);
  clean(root, 1);
  tree.childNodes = [root];
  return { svg: serialize(tree as never), removed: [...removed].sort() };
}
export function safeAssetBase(value: string): string {
  if (!/^\/(?!\/)[a-zA-Z0-9/_-]*\/?$/.test(value) || value.includes('..')) fail('MB_UNSAFE_URL', 'Asset base must be a root-relative URL path', 'Supply a root-relative --asset-base with no traversal.');
  return value.replace(/\/$/, '');
}
