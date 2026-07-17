import { describe, it, expect } from 'vitest';
import {
  amountToFingerprintKey,
  buildTransactionFingerprintKey,
  computeFileSha256,
  normalizeConcept,
  sha256Hex,
  statementContentFingerprint,
  transactionFingerprint,
  enrichTransactionsWithFingerprints,
} from '../bankStatementFingerprint';
import { collectExistingLineFingerprints, prepareBankImport } from '../bankStatementDedup';

describe('bankStatementFingerprint', () => {
  describe('normalizeConcept', () => {
    it('collapses whitespace and lowercases', () => {
      expect(normalizeConcept('  RECIBO   LUZ  ')).toBe('recibo luz');
    });

    it('strips zero-width characters', () => {
      expect(normalizeConcept('pago\u200Btransferencia')).toBe('pagotransferencia');
    });
  });

  describe('amountToFingerprintKey', () => {
    it('formats with two decimals', () => {
      expect(amountToFingerprintKey(-150.5)).toBe('-150.50');
      expect(amountToFingerprintKey(800)).toBe('800.00');
    });
  });

  describe('transactionFingerprint', () => {
    it('is stable for equivalent concepts', async () => {
      const a = await transactionFingerprint('2027-01-15', -150.5, 'RECIBO LUZ');
      const b = await transactionFingerprint('2027-01-15', -150.5, '  recibo   luz ');
      expect(a).toBe(b);
      expect(a).toHaveLength(64);
    });

    it('differs when amount or date changes', async () => {
      const base = await transactionFingerprint('2027-01-15', -150.5, 'RECIBO LUZ');
      const otherAmount = await transactionFingerprint('2027-01-15', -150.51, 'RECIBO LUZ');
      const otherDate = await transactionFingerprint('2027-01-16', -150.5, 'RECIBO LUZ');
      expect(base).not.toBe(otherAmount);
      expect(base).not.toBe(otherDate);
    });

    it('buildTransactionFingerprintKey matches hash input shape', () => {
      expect(buildTransactionFingerprintKey('2027-01-15', -10, 'Luz')).toBe(
        '2027-01-15|-10.00|luz'
      );
    });
  });

  describe('statementContentFingerprint', () => {
    it('is order-independent', async () => {
      const txsA = [
        { date: '2027-01-01', amount: 100, concept: 'A' },
        { date: '2027-01-02', amount: -50, concept: 'B' },
      ];
      const txsB = [
        { date: '2027-01-02', amount: -50, concept: 'B' },
        { date: '2027-01-01', amount: 100, concept: 'A' },
      ];
      expect(await statementContentFingerprint(txsA)).toBe(await statementContentFingerprint(txsB));
    });

    it('changes when a movement differs', async () => {
      const a = await statementContentFingerprint([
        { date: '2027-01-01', amount: 100, concept: 'A' },
      ]);
      const b = await statementContentFingerprint([
        { date: '2027-01-01', amount: 101, concept: 'A' },
      ]);
      expect(a).not.toBe(b);
    });
  });

  describe('computeFileSha256 / sha256Hex', () => {
    it('hashes string deterministically', async () => {
      const hash = await sha256Hex('cbgest');
      expect(hash).toHaveLength(64);
      expect(await sha256Hex('cbgest')).toBe(hash);
    });

    it('hashes File and ArrayBuffer sources', async () => {
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const fromBytes = await computeFileSha256(bytes);
      expect(fromBytes).toHaveLength(64);
      expect(await computeFileSha256(bytes.buffer)).toBe(fromBytes);

      const file = new File([bytes], 'extracto.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const fromFile = await computeFileSha256(file);
      expect(fromFile).toHaveLength(64);
      // Same content must be stable across repeated File hashes
      expect(await computeFileSha256(file)).toBe(fromFile);
    });
  });

  describe('enrichTransactionsWithFingerprints', () => {
    it('adds contentFingerprint to each row', async () => {
      const enriched = await enrichTransactionsWithFingerprints([
        { date: '2027-01-01', amount: 1, concept: 'X' },
      ]);
      expect(enriched[0].contentFingerprint).toHaveLength(64);
    });
  });
});

describe('bankStatementDedup', () => {
  it('rejects full duplicate statement by content fingerprint', async () => {
    const txs = [
      { date: '2027-01-01', amount: 10, concept: 'A' },
      { date: '2027-01-02', amount: -5, concept: 'B' },
    ];
    const statementFp = await statementContentFingerprint(txs);
    const result = await prepareBankImport(txs, new Set(), new Set([statementFp]), 'batch-1');
    expect(result.isDuplicateStatement).toBe(true);
    expect(result.toImport).toHaveLength(0);
    expect(result.message).toMatch(/ya fue importado/i);
  });

  it('imports only new lines when periods overlap', async () => {
    const existing = await enrichTransactionsWithFingerprints([
      { date: '2027-01-01', amount: 10, concept: 'A' },
    ]);
    const lineSet = await collectExistingLineFingerprints(existing);
    const incoming = [
      { date: '2027-01-01', amount: 10, concept: 'A' },
      { date: '2027-01-03', amount: 20, concept: 'C' },
    ];
    const result = await prepareBankImport(incoming, lineSet, new Set(), 'batch-2');
    expect(result.isDuplicateStatement).toBe(false);
    expect(result.toImport).toHaveLength(1);
    expect(result.toImport[0].concept).toBe('C');
    expect(result.skippedDuplicates).toBe(1);
    expect(result.message).toMatch(/1 movimientos nuevos/);
  });

  it('treats all-line duplicates as duplicate statement', async () => {
    const existing = await enrichTransactionsWithFingerprints([
      { date: '2027-01-01', amount: 10, concept: 'A' },
    ]);
    const lineSet = await collectExistingLineFingerprints(existing);
    const result = await prepareBankImport(
      [{ date: '2027-01-01', amount: 10, concept: '  a ' }],
      lineSet,
      new Set(),
      'batch-3'
    );
    expect(result.isDuplicateStatement).toBe(true);
    expect(result.toImport).toHaveLength(0);
  });
});
