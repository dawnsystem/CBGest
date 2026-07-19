/**
 * @fileoverview Tests de validación fecha ↔ ejercicio fiscal
 */

import { describe, it, expect } from 'vitest';
import {
  extractCalendarYear,
  detectFiscalYearDateMismatch,
  formatFiscalYearMismatchMessage,
  detectFirstFiscalYearMismatch,
} from '../fiscalYearValidation';

describe('fiscalYearValidation', () => {
  it('extrae año calendario de fecha ISO', () => {
    expect(extractCalendarYear('2027-03-15')).toBe(2027);
    expect(extractCalendarYear('')).toBeNull();
    expect(extractCalendarYear('invalid')).toBeNull();
  });

  it('detecta desajuste entre fecha y ejercicio activo', () => {
    const mismatch = detectFiscalYearDateMismatch('2027-06-01', 2028, 'factura');
    expect(mismatch).toEqual({
      documentDate: '2027-06-01',
      documentYear: 2027,
      activeFiscalYear: 2028,
      entityLabel: 'factura',
    });
  });

  it('no detecta desajuste cuando coinciden', () => {
    expect(detectFiscalYearDateMismatch('2027-06-01', 2027, 'factura')).toBeNull();
  });

  it('formatea mensaje de confirmación legible', () => {
    const msg = formatFiscalYearMismatchMessage({
      documentDate: '2027-03-15',
      documentYear: 2027,
      activeFiscalYear: 2028,
      entityLabel: 'factura',
    });
    expect(msg).toContain('2027');
    expect(msg).toContain('2028');
    expect(msg).toContain('factura');
  });

  it('detecta el primer desajuste en un lote de fechas', () => {
    const mismatch = detectFirstFiscalYearMismatch(
      ['2028-01-01', '2027-05-10', '2027-12-31'],
      2028,
      'transacción bancaria'
    );
    expect(mismatch?.documentYear).toBe(2027);
    expect(mismatch?.entityLabel).toBe('transacción bancaria');
  });
});
