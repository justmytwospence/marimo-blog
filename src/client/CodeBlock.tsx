'use client';

import { useEffect, useState } from 'react';

export function CodeBlock({ code, language }: { code: string; language: string }) {
  const [status, setStatus] = useState('');
  useEffect(() => { setStatus(''); }, [code]);
  return <div className="mb-code"><div className="mb-actions"><span>{language}</span><button type="button" onClick={async () => {
    try { await navigator.clipboard.writeText(code); setStatus('Copied'); }
    catch { setStatus('Could not copy code'); }
  }}>Copy code</button><span role="status" aria-live="polite">{status}</span></div><pre className="mb-code-scroll"><code>{code}</code></pre></div>;
}
