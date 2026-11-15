# Authoring

> Authoring executes trusted Python; publishing consumes completed exports without executing them.

## Capture results deliberately

Work in the notebook's own environment and review its code and inputs before execution. The official [static HTML export](https://docs.marimo.io/guides/exporting/static_html/) runs the notebook from the CLI; the editor can instead download the current view. A failed CLI run can still write HTML, so check its exit status and outputs.

marimo's [output guide](https://docs.marimo.io/guides/outputs/) explains that `mo.md` may interpolate Python values. The compiler consumes the **executed output**, not Python strings reconstructed as Markdown. A saved result is a snapshot: update the notebook, re-export, rebuild and check whenever results or metadata change.

Prefer meaningful headings, captions, image alternatives and accessible static representations. Inspect cell IDs and output types before configuring exceptions. Avoid depending on Python-backed controls or custom widgets in the static article; supply a useful captured or text/image alternative. See [outputs](outputs.md).

## Artifacts and source

Keep the original notebook and its environment as authoring inputs. The complete HTML export preserves saved content and export assets; a session JSON file alone is not the intended default input. The compiler produces a separate versioned manifest and content-addressed public assets for the site.

Review **all** of those artifacts before sharing. Folding or hiding code is a presentation choice, not privacy. `includeSource: false` removes source from the compiled artifact and download; the upstream `--no-include-code` export option omits code from the export itself. Neither removes secrets already present in outputs or assets. A source-omitted export cannot be matched to an interactive export by the source digest.

Run `inspect`, `build` and `check` as shown in [quickstart](quickstart.md); reimport after changing original local resources, then check the published assets and configuration. Do not run Python as part of the site build. For optional, separately hosted execution, see [WASM](wasm.md).
