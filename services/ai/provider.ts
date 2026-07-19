/**
 * @fileoverview Contrato de proveedor de análisis documental por IA.
 */

import type { Supplier } from '../../types';
import type { CbIssuerContext } from './cbIssuerContext';
import type {
  AiProviderId,
  BankTransactionAiResponse,
  InvoiceAiResponse,
} from './types';

/**
 * Proveedor capaz de analizar facturas y extractos bancarios.
 */
export interface AiDocumentProvider {
  /** Identificador estable. */
  readonly id: AiProviderId;
  /** Nombre para UI. */
  readonly displayName: string;
  /** true si acepta application/pdf nativo sin conversión. */
  readonly supportsPdfNative: boolean;
  /**
   * Indica si la API key del proveedor está presente.
   *
   * @returns true si configurado
   */
  isConfigured(): boolean;
  /**
   * Analiza una factura (imagen o PDF según capacidades).
   *
   * @param base64Data - Contenido en base64 (sin prefijo data:)
   * @param mimeType - MIME normalizado
   * @param existingSuppliers - Proveedores para matching
   * @param cbIssuer - Identidad CB desde Settings (emisor propio)
   * @returns Datos fiscales estructurados
   * @throws AiProviderError
   */
  analyzeInvoice(
    base64Data: string,
    mimeType: string,
    existingSuppliers?: Supplier[],
    cbIssuer?: CbIssuerContext | null
  ): Promise<InvoiceAiResponse>;
  /**
   * Analiza un extracto bancario PDF/imagen.
   *
   * @param base64Data - Contenido en base64
   * @param mimeType - MIME normalizado
   * @returns Lista de movimientos
   * @throws AiProviderError
   */
  analyzeBankStatement(
    base64Data: string,
    mimeType: string
  ): Promise<BankTransactionAiResponse[]>;
}
