/**
 * @fileoverview Tests de clasificación de errores IA.
 */

import { describe, it, expect } from 'vitest';
import {
  AiProviderError,
  classifyHttpError,
  isFailoverableError,
  toProviderError,
} from '../errors';

describe('ai/errors', () => {
  it('classifyHttpError detects quota and rate limit', () => {
    expect(classifyHttpError({ message: 'quota exceeded', status: 429 })).toBe('QUOTA');
    expect(classifyHttpError({ message: 'rate limit', status: 429 })).toBe('RATE_LIMIT');
  });

  it('classifyHttpError detects auth', () => {
    expect(classifyHttpError({ message: 'Invalid API key', status: 401 })).toBe('AUTH');
    expect(classifyHttpError({ message: 'unauthorized', status: 403 })).toBe('AUTH');
  });

  it('classifyHttpError detects Gemini 503 / high demand from JSON body', () => {
    const gemini503 = {
      message:
        '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}',
    };
    expect(classifyHttpError(gemini503)).toBe('TRANSIENT');
    expect(classifyHttpError({ message: 'high demand, try again later' })).toBe('TRANSIENT');
  });

  it('classifyHttpError detects transient and parse', () => {
    expect(classifyHttpError({ message: 'timeout', status: 504 })).toBe('TRANSIENT');
    expect(classifyHttpError({ message: 'Unexpected token in JSON' })).toBe('PARSE');
  });

  it('isFailoverableError is true for provider errors', () => {
    expect(isFailoverableError(new AiProviderError('gemini', 'QUOTA', 'x'))).toBe(true);
    expect(isFailoverableError(new AiProviderError('groq', 'AUTH', 'x'))).toBe(true);
    expect(isFailoverableError(new Error('boom'))).toBe(true);
  });

  it('toProviderError wraps unknown errors', () => {
    const err = toProviderError('openrouter', { message: 'quota', status: 429 }, 'fallback');
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.code).toBe('QUOTA');
    expect(err.providerId).toBe('openrouter');
  });
});
