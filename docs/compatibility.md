# Compatibility

| Boundary | Supported contract |
| --- | --- |
| Executed static HTML | Official marimo 0.25.0, 0.25.1, 0.25.2. Other versions are rejected. |
| Wrapper | Frozen object-valued mount/static globals; unrendered templates and executable expressions are rejected. |
| Alternative inputs | Typed snapshots through the Node API; no Jupyter or regex-based Python conversion. |
| Node | 22+ |
| React / React DOM | 18.3.1 or 19 |
| Next.js | App Router, tested with a packed package in Next 16 / React 19 |
| Browsers | Chromium, Firefox, WebKit; 3D charts additionally require WebGL |
| Default runtime | JavaScript enhancements only; no Python |
| Optional runtime | Separately reviewed official WASM export, opened by reader action |

## Verification scope

The repository contains source-included and source-omitted HTML fixtures produced by the actual 0.25.0/0.25.1/0.25.2 template and UI serializers. They test prose, tables, layouts, panels, saved controls, callouts, statistics, JSON and math. They are synthetic serialization fixtures, not executed scientific notebooks. Regeneration is a deliberate developer operation via `scripts/generate-export-fixtures.py`; CI reads the committed files without Python.

Packed consumer checks cover Node imports, TypeScript declarations and SSR with React 18/19, and a Next build. Browser tests cover layout, keyboard tabs, no-JS server output, accessibility, tables, Plotly frames, Vega, lazy-load/retry and sandbox isolation.

A private completed K-Core export can additionally be tested with `MARIMO_BLOG_AUTHENTIC_HTML=/path/to/export.html npm test`; it is not included in the package or public fixtures. A passing exporter version does not imply support for every plugin or every scientific notebook. Review the [catalog](outputs.md) and diagnostics.

WASM copying/inventory/source-matching tests do not certify arbitrary Python packages in Pyodide. Test the actual interactive notebook on its deployed origin.
