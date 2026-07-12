/**
 * @fileoverview Servicio de generación de PDF para modelos fiscales
 * @description Genera PDFs de los modelos 303 (IVA) y 184 (Informativa)
 *              usando jsPDF. Diseñado para formularios fiscales españoles.
 */

import { jsPDF } from 'jspdf';
import { Invoice, AppSettings } from '../types';

// ============================================================================
// LAYOUT CONSTANTS — DEBT-009
// A4 portrait page: 210 × 297 mm.  All values are in mm.
// ============================================================================
const PAGE_CENTER_X = 105;  // horizontal center of A4
const FOOTER_Y1     = 280;  // first footer line
const FOOTER_Y2     = 285;  // second footer line

const FONT_TITLE    = 16;
const FONT_SUBTITLE = 14;
const FONT_SECTION  = 12;
const FONT_HEADER   = 11;
const FONT_BODY     = 10;
const FONT_SMALL    = 9;
const FONT_TINY     = 8;

interface TaxData303 {
  trimestre: string;
  year: number;
  ivaRepercutido: number;
  ivaSoportado: number;
  resultado: number;
  settings: AppSettings;
}

interface TaxData184 {
  year: number;
  rendimientoNeto: number;
  totalIngresos: number;
  totalGastos: number;
  settings: AppSettings;
}

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
 * Genera PDF del Modelo 303 - Autoliquidación IVA
 */
export function generatePDF303(data: TaxData303): Blob {
  const doc = new jsPDF();
  const { settings, trimestre, year, ivaRepercutido, ivaSoportado, resultado } = data;

  // Header
  doc.setFontSize(FONT_TITLE);
  doc.setFont('helvetica', 'bold');
  doc.text('MODELO 303', PAGE_CENTER_X, 20, { align: 'center' });
  doc.setFontSize(FONT_SECTION);
  doc.text('Autoliquidación IVA - Régimen General', PAGE_CENTER_X, 28, { align: 'center' });

  // Period info
  doc.setFontSize(FONT_BODY);
  doc.setFont('helvetica', 'normal');
  doc.text(`Período: ${trimestre} ${year}`, 20, 45);

  // Entity data box
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(15, 55, 180, 35);

  doc.setFontSize(FONT_HEADER);
  doc.setFont('helvetica', 'bold');
  doc.text('IDENTIFICACIÓN DEL DECLARANTE', 20, 63);

  doc.setFontSize(FONT_BODY);
  doc.setFont('helvetica', 'normal');
  doc.text(`Razón Social: ${settings.cbName}`, 20, 72);
  doc.text(`NIF: ${settings.nif || 'No especificado'}`, 20, 80);

  // IVA calculations box
  doc.rect(15, 100, 180, 70);

  doc.setFontSize(FONT_HEADER);
  doc.setFont('helvetica', 'bold');
  doc.text('LIQUIDACIÓN', 20, 108);

  doc.setFontSize(FONT_BODY);
  doc.setFont('helvetica', 'normal');

  // IVA Devengado
  doc.text('IVA Devengado (ventas y servicios)', 20, 120);
  doc.setFont('helvetica', 'bold');
  doc.text(`${ivaRepercutido.toFixed(2)} €`, 170, 120, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  // IVA Deducible
  doc.text('IVA Deducible (gastos deducibles)', 20, 132);
  doc.setFont('helvetica', 'bold');
  doc.text(`-${ivaSoportado.toFixed(2)} €`, 170, 132, { align: 'right' });

  // Line separator
  doc.setLineWidth(0.3);
  doc.line(20, 145, 190, 145);

  // Result
  doc.setFontSize(FONT_SECTION);
  doc.setFont('helvetica', 'bold');
  const resultLabel = resultado >= 0 ? 'A INGRESAR' : 'A COMPENSAR/DEVOLVER';
  doc.text(`RESULTADO: ${resultLabel}`, 20, 158);
  doc.setFontSize(FONT_SUBTITLE);
  doc.text(`${Math.abs(resultado).toFixed(2)} €`, 170, 158, { align: 'right' });

  // Footer
  doc.setFontSize(FONT_TINY);
  doc.setFont('helvetica', 'italic');
  doc.text('Documento generado por CBGest - Solo para uso informativo', PAGE_CENTER_X, FOOTER_Y1, { align: 'center' });
  doc.text(`Generado el: ${new Date().toLocaleString('es-ES')}`, PAGE_CENTER_X, FOOTER_Y2, { align: 'center' });

  return doc.output('blob');
}

/**
 * Genera PDF del Modelo 184 - Declaración Informativa de Entidades en Atribución de Rentas
 */
export function generatePDF184(data: TaxData184): Blob {
  const doc = new jsPDF();
  const { settings, year, rendimientoNeto, totalIngresos, totalGastos } = data;
  const partners = settings.partners || [];

  // Header
  doc.setFontSize(FONT_TITLE);
  doc.setFont('helvetica', 'bold');
  doc.text('MODELO 184', PAGE_CENTER_X, 20, { align: 'center' });
  doc.setFontSize(FONT_SECTION);
  doc.text('Declaración Informativa - Entidades en Atribución de Rentas', PAGE_CENTER_X, 28, { align: 'center' });

  // Period info
  doc.setFontSize(FONT_BODY);
  doc.setFont('helvetica', 'normal');
  doc.text(`Ejercicio: ${year}`, 20, 45);

  // Entity data box
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(15, 55, 180, 35);

  doc.setFontSize(FONT_HEADER);
  doc.setFont('helvetica', 'bold');
  doc.text('IDENTIFICACIÓN DE LA ENTIDAD', 20, 63);

  doc.setFontSize(FONT_BODY);
  doc.setFont('helvetica', 'normal');
  doc.text(`Denominación: ${settings.cbName}`, 20, 72);
  doc.text(`NIF: ${settings.nif || 'No especificado'}`, 20, 80);

  // Income summary box
  doc.rect(15, 100, 180, 45);

  doc.setFontSize(FONT_HEADER);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN DE RENDIMIENTOS', 20, 108);

  doc.setFontSize(FONT_BODY);
  doc.setFont('helvetica', 'normal');

  doc.text('Total Ingresos (Rentas de alquiler)', 20, 118);
  doc.text(`${totalIngresos.toFixed(2)} €`, 170, 118, { align: 'right' });

  doc.text('Total Gastos Deducibles', 20, 128);
  doc.text(`-${totalGastos.toFixed(2)} €`, 170, 128, { align: 'right' });

  doc.setLineWidth(0.3);
  doc.line(20, 133, 190, 133);

  doc.setFont('helvetica', 'bold');
  doc.text('RENDIMIENTO NETO TOTAL', 20, 140);
  doc.setFontSize(FONT_SECTION);
  doc.text(`${rendimientoNeto.toFixed(2)} €`, 170, 140, { align: 'right' });

  // Partners section
  const partnersStartY = 155;
  doc.setFontSize(FONT_HEADER);
  doc.setFont('helvetica', 'bold');
  doc.text('ATRIBUCIÓN A LOS PARTÍCIPES', 20, partnersStartY);

  // Partners table header
  const tableY = partnersStartY + 10;
  doc.setFontSize(FONT_SMALL);
  doc.setFont('helvetica', 'bold');
  doc.rect(15, tableY - 5, 180, 10);
  doc.text('Nombre', 20, tableY + 2);
  doc.text('NIF', 80, tableY + 2);
  doc.text('%', 120, tableY + 2);
  doc.text('Importe Atribuido', 170, tableY + 2, { align: 'right' });

  // Partners data
  doc.setFont('helvetica', 'normal');
  let currentY = tableY + 15;

  partners.forEach((partner) => {
    const atributed = rendimientoNeto * (partner.participation / 100);

    doc.rect(15, currentY - 5, 180, 10);
    doc.text(partner.name, 20, currentY + 2);
    doc.text(partner.nif || 'Pendiente', 80, currentY + 2);
    doc.text(`${partner.participation}%`, 120, currentY + 2);
    doc.text(`${atributed.toFixed(2)} €`, 170, currentY + 2, { align: 'right' });

    currentY += 10;
  });

  // Info box
  doc.setFontSize(FONT_TINY);
  doc.setFillColor(240, 253, 244); // Light green
  doc.rect(15, currentY + 10, 180, 20, 'F');
  doc.setFont('helvetica', 'normal');
  doc.text('Este documento resume el rendimiento del Capital Inmobiliario neto a imputar', 20, currentY + 18);
  doc.text('en la declaración del IRPF de cada partícipe según su porcentaje de participación.', 20, currentY + 25);

  // Footer
  doc.setFontSize(FONT_TINY);
  doc.setFont('helvetica', 'italic');
  doc.text('Documento generado por CBGest - Solo para uso informativo', PAGE_CENTER_X, FOOTER_Y1, { align: 'center' });
  doc.text(`Generado el: ${new Date().toLocaleString('es-ES')}`, PAGE_CENTER_X, FOOTER_Y2, { align: 'center' });

  return doc.output('blob');
}

/**
 * Genera certificado individual para un partícipe
 */
export function generatePartnerCertificate(
  partner: { name: string; nif: string; participation: number },
  entitySettings: AppSettings,
  rendimientoNeto: number,
  year: number
): Blob {
  const doc = new jsPDF();
  const atributed = rendimientoNeto * (partner.participation / 100);

  // Header
  doc.setFontSize(FONT_SUBTITLE);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICADO DE RENDIMIENTOS', PAGE_CENTER_X, 20, { align: 'center' });
  doc.setFontSize(FONT_BODY);
  doc.text(`Ejercicio ${year}`, PAGE_CENTER_X, 28, { align: 'center' });

  // Entity info
  doc.setFontSize(FONT_BODY);
  doc.setFont('helvetica', 'normal');
  doc.text(`Entidad: ${entitySettings.cbName}`, 20, 50);
  doc.text(`NIF Entidad: ${entitySettings.nif || 'No especificado'}`, 20, 58);

  // Separator
  doc.setLineWidth(0.5);
  doc.line(20, 70, 190, 70);

  // Partner info
  doc.setFontSize(FONT_SECTION);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL PARTÍCIPE', 20, 85);

  doc.setFontSize(FONT_BODY);
  doc.setFont('helvetica', 'normal');
  doc.text(`Nombre: ${partner.name}`, 20, 95);
  doc.text(`NIF: ${partner.nif || 'Pendiente'}`, 20, 103);
  doc.text(`Porcentaje de participación: ${partner.participation}%`, 20, 111);

  // Attribution box
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(15, 125, 180, 40);

  doc.setFontSize(FONT_HEADER);
  doc.setFont('helvetica', 'bold');
  doc.text('RENDIMIENTO ATRIBUIDO', 20, 135);

  doc.setFontSize(FONT_BODY);
  doc.setFont('helvetica', 'normal');
  doc.text(`Rendimiento neto total de la entidad: ${rendimientoNeto.toFixed(2)} €`, 20, 147);
  doc.text(`Porcentaje de atribución: ${partner.participation}%`, 20, 155);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_SECTION);
  doc.text(`IMPORTE A DECLARAR EN IRPF: ${atributed.toFixed(2)} €`, 20, 163);

  // Legal text
  doc.setFontSize(FONT_TINY);
  doc.setFont('helvetica', 'normal');
  doc.text('Este certificado acredita la renta atribuida al partícipe para su inclusión', 20, 185);
  doc.text('en la declaración del Impuesto sobre la Renta de las Personas Físicas (IRPF).', 20, 192);

  // Signature area
  doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-ES')}`, 20, 220);
  doc.line(20, 250, 80, 250);
  doc.text('Firma y sello de la entidad', 20, 258);

  // Footer
  doc.setFontSize(FONT_TINY);
  doc.setFont('helvetica', 'italic');
  doc.text('Documento generado por CBGest - Solo para uso informativo', PAGE_CENTER_X, FOOTER_Y1, { align: 'center' });

  return doc.output('blob');
}

/**
 * Descarga un blob como archivo PDF
 */
export function downloadPDF(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Calcula los datos fiscales IRPF a partir de las facturas del ejercicio y periodo activo.
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

  const totalIngresos = validInvoices
    .filter(i => i.type === 'INCOME')
    .reduce((acc, curr) => acc + (curr.baseAmount || 0), 0);

  const totalGastos = validInvoices
    .filter(i => i.type === 'EXPENSE')
    .reduce((acc, curr) => {
      if (settings.fiscalRegime === 'ALQUILER_EXENTO') {
        return acc + (curr.totalAmount || 0);
      }
      return acc + (curr.baseAmount || 0);
    }, 0);

  const rendimientoNeto = totalIngresos - totalGastos;

  return {
    totalIngresos,
    totalGastos,
    rendimientoNeto
  };
}
