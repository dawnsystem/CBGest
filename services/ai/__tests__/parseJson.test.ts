/**
 * @fileoverview Tests de parseModelJson.
 */

import { describe, it, expect } from 'vitest';
import { AiProviderError } from '../errors';
import { parseModelJson } from '../parseJson';

describe('parseModelJson', () => {
  it('parses plain JSON', () => {
    const data = parseModelJson<{ a: number }>('{"a":1}', 'groq');
    expect(data.a).toBe(1);
  });

  it('strips markdown fences', () => {
    const data = parseModelJson<{ number: string }>(
      '```json\n{"number":"F-1"}\n```',
      'openrouter'
    );
    expect(data.number).toBe('F-1');
  });

  it('extracts JSON from surrounding text', () => {
    const data = parseModelJson<{ ok: boolean }>('Here you go: {"ok":true} done', 'gemini');
    expect(data.ok).toBe(true);
  });

  it('throws PARSE on invalid JSON', () => {
    expect(() => parseModelJson('not-json', 'groq')).toThrow(AiProviderError);
  });
});
