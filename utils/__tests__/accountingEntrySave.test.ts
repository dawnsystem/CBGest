/**
 * @fileoverview Tests de buildFormalEntryToSave (CTB-001)
 * @description Garantiza que guardar un asiento formal limpia isDraft.
 */

import { describe, it, expect } from 'vitest';
import { AccountingEntry, AccountingEntryLine } from '../../types';
import { buildFormalEntryToSave } from '../accountingEntrySave';

const balancedLines: AccountingEntryLine[] = [
  { accountCode: '572', accountName: 'Bancos', debit: 100, credit: 0 },
  { accountCode: '705', accountName: 'Prestaciones', debit: 0, credit: 100 },
];

const draftEntry: AccountingEntry = {
  id: 'DRAFT-1',
  date: '2026-07-15',
  concept: 'Ingreso Airbnb borrador',
  lines: balancedLines,
  reconciled: false,
  isDraft: true,
};

describe('buildFormalEntryToSave (CTB-001)', () => {
  it('fuerza isDraft: false al guardar un borrador como asiento formal', () => {
    const result = buildFormalEntryToSave(draftEntry, balancedLines);

    expect(result.isDraft).toBe(false);
    expect(result.id).toBe('DRAFT-1');
    expect(result.concept).toBe('Ingreso Airbnb borrador');
    expect(result.lines).toEqual(balancedLines);
  });

  it('mantiene isDraft: false si el asiento ya era formal', () => {
    const formal: AccountingEntry = { ...draftEntry, isDraft: false };
    const result = buildFormalEntryToSave(formal, balancedLines);

    expect(result.isDraft).toBe(false);
  });

  it('limpia isDraft aunque el spread del borrador lo traiga como true', () => {
    const result = buildFormalEntryToSave(
      { ...draftEntry, isDraft: true },
      balancedLines
    );

    // Regresión CTB-001: sin forzar isDraft:false, el spread deja el borrador marcado
    expect(result.isDraft).not.toBe(true);
    expect(result.isDraft).toBe(false);
  });

  it('sincroniza campos legacy desde la primera línea válida', () => {
    const result = buildFormalEntryToSave(draftEntry, balancedLines);

    expect(result.accountCode).toBe('572');
    expect(result.accountName).toBe('Bancos');
    expect(result.debit).toBe(100);
    expect(result.credit).toBe(0);
  });

  it('usa las líneas filtradas pasadas, no las originales del asiento', () => {
    const entryWithEmpty: AccountingEntry = {
      ...draftEntry,
      lines: [
        ...balancedLines,
        { accountCode: '', accountName: '', debit: 0, credit: 0 },
      ],
    };

    const result = buildFormalEntryToSave(entryWithEmpty, balancedLines);

    expect(result.lines).toHaveLength(2);
    expect(result.lines.every((l) => l.accountCode)).toBe(true);
  });
});
