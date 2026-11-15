# Optional interactive WASM

A static article and a live notebook are different artifacts. The default article does not start Python. An author may separately publish an official WASM directory export and attach a link; only a reader who follows it opens the notebook in a new tab. The link uses `rel="noopener noreferrer"`, with no automatic prefetch, iframe, or replacement of the article DOM. The static article remains available if the interactive version fails.

## Produce and review an export

Upstream documents the following commands:

```sh
marimo check notebook.py --select MW
marimo export html-wasm notebook.py -o wasm-export --mode run
```

See the official [WebAssembly HTML guide](https://docs.marimo.io/guides/exporting/webassembly_html/) and its limitations. Browser execution needs compatible packages and network access to load Pyodide and packages. A directory export must be served over HTTP with its assets. `--execute` can embed a preview; it does **not** guarantee that cells never rerun in the browser. Check the actual notebook in the deployed environment. Neither this project nor upstream's export implies that every notebook works offline.

## Import and attachment

> Inventory/copy/source-matching safeguards are tested. Live notebook package compatibility requires a separate manual runtime check; copying is not a Pyodide compatibility guarantee.

```sh
marimo-blog inspect-wasm wasm-export --json > inventory.json
# Review every entry and set its publish decision in inventory.json.
marimo-blog import-wasm wasm-export --inventory inventory.json --out public/interactive/example --base-url /interactive/example
```

Review the complete inventory, including `public/`, local modules, data, caches and source. The importer requires an explicit `publish` boolean for every file, copies only approved files, and rejects new, changed or omitted inventory entries, symlinks, dotfiles, environment files and missing required runtime assets. It writes an interactive descriptor. Attach that descriptor explicitly with `build --interactive <interactive.json>`.

The static and WASM exports must have matching canonical source digests and supported exporter metadata; source-omitted static exports cannot be matched. This check is not a review of notebook behavior or data. Serve the resulting directory at the specified URL and manually verify the entry and dependencies. See [security](security.md).
