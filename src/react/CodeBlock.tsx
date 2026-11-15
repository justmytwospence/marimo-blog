import { codeBlockHtml, resolveLanguage, type CodeBlockOptions } from './code.js';

/** Server-highlighted code; CodeEnhancer adds the interactive header buttons on the client. */
export function CodeBlock({ code, language, options }: { code: string; language: string; options?: CodeBlockOptions }) {
  return <div className="mb-codeblock-host" dangerouslySetInnerHTML={{ __html: codeBlockHtml(code, resolveLanguage(language, 'python'), options) }} />;
}
