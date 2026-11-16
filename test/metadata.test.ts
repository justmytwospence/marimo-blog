import { describe, expect, it } from 'vitest';
import { hashPublicationConfig, parseMetadataYaml, type PublicationConfig } from '../src/node/metadata.js';

const base = { slug: 'golden', title: 'Golden', date: '2025-01-01', description: 'd' };

describe('publication config hash', () => {
  it('sorts keys by code point, independent of locale', () => {
    const config = { ...base, cells: { b: { include: false }, B: { code: 'visible' }, a: { include: false }, Z: {} } } as PublicationConfig;
    expect(hashPublicationConfig(config)).toBe('aea4bacadc1b59ea87e9c1269a217c1045db7651c02f03b26eee5fb0f3ca7bc5');
    const reversed = { ...base, cells: { Z: {}, a: { include: false }, B: { code: 'visible' }, b: { include: false } } } as PublicationConfig;
    expect(hashPublicationConfig(reversed)).toBe(hashPublicationConfig(config));
  });
});
