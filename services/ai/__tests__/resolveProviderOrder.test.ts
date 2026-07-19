/**
 * @fileoverview Tests del orden de proveedores.
 */

import { describe, it, expect } from 'vitest';
import { resolveProviderOrder } from '../resolveProviderOrder';

describe('resolveProviderOrder', () => {
  it('returns default order for auto', () => {
    expect(
      resolveProviderOrder({ preferredProvider: 'auto', failoverEnabled: true })
    ).toEqual(['gemini', 'groq', 'openrouter']);
  });

  it('puts preferred provider first', () => {
    expect(
      resolveProviderOrder({ preferredProvider: 'groq', failoverEnabled: true })
    ).toEqual(['groq', 'gemini', 'openrouter']);
    expect(
      resolveProviderOrder({ preferredProvider: 'openrouter', failoverEnabled: false })
    ).toEqual(['openrouter', 'gemini', 'groq']);
  });
});
