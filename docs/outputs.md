# Output catalog

| Captured content | Article behavior |
| --- | --- |
| Executed Markdown / ordinary HTML | Sanitized semantic HTML, headings, links, lists, tables and inline formatting. Interpolation is already executed. |
| Math | KaTeX with trust disabled, rendered to allowlisted semantic MathML. Inline formulas retain surrounding prose. |
| Source code / console / errors | Foldable highlighted source and ordered console output. Execution errors fail strict compilation unless acknowledged per cell. |
| hstack / vstack | Responsive horizontal / vertical layouts preserving child order. |
| Tabs / accordion / carousel | Captured panels only. Carousel slides become labeled tabs. No-JS fallback includes every panel. |
| Callout / statistic / JSON / tree | Captured content, including zero and false. JSON/tree payloads load on reader action. |
| Raster images / SVG | Content-addressed assets. SVG has a conservative element/attribute allowlist. Inert extras (metadata, stylesheets, classes, links) are removed with an `MB_SVG_SANITIZED` warning; active elements, event handlers and external references fail the build. Export PNG when an SVG needs unsupported styling. |
| Audio / video | Native controls for bundled supported media. |
| HTML dataframes | Static table semantics, including colspan/rowspan. |
| `mo.ui.table` | Up to 20 SSR preview rows; on-demand search, stable sort, pagination and formula-safe CSV over captured rows only. Hidden columns and download policy are retained. Truncation is disclosed. |
| `mo.ui.dataframe` | Explicit Python-required notice; no fabricated rows or transform editor. |
| Plotly / Vega | Lazy browser rendering of captured specs; Plotly frames are retained. Above 5 MiB, a load button precedes GET. Captions/alternatives remain on errors; an optional reviewed poster provides a no-JS image. |
| Inputs / forms / buttons | Captured initial value and Python-required notice, not a fake live control. |
| Scripted HTML | Strict diagnostic by default; reviewed per-output sandbox opt-in. |
| Unknown plugins / anywidget / custom ESM | Explicit unsupported diagnostic, never arbitrary custom-element execution. |

Narrative HTML and math remain visible; HTML defaults to narrative unless explicitly marked with `htmlRole: result` in output metadata. Published block-code examples have local folds and start expanded. Structured results start expanded and can be folded without hiding surrounding prose, even in mixed layouts. See the [presentation defaults](react.md).

Captured stdout and stderr retain their order; stderr is labeled as such, not inferred to be a Python warning. Explicit warning and danger callouts have visible summaries with foldable bodies. Error names and messages, unsupported-output notices and runtime-required explanations remain visible. A runtime result failure displays **Result unavailable** in its summary and opens its existing fallback; the indicator persists if folded until recovery. Compiler diagnostics remain build-time validation, not a reader warning stream.

An unrecognized composition fails rather than dropping textless sibling charts or images. Use supported stacks/panels, split the output, or implement a reviewed adapter. Python-backed selections and row fetches are never simulated.

## Build-time adapters

`OutputAdapter` and `MimeContext` are exported from `marimo-blog/node`. Pass adapters explicitly to `compileSnapshot(snapshot, { metadata, assetBase, adapters })`:

```ts
const adapter: OutputAdapter = {
  name: "my-output",
  exporterVersions: ["0.25.1"],
  matches: (output) => /* recognize your serialized output */ false,
  compile: (_output, context) => [
    { type: "text", text: "Captured result" },
  ],
};
```

Names must be unique and versions explicit. Matching adapters run before built-ins. Context exposes the asset collector and diagnostics; returned nodes still go through asset rewriting and manifest validation. Adapters are trusted Node code with the privileges of the build process, not a sandbox or downloadable browser plugin. Do not load adapters from untrusted metadata.

## Diagnostics

Strict compilation rejects unacknowledged output errors, script removal and unsupported content. `cells.<id>.allowDiagnostics` acknowledges only selected codes for that cell. This is an editorial decision, not proof of output fidelity. Unknown cell IDs and output indexes are errors.

Empty plain-text results (for example the value of a cell that returns nothing) are omitted from the artifact.
