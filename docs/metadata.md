# Metadata and publication configuration

Metadata is separate from the executed export:

```yaml
slug: example-post
title: Example post
date: "2026-01-15"
description: A short description.
tags: [notebooks]
includeSource: false
code: folded
console: collapsed
```

Required: `slug`, `title`, ISO calendar `date`, `description`. Slugs are lowercase ASCII words separated by hyphens. Optional metadata: `authors`, `tags`, `draft`, `featured`, `language`, HTTPS `sourceUrl`. `extra` is a JSON object for host-specific fields (for example a comments thread URL); marimo-blog stores and hashes it but never reads it. Other unknown keys fail validation; dates are never invented.

Publication options:

- `includeSource`: default true; false removes cell source and source download.
- `code`: folded (default), visible or hidden. Upstream `hide_code` remains respected.
- `console`: collapsed (default), visible or hidden.
- `resourceOrigins`: reviewed remote-resource origins. Prefer bundled assets.
- `sandboxScriptUrls`: exact HTTPS script URLs, not wildcard origins.
- `cells`: original cell IDs, with `include`, `code`, `allowDiagnostics`, and zero-indexed `outputs`.
- Output options: `caption`, `alt`, chart `poster`, `html: sanitize | sandbox`, optional `htmlRole: narrative | result`, and default-off `sandboxAllowEval` (requires sandbox).

`htmlRole` applies only to HTML leaves of that output, including leaves in mixed structures. Unmarked HTML defaults to protected narrative; `result` opts those leaves into result folding. It does not change source eligibility, sanitization or strict diagnostics. Older artifacts stay readable; see Artifact compatibility.

Example of a reviewed exception:

```yaml
sandboxScriptUrls:
  - https://cdn.plot.ly/plotly-3.3.0.min.js
cells:
  AbCd:
    outputs:
      "0":
        html: sandbox
        sandboxAllowEval: true
        caption: Reviewed network visualization.
```

Cell/output mismatches fail rather than ignoring stale overrides. A caption is literal text, not a filename. Posters can be bundled virtual/public/data resources or explicitly allowlisted remote resources.

The manifest records export, source and normalized publication-configuration hashes. `check --metadata post.yaml` detects changed YAML, while asset verification detects changed/missing published bytes. Changes to an original local poster/source require an intentional reimport; the package does not watch authoring files.

Hidden code is not private. Review outputs separately. See [security](security.md).

## Artifact compatibility

- Every artifact carries an integer `schemaVersion` (`SCHEMA_VERSION`, exported from `marimo-blog`).
- `parseDocument` upgrades older artifacts in memory through pure, Python-free migrations, then validates them strictly.
- A newer artifact fails with `MB_SCHEMA_VERSION`: upgrade the package to read it.
- Any change to the artifact shape, including an added optional field, bumps `schemaVersion` and ships a migration.
- A release reads every older `schemaVersion` of its major version; dropping one requires a new major release.
- Committed artifacts never need re-execution to stay readable. Rebuilding with `marimo-blog build` refreshes them to the current version.
