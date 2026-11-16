# Theming

Import `marimo-blog/styles.css` once in the host. The article inherits typography and has a transparent canvas by default. Public `--mb-*` variables are inputs: package palette defaults are private `--_mb-*` values, so an ancestor's public values remain effective in light and dark themes. Do not depend on private variables or internal renderer selectors.

| Owner | Responsibility |
| --- | --- |
| Host | Site identity, fonts, metadata, header content and page canvas; optional public token values |
| Renderer | Article layout, semantic output, source controls, contents and figure framing |
| Author | Notebook content and chart colors; the importer discards arbitrary export CSS and custom head content |

For example, set tokens on a host-owned ancestor:

```css
.article-host {
  --mb-text: #24303c;
  --mb-muted: #536372;
  --mb-accent: #1255a0;
  --mb-border: #c6d0d8;
  --mb-surface: #f4f7f9;
  --mb-code-bg: #eef2f5;
  --mb-figure-bg: #fff;
  --mb-font-body: Georgia, serif;
  --mb-font-heading: system-ui, sans-serif;
  --mb-font-ui: system-ui, sans-serif;
  --mb-font-code: ui-monospace, monospace;
  --mb-toc-offset: 6rem;
}
.dark .article-host {
  --mb-text: #edf0f3;
  --mb-muted: #b9c3cc;
  --mb-accent: #9ccaff;
  --mb-border: #52606d;
  --mb-surface: #252d35;
  --mb-code-bg: #202830;
}
```

Other inputs include `--mb-code-text` and the syntax colours `--mb-syntax-keyword`, `--mb-syntax-string`, `--mb-syntax-number`, `--mb-syntax-comment`, `--mb-syntax-function`, `--mb-syntax-type`, `--mb-syntax-variable` and `--mb-syntax-meta` (map them per host theme), the status colours `--mb-success`, `--mb-warning` and `--mb-danger` (callouts, stderr dot, errors), `--mb-bg`, `--mb-body-size`, `--mb-line-height`, `--mb-radius`, `--mb-prose-width`, `--mb-max-width`, and `--mb-space`. `--mb-code-font` remains a compatibility fallback for `--mb-font-code`. Set `--mb-bg` only when the article needs its own canvas.

Code block button icons are CSS masks using `data:` SVG URLs, so a host Content-Security-Policy must allow `img-src data:` for them; the button labels still work if they are blocked.

Explicit `theme="light"` or `theme="dark"` selects package defaults independently of host/system detection; `theme="auto"` follows a `.dark` ancestor or system preference, while a `.light` ancestor suppresses the system fallback. Public values supplied by the host still take precedence, so map them for each host theme.

Prose defaults to a centered 42rem measure, while figures use the wider main column. In auto mode, contents opens as a sticky 12rem right rail at an article width of 68rem after hydration; it starts closed in server HTML and is a compact native disclosure before the body below that width. Closing it reclaims the rail. The figure surface can be set separately from the article canvas; author-owned chart colors and canvases are not inverted or recolored. Narrow figures may scroll locally instead of shrinking their labels.

Do not rely on marimo export classes, or wrap the whole renderer in a host `.prose` class: the importer normalizes the export and the renderer owns its internal typography. Check contrast, keyboard focus, narrow containers and print in your host. Upstream marimo's [theming API](https://docs.marimo.io/guides/configuration/theming/) is separate from this publication contract.
