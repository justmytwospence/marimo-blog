# Migration

> This is a migration workflow, not an automatic converter.

1. Preserve your current site and URLs while you inventory notebook source, saved results, assets and metadata.
2. Create or adapt a trusted marimo notebook in its own environment. marimo-blog's input is an **official executed static HTML export**, not `.ipynb` or a regex extraction of Python source. See upstream's [Jupyter migration guide](https://docs.marimo.io/guides/coming_from/jupyter/).
3. Export deliberately, inspect diagnostics and review the captured outputs. Create the required publication metadata and compile to a manifest and a dedicated public asset directory.
4. Adapt your site's content loader and route to validate the manifest, render `MarimoArticle`, and serve assets at the expected base. Map site-specific tags, dates, URLs and feed excerpts in your host rather than relying on notebook execution during builds.
5. Compare content, deep links, accessibility, responsive layout, print, no-JS fallbacks and output fidelity against the intended publication. Document intentional differences. Only remove the old pipeline after the new route and assets are verified.

A static snapshot cannot reproduce Python-backed interactions. Offer a separately reviewed [WASM notebook](wasm.md) only if its dependencies and data can run in the browser; otherwise present captured values or alternatives. See [compatibility](compatibility.md) and [security](security.md).
