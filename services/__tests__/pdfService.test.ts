import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  calculateTaxData,
  downloadPDF,
  generatePDF184,
  generatePDF303,
  generatePartnerCertificate,
} from '../pdfService';
import type { AppSettings, Invoice, Partner } from '../../types';

const settings: AppSettings = {
  cbName: 'CB Test',
  nif: 'B12345678',
  fiscalRegime: 'GENERAL',
  vatObligation: true,
  partners: [
    { id: 'p1', name: 'Ana', nif: '12345678Z', participation: 60 },
    { id: 'p2', name: 'Luis', nif: 'X1234567L', participation: 40 },
  ],
  dataConfig: {
    type: 'APPWRITE',
    autoBackup: false,
    appwriteProjectId: 'cbgest',
    appwriteDatabaseId: 'db',
    appwriteBucketId: 'bucket',
    appwriteEndpoint: 'https://example.test',
  },
};

const invoices: Invoice[] = [
  {
    id: 'i1',
    number: 'F-001',
    date: '2026-01-01',
    issuerName: 'Proveedor Uno',
    issuerNif: 'B12345678',
    baseAmount: 1000,
    vatRate: 21,
    vatAmount: 210,
    totalAmount: 1210,
    type: 'INCOME',
    status: 'PROCESSED',
    fiscalYearId: 'fy-2026',
    history: [],
  },
  {
    id: 'i2',
    number: 'F-002',
    date: '2026-01-02',
    issuerName: 'Proveedor Dos',
    issuerNif: 'B87654321',
    baseAmount: 200,
    vatRate: 21,
    vatAmount: 42,
    totalAmount: 242,
    type: 'EXPENSE',
    status: 'PROCESSED',
    fiscalYearId: 'fy-2026',
    history: [],
  },
  {
    id: 'i3',
    number: 'F-003',
    date: '2026-02-15',
    issuerName: 'Borrador',
    issuerNif: 'B99999999',
    baseAmount: 300,
    vatRate: 21,
    vatAmount: 63,
    totalAmount: 363,
    type: 'EXPENSE',
    status: 'PENDING',
    fiscalYearId: 'fy-2026',
    history: [],
  },
  {
    id: 'i4',
    number: 'F-004',
    date: '2025-12-31',
    issuerName: 'Otro Ejercicio',
    issuerNif: 'B22222222',
    baseAmount: 700,
    vatRate: 21,
    vatAmount: 147,
    totalAmount: 847,
    type: 'INCOME',
    status: 'PROCESSED',
    fiscalYearId: 'fy-2025',
    history: [],
  },
];

describe('pdfService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should calculate tax data for selected fiscal year and period excluding pending invoices', () => {
    const filters = {
      fiscalYearId: 'fy-2026',
      period: {
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
    };
    const general = calculateTaxData(invoices, settings, filters);
    const exempt = calculateTaxData(
      invoices,
      { ...settings, fiscalRegime: 'ALQUILER_EXENTO', vatObligation: false },
      filters
    );

    expect(general).toEqual({
      totalIngresos: 1000,
      totalGastos: 200,
      rendimientoNeto: 800,
    });

    expect(exempt.totalGastos).toBe(242);
    expect(exempt.rendimientoNeto).toBe(758);
  });

  it('should throw when required fiscal filters are missing', () => {
    expect(() => calculateTaxData(invoices, settings, {} as unknown as Parameters<typeof calculateTaxData>[2])).toThrow(
      'calculateTaxData requiere fiscalYearId y period para calcular IRPF'
    );
  });

  it('should throw when fiscal period dates are invalid', () => {
    expect(() =>
      calculateTaxData(invoices, settings, {
        fiscalYearId: 'fy-2026',
        period: { startDate: 'invalid-date', endDate: '2026-12-31' },
      })
    ).toThrow('calculateTaxData recibió un periodo con fechas inválidas');
  });

  it('should generate PDF blobs for fiscal models and partner certificates', () => {
    const blob303 = generatePDF303({
      trimestre: '2T',
      year: 2026,
      ivaRepercutido: 210,
      ivaSoportado: 42,
      resultado: 168,
      settings,
    });
    const blob184 = generatePDF184({
      year: 2026,
      rendimientoNeto: 800,
      totalIngresos: 1000,
      totalGastos: 200,
      settings,
    });
    const certificate = generatePartnerCertificate(settings.partners[0] as Partner, settings, 800, 2026);

    expect(blob303).toBeInstanceOf(Blob);
    expect(blob184).toBeInstanceOf(Blob);
    expect(certificate).toBeInstanceOf(Blob);
    expect(blob303.size).toBeGreaterThan(0);
    expect(blob184.size).toBeGreaterThan(0);
    expect(certificate.size).toBeGreaterThan(0);
  });

  it('should download a blob using browser APIs', () => {
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        const anchor = originalCreateElement('a');
        anchor.click = clickSpy;
        return anchor;
      }

      return originalCreateElement(tagName);
    });

    downloadPDF(new Blob(['test']), 'modelo.pdf');

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test');
    expect(createElementSpy).toHaveBeenCalledWith('a');
  });
});
