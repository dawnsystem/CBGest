/**
 * @fileoverview Tests de lógica de migración por fecha ↔ ejercicio
 */

import { describe, it, expect } from 'vitest';
import {
  buildFiscalYearMaps,
  analyzeDocumentsForDateMismatch,
  summarizeDateMismatches,
  groupMismatchesByRoute,
} from '../fiscalYearDateMigration';
import type { FiscalYear } from '../../types';

const fiscalYears: FiscalYear[] = [
  { id: 'fy-2028', appwriteId: 'fy-2028', year: 2028, status: 'OPEN' },
  { id: 'fy-2027', appwriteId: 'fy-2027', year: 2027, status: 'OPEN' },
];

describe('fiscalYearDateMigration', () => {
  it('buildFiscalYearMaps enlaza año e ID', () => {
    const { idToYear, yearToId } = buildFiscalYearMaps(fiscalYears);
    expect(idToYear.get('fy-2027')).toBe(2027);
    expect(yearToId.get(2028)).toBe('fy-2028');
  });

  it('detecta factura de 2027 en ejercicio 2028', () => {
    const { idToYear, yearToId } = buildFiscalYearMaps(fiscalYears);
    const docs = [{
      $id: 'inv-1',
      fiscalYearId: 'fy-2028',
      date: '2027-03-15',
      number: 'F-001',
      issuerName: 'Proveedor SA',
    }];

    const { mismatches, unmappable } = analyzeDocumentsForDateMismatch(
      'invoices',
      docs,
      idToYear,
      yearToId
    );

    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].sourceFiscalYear).toBe(2028);
    expect(mismatches[0].targetFiscalYear).toBe(2027);
    expect(mismatches[0].targetFiscalYearId).toBe('fy-2027');
    expect(unmappable).toHaveLength(0);
  });

  it('ignora documentos cuya fecha coincide con el ejercicio', () => {
    const { idToYear, yearToId } = buildFiscalYearMaps(fiscalYears);
    const docs = [{
      $id: 'inv-2',
      fiscalYearId: 'fy-2027',
      date: '2027-12-31',
      number: 'F-002',
    }];

    const { mismatches } = analyzeDocumentsForDateMismatch(
      'invoices',
      docs,
      idToYear,
      yearToId
    );

    expect(mismatches).toHaveLength(0);
  });

  it('marca como no corregible si no existe ejercicio destino', () => {
    const { idToYear, yearToId } = buildFiscalYearMaps(fiscalYears);
    const docs = [{
      $id: 'inv-3',
      fiscalYearId: 'fy-2028',
      date: '2026-01-01',
      number: 'F-003',
    }];

    const { mismatches, unmappable } = analyzeDocumentsForDateMismatch(
      'invoices',
      docs,
      idToYear,
      yearToId
    );

    expect(mismatches).toHaveLength(0);
    expect(unmappable).toHaveLength(1);
    expect(unmappable[0].documentYear).toBe(2026);
  });

  it('resume y agrupa desajustes', () => {
    const items = [
      {
        collection: 'invoices' as const,
        documentId: 'a',
        label: 'F-1',
        documentDate: '2027-01-01',
        documentYear: 2027,
        sourceFiscalYearId: 'fy-2028',
        sourceFiscalYear: 2028,
        targetFiscalYearId: 'fy-2027',
        targetFiscalYear: 2027,
      },
      {
        collection: 'entries' as const,
        documentId: 'b',
        label: 'Asiento',
        documentDate: '2027-02-01',
        documentYear: 2027,
        sourceFiscalYearId: 'fy-2028',
        sourceFiscalYear: 2028,
        targetFiscalYearId: 'fy-2027',
        targetFiscalYear: 2027,
      },
    ];

    const summary = summarizeDateMismatches(items);
    expect(summary.total).toBe(2);
    expect(summary.invoices).toBe(1);
    expect(summary.entries).toBe(1);

    const groups = groupMismatchesByRoute(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].sourceYear).toBe(2028);
    expect(groups[0].targetYear).toBe(2027);
    expect(groups[0].count).toBe(2);
  });
});
