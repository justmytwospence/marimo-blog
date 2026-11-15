# MDX hosts

> Integration pattern for an existing React/MDX host; no separate MDX-compiler test matrix is claimed.

Use your existing MDX setup to render a React wrapper around a **precompiled** document. Load and validate the manifest in a server/build context, then pass it to `MarimoArticle`. Import the package stylesheet once in the host. Exact MDX import and data-loading syntax depends on the host framework; never import Node filesystem code into a browser-only module.

marimo-blog does not include an MDX compiler plugin. It is distinct from the official [mdx-marimo](https://docs.marimo.io/guides/exporting/mdx/) workflow, which renders connected, reactive marimo code fences in MDX. Choose that upstream workflow when you need its reactive cells rather than a captured native article.

The static article has no Python runtime by default. Python-dependent controls show captured values rather than recomputing; an optional [WASM export](wasm.md) is a separate page.
