# Theming

> Scoped CSS, inherited typography and explicit light/dark/auto themes.

Import `marimo-blog/styles.css` in the host. Styles are scoped under `.marimo-blog`, inherit host typography, and expose `--mb-*` variables for colors, code, fonts, spacing, article width and table-of-contents offset. The defaults include light/dark, responsive and print styles; `theme="auto"` and explicit themes are component options. Variables include `--mb-bg`, `--mb-text`, `--mb-muted`, `--mb-border`, `--mb-accent`, `--mb-code-bg`, `--mb-surface`, `--mb-code-font`, `--mb-prose-width`, `--mb-max-width`, `--mb-space`, and `--mb-toc-offset`.

Map your site's tokens with a host selector such as `.my-site .marimo-blog` that overrides the package defaults rather than relying on marimo's internal CSS classes. The importer discards arbitrary export CSS and custom head content; a notebook theme is not automatically your site's theme. Preserve author-specified chart colors rather than recoloring scientific figures on theme changes. Check contrast, keyboard focus, narrow containers and print output in your own host.

Upstream marimo has a separate [theming API](https://docs.marimo.io/guides/configuration/theming/); its CSS variables and notebook styling are not this package's publication contract.
