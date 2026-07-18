/**
 * @fileoverview Facade de análisis documental.
 * Delega en el router multi-IA (`services/ai`) y conserva parseo XLSX local.
 */

import readXlsxFile from 'read-excel-file';
import { Supplier, BankTransaction } from '../types';
import type { GeminiInvoiceResponse, GeminiBankTransaction } from '../types/gemini';
import {
  analyzeBankStatementWithRouter,
  analyzeInvoiceWithRouter,
  DEFAULT_AI_CONFIG,
  type AiConfig,
  type BankStatementAnalysisResult,
  type InvoiceAnalysisResult,
} from './ai';

// Re-export types for consumers
export type { GeminiInvoiceResponse, GeminiBankTransaction } from '../types/gemini';
export type { AiConfig, InvoiceAnalysisResult, BankStatementAnalysisResult };

/**
 * Analiza una factura con el router multi-IA (resultado plano, compatibilidad).
 *
 * @param base64Data - Imagen/PDF en base64
 * @param mimeType - MIME
 * @param existingSuppliers - Proveedores
 * @param aiConfig - Preferencia / failover
 * @returns Datos fiscales
 * @throws Error si todos los proveedores fallan
 * @example
 * const data = await analyzeInvoiceImage(b64, 'image/jpeg');
 */
export const analyzeInvoiceImage = async (
  base64Data: string,
  mimeType: string,
  existingSuppliers: Supplier[] = [],
  aiConfig: AiConfig = DEFAULT_AI_CONFIG
): Promise<GeminiInvoiceResponse> => {
  const { data } = await analyzeInvoiceWithRouter(
    base64Data,
    mimeType,
    existingSuppliers,
    aiConfig
  );
  return data;
};

/**
 * Analiza una factura y devuelve metadatos del proveedor usado.
 *
 * @param base64Data - Documento base64
 * @param mimeType - MIME
 * @param existingSuppliers - Proveedores
 * @param aiConfig - Config IA
 * @returns data + meta
 */
export const analyzeInvoiceImageDetailed = async (
  base64Data: string,
  mimeType: string,
  existingSuppliers: Supplier[] = [],
  aiConfig: AiConfig = DEFAULT_AI_CONFIG
): Promise<InvoiceAnalysisResult> => {
  return analyzeInvoiceWithRouter(base64Data, mimeType, existingSuppliers, aiConfig);
};

/**
 * Analiza un extracto bancario PDF/imagen (resultado plano).
 *
 * @param base64Data - Documento base64
 * @param mimeType - MIME
 * @param aiConfig - Config IA
 * @returns Movimientos
 */
export const analyzeBankStatement = async (
  base64Data: string,
  mimeType: string,
  aiConfig: AiConfig = DEFAULT_AI_CONFIG
): Promise<GeminiBankTransaction[]> => {
  const { data } = await analyzeBankStatementWithRouter(base64Data, mimeType, aiConfig);
  return data;
};

/**
 * Analiza un extracto y devuelve metadatos del proveedor usado.
 *
 * @param base64Data - Documento base64
 * @param mimeType - MIME
 * @param aiConfig - Config IA
 * @returns data + meta
 */
export const analyzeBankStatementDetailed = async (
  base64Data: string,
  mimeType: string,
  aiConfig: AiConfig = DEFAULT_AI_CONFIG
): Promise<BankStatementAnalysisResult> => {
  return analyzeBankStatementWithRouter(base64Data, mimeType, aiConfig);
};

// Helper function to parse dates from various formats
const parseDateValue = (value: unknown): string => {
  if (!value) return '';

  // Handle Date objects (read-excel-file returns actual Date objects for date cells)
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const dateStr = String(value).trim();

  // DD/MM/YYYY or DD-MM-YYYY
  // Note: Inside character class [], / doesn't need escaping, - at end doesn't need escaping
  const ddmmyyyy = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Excel serial date number (days since 1899-12-30)
  if (!isNaN(Number(dateStr))) {
    const serial = Number(dateStr);
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return '';
};

/**
 * Parsea un extracto bancario XLSX sin IA (mapeo heurístico de columnas).
 *
 * @param base64Data - Archivo XLSX en base64
 * @returns Transacciones sin id/status
 * @throws Error si no hay columnas/filas válidas
 */
export const parseXlsxBankStatement = async (
  base64Data: string
): Promise<Omit<BankTransaction, 'id' | 'status'>[]> => {
  try {
    // Decode base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create a Blob for read-excel-file
    const blob = new Blob([bytes.buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    // read-excel-file returns rows as arrays of cell values
    // It automatically handles dates, numbers, and strings
    const rows = await readXlsxFile(blob);

    if (!rows || rows.length < 2) {
      throw new Error('El archivo XLSX no contiene suficientes datos');
    }

    // PERF-008: Guard against excessively large files to keep the browser responsive.
    const MAX_ROWS = 5000;
    if (rows.length > MAX_ROWS) {
      throw new Error(
        `El archivo XLSX supera el límite de ${MAX_ROWS} filas. Divídalo en partes más pequeñas.`
      );
    }

    // Convert to our expected format
    const rawData: unknown[][] = rows.map((row) => [...row]);

    // Find header row (look for keywords in first 10 rows)
    let headerRowIndex = 0;
    const dateKeywords = ['fecha', 'date', 'f.valor', 'f. valor', 'f.operación', 'f. operación'];
    const conceptKeywords = [
      'concepto',
      'descripción',
      'descripcion',
      'concept',
      'movimiento',
      'detalle',
    ];
    const amountKeywords = [
      'importe',
      'amount',
      'cantidad',
      'cargo',
      'abono',
      'débito',
      'crédito',
      'debito',
      'credito',
      'monto',
    ];

    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      const row = rawData[i];
      if (!row || !Array.isArray(row)) continue;

      const rowLower = row.map((cell: unknown) => String(cell || '').toLowerCase().trim());
      const hasDate = rowLower.some((cell: string) => dateKeywords.some((k) => cell.includes(k)));
      const hasConcept = rowLower.some((cell: string) =>
        conceptKeywords.some((k) => cell.includes(k))
      );
      const hasAmount = rowLower.some((cell: string) =>
        amountKeywords.some((k) => cell.includes(k))
      );

      if (hasDate && (hasConcept || hasAmount)) {
        headerRowIndex = i;
        break;
      }
    }

    const headers = rawData[headerRowIndex].map((h: unknown) => String(h || '').toLowerCase().trim());

    // Find column indices
    const findColumnIndex = (keywords: string[]): number => {
      for (const keyword of keywords) {
        const idx = headers.findIndex((h: string) => h.includes(keyword));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const dateCol = findColumnIndex(dateKeywords);
    const conceptCol = findColumnIndex(conceptKeywords);
    const amountCol = findColumnIndex(amountKeywords);

    // Also check for separate debit/credit columns
    const debitCol = findColumnIndex(['cargo', 'débito', 'debito', 'debe']);
    const creditCol = findColumnIndex(['abono', 'crédito', 'credito', 'haber']);

    if (dateCol === -1) {
      throw new Error('No se encontró columna de fecha en el archivo XLSX');
    }

    // Parse data rows
    const transactions: Omit<BankTransaction, 'id' | 'status'>[] = [];

    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || !Array.isArray(row)) continue;

      // Skip empty rows
      if (row.every((cell: unknown) => !cell || String(cell).trim() === '')) continue;

      const rawDate = row[dateCol];
      const concept = conceptCol !== -1 ? String(row[conceptCol] || '').trim() : '';

      // Parse date using helper function
      const date = parseDateValue(rawDate);

      // Skip rows without valid date
      if (!date) continue;

      // Parse amount
      let amount = 0;
      if (amountCol !== -1 && row[amountCol] !== undefined && row[amountCol] !== '') {
        // Single amount column
        const rawAmount = String(row[amountCol])
          .replace(/[^\d,.-]/g, '')
          .replace(',', '.');
        amount = parseFloat(rawAmount) || 0;
      } else if (debitCol !== -1 || creditCol !== -1) {
        // Separate debit/credit columns
        const debit =
          debitCol !== -1
            ? parseFloat(
                String(row[debitCol] || 0)
                  .replace(/[^\d,.-]/g, '')
                  .replace(',', '.')
              ) || 0
            : 0;
        const credit =
          creditCol !== -1
            ? parseFloat(
                String(row[creditCol] || 0)
                  .replace(/[^\d,.-]/g, '')
                  .replace(',', '.')
              ) || 0
            : 0;

        // Debit is negative (expense), Credit is positive (income)
        if (debit > 0) {
          amount = -Math.abs(debit);
        } else if (credit > 0) {
          amount = Math.abs(credit);
        }
      }

      // Skip rows with 0 amount (might be balance rows or headers)
      if (amount === 0) continue;

      transactions.push({
        date,
        concept: concept || 'Sin concepto',
        amount,
      });
    }

    if (transactions.length === 0) {
      throw new Error('No se encontraron transacciones válidas en el archivo XLSX');
    }

    return transactions;
  } catch (error) {
    console.error('Error parsing XLSX bank statement:', error);
    throw error;
  }
};
