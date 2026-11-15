import { describe, expect, it } from 'vitest';
import { compileMime } from '../../src/node/mime.js';
import { AssetCollector } from '../../src/node/assets.js';
import type { MimeContext } from '../../src/node/mime.js';

function context(): MimeContext {
  return { html: { title: 'Test', toc: [], usedIds: new Set(), consumedTitle: false, cellId: 'empty' }, assets: new AssetCollector({ files: {}, assetBase: '/assets' }), diagnostics: [], cellId: 'empty', outputIndex: 0 };
}
const plain = (text: string) => ({ type: 'data', data: { 'text/plain': text } });

describe('empty plain-text results', () => {
  it('are dropped, while real values are kept', async () => {
    expect(await compileMime(plain(''), context())).toEqual([]);
    expect(await compileMime(plain('  \n'), context())).toEqual([]);
    expect(await compileMime(plain('0'), context())).toEqual([{ type: 'text', text: '0' }]);
  });
});
