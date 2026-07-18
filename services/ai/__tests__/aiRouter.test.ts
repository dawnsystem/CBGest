/**
 * @fileoverview Tests del router multi-IA con failover.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AiDocumentProvider } from '../provider';
import { AiProviderError } from '../errors';

const invoiceData = {
  number: 'INV-1',
  date: '2024-01-15',
  issuerName: 'ACME',
  issuerNif: 'B12345678',
  issuerNifType: 'CIF' as const,
  issuerAddress: null,
  issuerCity: null,
  issuerPostalCode: null,
  issuerCountry: null,
  matchedSupplierId: null,
  baseAmount: 100,
  vatRate: 21,
  vatAmount: 21,
  totalAmount: 121,
  type: 'EXPENSE' as const,
  suggestedAccountCode: '628',
};

function makeProvider(
  id: 'gemini' | 'groq' | 'openrouter',
  opts: {
    configured?: boolean;
    analyzeInvoice?: AiDocumentProvider['analyzeInvoice'];
  } = {}
): AiDocumentProvider {
  return {
    id,
    displayName: id,
    supportsPdfNative: id === 'gemini',
    isConfigured: () => opts.configured !== false,
    analyzeInvoice:
      opts.analyzeInvoice ??
      (async () => invoiceData),
    analyzeBankStatement: async () => [],
  };
}

describe('aiRouter failover', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../providers/geminiProvider');
    vi.doUnmock('../providers/groqProvider');
    vi.doUnmock('../providers/openrouterProvider');
    vi.resetModules();
  });

  it('uses preferred provider when available', async () => {
    const gemini = makeProvider('gemini');
    const groq = makeProvider('groq', {
      analyzeInvoice: async () => ({ ...invoiceData, number: 'FROM-GROQ' }),
    });
    const openrouter = makeProvider('openrouter', { configured: false });

    vi.doMock('../providers/geminiProvider', () => ({ geminiProvider: gemini }));
    vi.doMock('../providers/groqProvider', () => ({ groqProvider: groq }));
    vi.doMock('../providers/openrouterProvider', () => ({ openrouterProvider: openrouter }));

    const { analyzeInvoiceWithRouter } = await import('../aiRouter');
    const result = await analyzeInvoiceWithRouter('b64', 'image/jpeg', [], {
      preferredProvider: 'groq',
      failoverEnabled: true,
    });

    expect(result.data.number).toBe('FROM-GROQ');
    expect(result.meta.usedProvider).toBe('groq');
    expect(result.meta.attemptedProviders).toEqual(['groq']);
  });

  it('failovers to next provider on QUOTA', async () => {
    const gemini = makeProvider('gemini', {
      analyzeInvoice: async () => {
        throw new AiProviderError('gemini', 'QUOTA', 'Cuota excedida');
      },
    });
    const groq = makeProvider('groq', {
      analyzeInvoice: async () => ({ ...invoiceData, number: 'GROQ-OK' }),
    });
    const openrouter = makeProvider('openrouter', { configured: false });

    vi.doMock('../providers/geminiProvider', () => ({ geminiProvider: gemini }));
    vi.doMock('../providers/groqProvider', () => ({ groqProvider: groq }));
    vi.doMock('../providers/openrouterProvider', () => ({ openrouterProvider: openrouter }));

    const { analyzeInvoiceWithRouter } = await import('../aiRouter');
    const result = await analyzeInvoiceWithRouter('b64', 'image/jpeg', [], {
      preferredProvider: 'gemini',
      failoverEnabled: true,
    });

    expect(result.data.number).toBe('GROQ-OK');
    expect(result.meta.usedProvider).toBe('groq');
    expect(result.meta.attemptedProviders).toEqual(['gemini', 'groq']);
  });

  it('does not failover when disabled', async () => {
    const gemini = makeProvider('gemini', {
      analyzeInvoice: async () => {
        throw new AiProviderError('gemini', 'QUOTA', 'Cuota excedida');
      },
    });
    const groq = makeProvider('groq');
    const openrouter = makeProvider('openrouter', { configured: false });

    vi.doMock('../providers/geminiProvider', () => ({ geminiProvider: gemini }));
    vi.doMock('../providers/groqProvider', () => ({ groqProvider: groq }));
    vi.doMock('../providers/openrouterProvider', () => ({ openrouterProvider: openrouter }));

    const { analyzeInvoiceWithRouter } = await import('../aiRouter');
    await expect(
      analyzeInvoiceWithRouter('b64', 'image/jpeg', [], {
        preferredProvider: 'gemini',
        failoverEnabled: false,
      })
    ).rejects.toThrow(/ninguna IA disponible|Cuota excedida|Intentados: gemini/i);
  });

  it('skips providers without API key', async () => {
    const gemini = makeProvider('gemini', { configured: false });
    const groq = makeProvider('groq', {
      analyzeInvoice: async () => ({ ...invoiceData, number: 'ONLY-GROQ' }),
    });
    const openrouter = makeProvider('openrouter', { configured: false });

    vi.doMock('../providers/geminiProvider', () => ({ geminiProvider: gemini }));
    vi.doMock('../providers/groqProvider', () => ({ groqProvider: groq }));
    vi.doMock('../providers/openrouterProvider', () => ({ openrouterProvider: openrouter }));

    const { analyzeInvoiceWithRouter } = await import('../aiRouter');
    const result = await analyzeInvoiceWithRouter('b64', 'image/jpeg', [], {
      preferredProvider: 'auto',
      failoverEnabled: true,
    });

    expect(result.meta.usedProvider).toBe('groq');
    expect(result.meta.attemptedProviders).toEqual(['groq']);
  });

  it('throws when no provider is configured', async () => {
    vi.doMock('../providers/geminiProvider', () => ({
      geminiProvider: makeProvider('gemini', { configured: false }),
    }));
    vi.doMock('../providers/groqProvider', () => ({
      groqProvider: makeProvider('groq', { configured: false }),
    }));
    vi.doMock('../providers/openrouterProvider', () => ({
      openrouterProvider: makeProvider('openrouter', { configured: false }),
    }));

    const { analyzeInvoiceWithRouter } = await import('../aiRouter');
    await expect(
      analyzeInvoiceWithRouter('b64', 'image/jpeg', [], {
        preferredProvider: 'auto',
        failoverEnabled: true,
      })
    ).rejects.toThrow(/Ninguna API key/i);
  });
});
