# Next.js App Router

> The packed-package test builds a Next 16 / React 19 App Router consumer without Python.

Compile notebook HTML before the Next build. Keep the document on the server and place the generated assets beneath the site's public directory at the URL used as `--asset-base`. A server component can load the manifest with `readDocument` from `marimo-blog/node`, then pass it to `MarimoArticle` from `marimo-blog/react`. Import `marimo-blog/styles.css` in the app's global CSS entry or root layout, as supported by the host.

The boundary keeps Node filesystem APIs out of client components and allows individual interactive outputs to hydrate without turning the whole article into a client component. Do not expose local authoring paths or private files. Ship each manifest with its corresponding assets and run `marimo-blog check` using the actual deployment URL base and metadata.

Python and marimo are needed to create the export, not for the Next build or default reader experience. The repository includes an App Router example and a packed-package build check. See [React](react.md) and [security](security.md).
