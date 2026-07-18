import { describe, expect, it } from 'vitest';
import {
  amountToCents,
  buildContentFingerprint,
  computeFileSha256,
  findDuplicateByContentFingerprint,
  findDuplicateByFileHash,
  normalizeInvoiceNumber,
} from '../invoiceDedup';
import type { Invoice } from '../../types';

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  number: 'F-001',
  date: '2026-07-01',
  issuerName: 'Proveedor SA',
  issuerNif: 'B-12345678',
  baseAmount: 100,
  vatRate: 21,
  vatAmount: 21,
  totalAmount: 121,
  type: 'EXPENSE',
  status: 'PENDING',
  history: [],
  ...overrides,
});

describe('computeFileSha256', () => {
  it('hashes a Blob deterministically', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' });
    const hash = await computeFileSha256(blob);
    expect(hash).toHaveLength(64);
    expect(await computeFileSha256(blob)).toBe(hash);
  });

  it('throws a controlled error when SubtleCrypto is unavailable', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis.crypto, 'subtle');
    Object.defineProperty(globalThis.crypto, 'subtle', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    try {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' });
      await expect(computeFileSha256(blob)).rejects.toThrow(
        'Web Crypto SubtleCrypto no está disponible en este entorno'
      );
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis.crypto, 'subtle', originalDescriptor);
      }
    }
  });
});

describe('normalizeInvoiceNumber', () => {
  it('elimina separadores y unifica mayúsculas', () => {
    expect(normalizeInvoiceNumber('f-001')).toBe('F001');
    expect(normalizeInvoiceNumber('F 001')).toBe('F001');
    expect(normalizeInvoiceNumber('F_001')).toBe('F001');
  });
});

describe('amountToCents', () => {
  it('convierte importes con decimales a céntimos', () => {
    expect(amountToCents(21.1)).toBe(2110);
    expect(amountToCents(21.10)).toBe(2110);
    expect(amountToCents(121)).toBe(12100);
  });
});

describe('buildContentFingerprint', () => {
  it('normaliza NIF, número e importe', () => {
    const fp1 = buildContentFingerprint({
      issuerNif: 'B-12345678',
      number: 'F-001',
      date: '2026-07-01',
      totalAmount: 121,
    });
    const fp2 = buildContentFingerprint({
      issuerNif: 'B12345678',
      number: 'F001',
      date: '2026-07-01',
      totalAmount: 121,
    });
    expect(fp1).toBe(fp2);
    expect(fp1).toBe('B12345678|F001|2026-07-01|12100');
  });
});

describe('findDuplicateByFileHash', () => {
  it('encuentra por hash en el mismo ejercicio', () => {
    const invoices = [
      makeInvoice({ id: 'a', fileHash: 'abc123', fiscalYearId: 'fy-2026' }),
      makeInvoice({ id: 'b', fileHash: 'other', fiscalYearId: 'fy-2026' }),
    ];
    expect(findDuplicateByFileHash(invoices, 'abc123', 'fy-2026')?.id).toBe('a');
    expect(findDuplicateByFileHash(invoices, 'abc123', 'fy-2027')).toBeUndefined();
  });
});

describe('findDuplicateByContentFingerprint', () => {
  it('encuentra por huella calculada o persistida', () => {
    const fp = buildContentFingerprint(makeInvoice());
    const invoices = [
      makeInvoice({ id: 'a', contentFingerprint: fp, fiscalYearId: 'fy-2026' }),
      makeInvoice({ id: 'b', number: 'X-99', fiscalYearId: 'fy-2026' }),
    ];
    expect(findDuplicateByContentFingerprint(invoices, fp, 'fy-2026')?.id).toBe('a');

    const legacy = makeInvoice({ id: 'c', number: 'F-001', issuerNif: 'B12345678', fiscalYearId: 'fy-2026' });
    expect(findDuplicateByContentFingerprint([legacy], fp, 'fy-2026')?.id).toBe('c');
  });
});
