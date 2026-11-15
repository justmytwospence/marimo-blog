# React integration

> Server-compatible React components with small client enhancements. React 18/19 types and SSR are tested through a packed package.

The boundary is a server-compatible `MarimoArticle` receiving a compiler- or loader-produced document. For example:

```tsx
import { MarimoArticle } from "marimo-blog/react";
import "marimo-blog/styles.css";

// Obtain document from a validated, precompiled manifest in your host.
export function Post({ document }) {
  return <MarimoArticle document={document} />;
}
```

The Node loader is `readDocument` from `marimo-blog/node`; use it in a server/build context, not a browser bundle. Do not pass arbitrary uploaded JSON directly as a trusted document. `parseDocument` validation reapplies the safe HTML policy at the input boundary.

The component accepts `header`, `footer`, `className`, `theme`, `toc`, and `code` in addition to `document`. A custom header replaces the default title and metadata, not the article body. It renders prose, headings and useful output fallbacks in initial HTML, with client code limited to enhancements. Charts and tables operate on captured assets, not a Python server.

The peer range is React and React DOM 18.3.1 or 19. Run the example and test the actual package version in your host. See [outputs](outputs.md), [security](security.md), and [theming](theming.md).
