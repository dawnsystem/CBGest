/**
 * @fileoverview Tests de normalización tipo/cuenta tras análisis IA.
 */

import { describe, it, expect } from 'vitest';
import type { InvoiceAiResponse } from '../types';
import {
  DEFAULT_EXPENSE_ACCOUNT,
  DEFAULT_RENTAL_INCOME_ACCOUNT,
  looksLikeClearCbExpense,
  looksLikePlatformCommission,
  looksLikeRentalIncome,
  normalizeInvoiceAiResponse,
} from '../normalizeInvoiceResponse';

function base(overrides: Partial<InvoiceAiResponse> = {}): InvoiceAiResponse {
  return {
    number: 'F-1',
    date: '2026-03-01',
    issuerName: 'Proveedor SA',
    issuerNif: 'B12345678',
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
  };
}

describe('looksLikeRentalIncome', () => {
  it('detecta inquilino / alquiler / estancia', () => {
    expect(looksLikeRentalIncome('Factura inquilino marzo')).toBe(true);
    expect(looksLikeRentalIncome('Alquiler vivienda')).toBe(true);
    expect(looksLikeRentalIncome('Estancia 3 noches')).toBe(true);
  });

  it('no detecta suministros genéricos', () => {
    expect(looksLikeRentalIncome('Factura Endesa luz')).toBe(false);
  });
});

describe('looksLikePlatformCommission', () => {
  it('detecta comisión Booking', () => {
    expect(looksLikePlatformCommission('Comisión Booking marzo')).toBe(true);
  });
});

describe('looksLikeClearCbExpense', () => {
  it('detecta luz / reparación', () => {
    expect(looksLikeClearCbExpense('Factura luz Endesa')).toBe(true);
    expect(looksLikeClearCbExpense('Reparación fontanería')).toBe(true);
  });
});

describe('normalizeInvoiceAiResponse', () => {
  it('corrige INCOME + 629 → 705 (caso típico modelo free)', () => {
    const out = normalizeInvoiceAiResponse(
      base({ type: 'INCOME', suggestedAccountCode: '629', concept: 'Servicios' })
    );
    expect(out.type).toBe('INCOME');
    expect(out.suggestedAccountCode).toBe(DEFAULT_RENTAL_INCOME_ACCOUNT);
  });

  it('corrige factura de inquilino mal puesta en 629 como gasto', () => {
    const out = normalizeInvoiceAiResponse(
      base({
        type: 'EXPENSE',
        suggestedAccountCode: '629',
        issuerName: 'CB Casa Blanca',
        concept: 'Alquiler marzo inquilino',
      })
    );
    expect(out.type).toBe('INCOME');
    expect(out.suggestedAccountCode).toBe('705');
  });

  it('corrige EXPENSE + 628 cuando el concepto es renta', () => {
    const out = normalizeInvoiceAiResponse(
      base({
        type: 'EXPENSE',
        suggestedAccountCode: '628',
        concept: 'Renta mensual arrendatario',
      })
    );
    expect(out.type).toBe('INCOME');
    expect(out.suggestedAccountCode).toBe('705');
  });

  it('no convierte comisión Booking en ingreso aunque diga booking', () => {
    const out = normalizeInvoiceAiResponse(
      base({
        type: 'EXPENSE',
        suggestedAccountCode: '629',
        concept: 'Comisión Booking.com host fee',
        issuerName: 'Booking.com',
      })
    );
    expect(out.type).toBe('EXPENSE');
    expect(out.suggestedAccountCode).toBe('629');
  });

  it('mantiene gasto de luz en 628', () => {
    const out = normalizeInvoiceAiResponse(
      base({
        type: 'EXPENSE',
        suggestedAccountCode: '628',
        issuerName: 'Endesa',
        concept: 'Suministro electricidad marzo',
      })
    );
    expect(out.type).toBe('EXPENSE');
    expect(out.suggestedAccountCode).toBe('628');
  });

  it('no fuerza ingreso si menciona inquilino pero es reparación', () => {
    const out = normalizeInvoiceAiResponse(
      base({
        type: 'EXPENSE',
        suggestedAccountCode: '622',
        concept: 'Reparación caldera piso inquilino',
      })
    );
    expect(out.type).toBe('EXPENSE');
    expect(out.suggestedAccountCode).toBe('622');
  });

  it('EXPENSE + 705 inválido → 629', () => {
    const out = normalizeInvoiceAiResponse(
      base({
        type: 'EXPENSE',
        suggestedAccountCode: '705',
        concept: 'Material oficina',
      })
    );
    expect(out.type).toBe('EXPENSE');
    expect(out.suggestedAccountCode).toBe(DEFAULT_EXPENSE_ACCOUNT);
  });

  it('cuenta inexistente en INCOME → 705', () => {
    const out = normalizeInvoiceAiResponse(
      base({
        type: 'INCOME',
        suggestedAccountCode: '9999',
        concept: 'Prestación',
      })
    );
    expect(out.suggestedAccountCode).toBe('705');
  });

  it('detecta alquiler solo en issuerName', () => {
    const out = normalizeInvoiceAiResponse(
      base({
        type: 'EXPENSE',
        suggestedAccountCode: '621',
        issuerName: 'Inquilino Juan Pérez',
        concept: null,
      })
    );
    expect(out.type).toBe('INCOME');
    expect(out.suggestedAccountCode).toBe('705');
  });
});
