# Quickstart

> Pre-release: use a locally packed build until a registry version is published. The commands below are implemented; publishing is a separate operation.

## 1. Produce an executed export

In the notebook's own environment, with a trusted notebook and its dependencies available:

```sh
marimo export html notebook.py -o notebook.html
```

The [official static export guide](https://docs.marimo.io/guides/exporting/static_html/) says this command **runs the notebook** and can write an HTML file even when it exits nonzero. Treat a nonzero exit as failure and inspect the saved outputs. Alternatively, download the current view from the editor. The HTML export is not itself a native server-rendered article.

## 2. Prepare metadata

Create `post.yaml`:

```yaml
slug: example-post
title: Example post
date: "2026-01-15"
description: A short description of the article.
```

These are required fields; see [metadata](metadata.md). Choose a real publication date. Review source, outputs and assets for private information.

## 3. Compile and check

Compile and validate without executing Python:

```sh
marimo-blog inspect notebook.html
marimo-blog build notebook.html --metadata post.yaml --out content/example-post.marimo.json --assets public/notebooks/example-post --asset-base /notebooks/example-post
marimo-blog check content/example-post.marimo.json --assets public/notebooks/example-post --asset-base /notebooks/example-post --metadata post.yaml
```

Use a dedicated asset directory per article. Review diagnostics instead of suppressing them wholesale. Commit or otherwise deploy the manifest and its generated assets together; serve the asset directory at the specified URL path. The build/check stages neither execute Python nor fetch remote resources.

## 4. Render

Pass the validated, precompiled document to `MarimoArticle`; see [React](react.md) and [Next.js](next.md). Import `marimo-blog/styles.css` once in the host. Rendering needs no Python runtime by default. For an independently hosted interactive version, see [WASM](wasm.md).
