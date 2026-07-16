/**
 * @fileoverview Tests filtro ejercicio vs año calendario (BUG-FILT-001).
 */

import { describe, it, expect } from 'vitest';
import {
  matchesActiveFiscalPeriod,
  matchesDashboardFiscalYear,
} from '../fiscalPeriodFilter';

describe('fiscalPeriodFilter (BUG-FILT-001)', () => {
  const ref = new Date('2026-07-15T12:00:00Z');

  it('incluye factura del ejercicio aunque la fecha sea de otro año calendario', () => {
    expect(
      matchesActiveFiscalPeriod({
        fiscalYearId: 'fy-2026',
        dateStr: '2025-12-20',
        activeFiscalYearId: 'fy-2026',
        activeYear: 2026,
        periodFilter: 'year',
        referenceDate: ref,
      })
    ).toBe(true);
  });

  it('excluye factura de otro ejercicio aunque la fecha sea del año activo', () => {
    expect(
      matchesActiveFiscalPeriod({
        fiscalYearId: 'fy-2025',
        dateStr: '2026-03-01',
        activeFiscalYearId: 'fy-2026',
        activeYear: 2026,
        periodFilter: 'year',
        referenceDate: ref,
      })
    ).toBe(false);
  });

  it('fallback a año calendario si no hay fiscalYearId en el documento', () => {
    expect(
      matchesActiveFiscalPeriod({
        dateStr: '2026-02-01',
        activeFiscalYearId: 'fy-2026',
        activeYear: 2026,
        periodFilter: 'year',
        referenceDate: ref,
      })
    ).toBe(true);

    expect(
      matchesActiveFiscalPeriod({
        dateStr: '2025-02-01',
        activeFiscalYearId: 'fy-2026',
        activeYear: 2026,
        periodFilter: 'year',
        referenceDate: ref,
      })
    ).toBe(false);
  });

  it('periodFilter all siempre true', () => {
    expect(
      matchesActiveFiscalPeriod({
        fiscalYearId: 'fy-other',
        dateStr: '1999-01-01',
        activeFiscalYearId: 'fy-2026',
        activeYear: 2026,
        periodFilter: 'all',
        referenceDate: ref,
      })
    ).toBe(true);
  });

  it('matchesDashboardFiscalYear no exige año calendario si hay match de fiscalYearId', () => {
    expect(
      matchesDashboardFiscalYear('fy-2026', '2025-11-01', 'fy-2026', 2026)
    ).toBe(true);
    expect(
      matchesDashboardFiscalYear('fy-2025', '2026-01-01', 'fy-2026', 2026)
    ).toBe(false);
  });
});
