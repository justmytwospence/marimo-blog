# React integration

Entry points: `marimo-blog` (types, `parseDocument`, `SCHEMA_VERSION`), `marimo-blog/react` (`MarimoArticle`), `marimo-blog/node` (build tooling) and `marimo-blog/styles.css`.

`MarimoArticle` is server-compatible; client code enhances captured outputs without requiring a Python server.

```tsx
import { MarimoArticle } from "marimo-blog/react";
import "marimo-blog/styles.css";

// Obtain document from a validated, precompiled manifest in your host.
export function Post({ document }) {
  return <MarimoArticle document={document} />;
}
```

Use `readDocument` from `marimo-blog/node` in a server/build context, not a browser bundle. Do not pass arbitrary uploaded JSON as a trusted document; `parseDocument` validates the input and reapplies the safe HTML policy.

The component accepts `header`, `footer`, `className`, `theme`, `toc`, `code` and `presentation` alongside `document`. The default header renders the document title, date and description. A custom `header` replaces that content inside the renderer's aligned header slot: the host owns its title, metadata, links and brand, and should not add a second title elsewhere in the article. The renderer owns the article structure and output layout.

Eligible source appears in a native **Source** disclosure after its cell's saved content. `code` is `folded` (default), `visible` or `hidden`, subject to author and cell visibility; omitted or hidden source cannot be revealed by the view switches. `includeSource: false` removes source and its download from the artifact. Folding or hiding included source is not privacy. The article does not render a download link.

| Content | Default | Switch |
| --- | --- | --- |
| Narrative and equations | Visible | None |
| Eligible source / published code examples | Folded / expanded | Code |
| Figures, tables and other structured results | Expanded | Results |
| stdout | Folded | Logs |
| Authored callouts and admonitions | Always visible | None |
| stderr | Folded body, visible summary | Warnings (accessible name: Warnings and stderr) |
| Execution errors | Visible name and message, folded details | Errors (accessible name: Error details) |
| Contents | Auto | Table of contents |

Code blocks (cell source, code examples and `<pre>` in prose) are highlighted on the server with highlight.js (Python, SQL, Shell, JSON, YAML, JavaScript, TypeScript, R, Markdown). Closed, a block reads as its language and line count; opened inside `MarimoArticle`, that row becomes the block header with **Lines**, **Wrap**, **Copy** and **Hide** buttons. Line numbers default on for blocks of 15 or more lines when the article is wider than 40rem, and off otherwise; **Lines** overrides this per block. Below 40rem the buttons are icon-only. Blocks over 25 lines are capped behind "Show all N lines". Without JavaScript the native disclosure is the header and blocks stay fully expanded. Plain-text console output and stderr use the same block, titled "Console output" or "stderr", with **Wrap**, **Copy** and **Hide** but no line numbers.

Closed regions render as compact cards showing type, caption or language, and a Show hint; each card toggles only itself. In the contents rail the switches sit above the list, one per line. Each eligible region also has a native local disclosure. Labeled on/off switches appear under the header and, in a compact grid, at the top of the open contents rail; both stay in sync. Only available categories appear. A switch shows a half-filled mixed state when only some of its regions are expanded; activating it expands all. **Reset view** appears only after a change and restores defaults and responsive contents. Preferences are article-scoped and reset on document replacement or reload. The `presentation` prop accepts `contents: 'auto' | 'expanded' | 'collapsed'` and `results`, `codeBlocks`, `logs`, `warnings`, `errors` as `'expanded' | 'collapsed'`; defaults are shown above. `toc={false}` removes contents entirely.

Native disclosures and their server-rendered content work without JavaScript; the switches (hidden until hydration) and responsive auto enhancement require JavaScript. The auto contents starts closed on the server, opens in a sticky rail at 68rem article width and otherwise remains before the body. An explicit reader choice wins over resizing. Closing the rail reclaims its space. Prose has a centered 42rem default measure; figures can use the wider main column. For public theme inputs and the figure surface boundary, see [theming](theming.md). Do not use marimo export classes or a host `.prose` wrapper around the renderer.

React and React DOM 18.3.1 or 19 are peers. See [outputs](outputs.md) and [security](security.md).
