'use client';

import { useState } from 'react';

export function ArticleControls() {
  const [expanded, setExpanded] = useState(false);
  return <button type="button" onClick={(event) => {
    const article = event.currentTarget.closest('.marimo-blog');
    if (!article) return;
    const next = !expanded;
    article.querySelectorAll<HTMLDetailsElement>('.mb-code-details').forEach((details) => { details.open = next; });
    setExpanded(next);
  }}>{expanded ? 'Hide code' : 'Show code'}</button>;
}
