/**
 * @fileoverview Tests de identidad CB (Settings → prompt / matching emisor).
 */

import { describe, it, expect } from 'vitest';
import {
  cbIssuerFromSettings,
  isIssuerOwnCb,
  namesLikelyMatch,
  normalizeFiscalId,
} from '../cbIssuerContext';
import { buildInvoicePrompt } from '../prompts';
import { normalizeInvoiceAiResponse } from '../normalizeInvoiceResponse';
import type { InvoiceAiResponse } from '../types';

describe('cbIssuerContext', () => {
  it('normaliza NIF quitando ES y separadores', () => {
    expect(normalizeFiscalId('ES B-12345678')).toBe('B12345678');
  });

  it('cbIssuerFromSettings lee cbName/nif/domicilio', () => {
    const ctx = cbIssuerFromSettings({
      cbName: 'CB Sol y Mar',
      nif: 'E12345678',
      address: 'Carrer Major',
      streetNumber: '1',
      postalCode: '08001',
      city: 'Barcelona',
      province: 'Barcelona',
    });
    expect(ctx?.cbName).toBe('CB Sol y Mar');
    expect(ctx?.nif).toBe('E12345678');
    expect(ctx?.addressLine).toContain('08001');
  });

  it('isIssuerOwnCb por NIF aunque el nombre difiera', () => {
    const cb = { cbName: 'CB Sol y Mar', nif: 'E12345678' };
    expect(isIssuerOwnCb('Otra Razón', 'E-12345678', cb)).toBe(true);
  });

  it('isIssuerOwnCb por nombre si no hay NIF en documento', () => {
    const cb = { cbName: 'Comunidad de Bienes Sol y Mar', nif: 'E12345678' };
    expect(isIssuerOwnCb('C.B. Sol y Mar', '', cb)).toBe(true);
  });

  it('namesLikelyMatch ignora forma jurídica', () => {
    expect(namesLikelyMatch('CB Casa Blanca', 'Casa Blanca C.B.')).toBe(true);
  });
});

describe('buildInvoicePrompt + identidad CB', () => {
  it('inyecta razón social y NIF de Settings en el prompt', () => {
    const prompt = buildInvoicePrompt([], {
      cbName: 'CB Test Demo',
      nif: 'E99887766',
      addressLine: 'Calle 1, 08001 Barcelona',
    });
    expect(prompt).toContain('CB Test Demo');
    expect(prompt).toContain('E99887766');
    expect(prompt).toContain('REGLA DE EMISOR PROPIO');
  });
});

describe('normalizeInvoiceAiResponse + emisor propio', () => {
  const base = (overrides: Partial<InvoiceAiResponse> = {}): InvoiceAiResponse => ({
    number: 'F-100',
    date: '2026-03-01',
    issuerName: 'Endesa',
    issuerNif: 'A81948077',
    issuerNifType: 'CIF',
    issuerAddress: null,
    issuerCity: null,
    issuerPostalCode: null,
    issuerCountry: null,
    matchedSupplierId: null,
    baseAmount: 100,
    vatRate: 21,
    vatAmount: 21,
    totalAmount: 121,
    type: 'EXPENSE',
    suggestedAccountCode: '629',
    concept: null,
    ...overrides,
  });

  it('si emisor NIF = CB → INCOME 705 aunque el modelo diga EXPENSE 629', () => {
    const out = normalizeInvoiceAiResponse(
      base({
        issuerName: 'CB Sol',
        issuerNif: 'E12345678',
        type: 'EXPENSE',
        suggestedAccountCode: '629',
        matchedSupplierId: 'Algún proveedor',
      }),
      { cbName: 'CB Sol y Mar', nif: 'E12345678' }
    );
    expect(out.type).toBe('INCOME');
    expect(out.suggestedAccountCode).toBe('705');
    expect(out.matchedSupplierId).toBeNull();
  });

  it('no marca como propia una factura de Endesa', () => {
    const out = normalizeInvoiceAiResponse(
      base({
        issuerName: 'Endesa Energía',
        issuerNif: 'A81948077',
        suggestedAccountCode: '628',
        concept: 'Suministro electricidad',
      }),
      { cbName: 'CB Sol', nif: 'E12345678' }
    );
    expect(out.type).toBe('EXPENSE');
    expect(out.suggestedAccountCode).toBe('628');
  });
});
