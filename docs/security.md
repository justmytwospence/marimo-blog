# Security and privacy

The compiler handles exports as data; authoring and custom adapters execute trusted code. This is not a service for publishing hostile notebooks.

## Boundaries

- Exporting a notebook executes Python in its authoring environment. Review code and inputs before export.
- The importer parses official literal globals with Acorn and parse5. It does not evaluate JavaScript or fetch resources.
- Publication HTML uses allowlisted markup, attributes and CSS. Math uses trust-disabled KaTeX and MathML. SVG assets fail on active elements, event handlers and external references, and have inert extras (metadata, stylesheets, classes, links) removed with a warning, before being written to a web origin.
- Structured payloads are separate hashed assets. Prototype-pollution keys, unreviewed remote resources, path traversal and public-file symlinks are rejected.
- Use `readDocument` or `parseDocument` at the input boundary. Renderer sanitization is defense in depth, not permission to accept arbitrary uploads.
- Review source, console, outputs, assets and WASM inventories for private data. `includeSource: false` removes compiled source and its download; hiding/folding code does not. Neither removes secrets in outputs. Native folds retain their content in server-rendered HTML, even with JavaScript disabled. View switches and `htmlRole` are presentation, not access controls.

## Scripted output

A reviewed output may opt into `html: sandbox`. It loads automatically as it approaches the viewport in an iframe with `sandbox="allow-scripts"` and `referrerpolicy="no-referrer"`. It has no same-origin, form, popup or top-navigation permission.

Both compiler and renderer add CSP. Default sources, connections, forms, base URLs, nested frames and workers are blocked. Only inline script/style, data/blob images/fonts and exact HTTPS script URLs from `sandboxScriptUrls` are permitted. Remote script URLs can disclose reader activity and change outside your control.

`sandboxAllowEval: true` is a default-off per-output exception for reviewed code such as Plotly WebGL/regl, which generates functions. It is valid only with `html: sandbox`, adds `'unsafe-eval'` only inside that opaque iframe, and does not grant parent-origin access or relax the other restrictions. Browser tests verify default denial, explicit opt-in execution and parent-origin isolation.

Resize messages require the exact iframe window, a random channel and a finite height between 160 and 2000 pixels.

## Resource limits

Defaults: 100 MiB input, 64 MiB per asset, 256 MiB total assets, depth 100 and 200,000 expanded nodes. The Node API accepts explicit byte budgets; the CLI currently uses defaults. Source privacy and total file size still require author review.

Each article owns one dedicated asset directory. Writes are locked, validated and staged; pruning affects only its previous owned assets. Check the manifest, expected URL base, metadata hash and asset hashes before deployment. Asset hashes establish integrity, not trust in the original data.

WASM runs Python on its separate page. Inventory and source-matching checks do not review its behavior or make third-party packages safe.
