/**
 * @fileoverview Tests unwrapBankTransactions.
 */

import { describe, it, expect } from 'vitest';
import { AiProviderError } from '../errors';
import { unwrapBankTransactions } from '../unwrapBankTransactions';

describe('unwrapBankTransactions', () => {
  it('accepts raw arrays', () => {
    const rows = unwrapBankTransactions(
      [{ date: '2024-01-01', concept: 'X', amount: -10 }],
      'groq'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(-10);
  });

  it('unwraps transactions key', () => {
    const rows = unwrapBankTransactions(
      { transactions: [{ date: '2024-01-01', concept: 'Y', amount: 5 }] },
      'openrouter'
    );
    expect(rows[0].concept).toBe('Y');
  });

  it('throws on unknown shape', () => {
    expect(() => unwrapBankTransactions({ foo: 1 }, 'gemini')).toThrow(AiProviderError);
  });
});
