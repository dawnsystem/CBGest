import { AppSettings, Invoice } from '../types';

interface TaxCalculationPeriod {
  startDate: string;
  endDate: string;
}

interface TaxCalculationFilters {
  fiscalYearId: string;
  period: TaxCalculationPeriod;
}

interface TaxDataIRPF {
  totalIngresos: number;
  totalGastos: number;
  rendimientoNeto: number;
}

function parseIsoDate(dateValue: string): Date | null {
  const parsed = new Date(dateValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Calcula los datos fiscales IRPF a partir de las facturas del ejercicio y periodo activo.
 *
 * FIS-001 — Criterio de importe por régimen (simétrico ingresos/gastos):
 * - `ALQUILER_EXENTO`: `totalAmount` (modelo IRPF simplificado; alineado con asientos y Modelo 184).
 * - `GENERAL`: `baseAmount` (IVA fuera de la base).
 */
export function calculateTaxData(
  invoices: Invoice[],
  settings: AppSettings,
  filters: TaxCalculationFilters
): TaxDataIRPF {
  const { fiscalYearId, period } = filters;
  if (!fiscalYearId || !period) {
    throw new Error('calculateTaxData requiere fiscalYearId y period para calcular IRPF');
  }

  const start = parseIsoDate(period.startDate);
  const end = parseIsoDate(period.endDate);
  if (!start || !end) {
    throw new Error('calculateTaxData recibió un periodo con fechas inválidas');
  }
  if (start.getTime() > end.getTime()) {
    throw new Error('calculateTaxData recibió un periodo con startDate posterior a endDate');
  }

  const validInvoices = (invoices || []).filter(invoice => {
    if (invoice.status === 'PENDING') return false;
    if (invoice.fiscalYearId !== fiscalYearId) return false;
    const invoiceDate = parseIsoDate(invoice.date);
    if (!invoiceDate) return false;
    return invoiceDate >= start && invoiceDate <= end;
  });

  // FIS-001: unificar criterio ingresos/gastos por régimen.
  // - ALQUILER_EXENTO (IRPF simplificado, sin IVA deducible): `totalAmount` en ambos
  //   (alineado con asientos, Modelo 184 y calculate-profitability).
  // - GENERAL: `baseAmount` en ambos (IVA fuera de la base IRPF).
  const useTotalAmount = settings.fiscalRegime === 'ALQUILER_EXENTO';
  const amountOf = (invoice: Invoice): number =>
    useTotalAmount ? (invoice.totalAmount || 0) : (invoice.baseAmount || 0);

  const totalIngresos = validInvoices
    .filter(i => i.type === 'INCOME')
    .reduce((acc, curr) => acc + amountOf(curr), 0);

  const totalGastos = validInvoices
    .filter(i => i.type === 'EXPENSE' && i.isDeductible !== false)
    .reduce((acc, curr) => acc + amountOf(curr), 0);

  const rendimientoNeto = totalIngresos - totalGastos;

  return {
    totalIngresos,
    totalGastos,
    rendimientoNeto
  };
}
