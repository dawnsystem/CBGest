/**
 * @fileoverview Exportador PDF del Modelo 184 sobre plantilla oficial AEAT.
 */

import type { Modelo184Draft } from './types';
import { buildModelo184PdfBytes, buildPartnerCertificatePdfBytes } from './pdf/fillPages';

/**
 * Genera PDF del borrador Modelo 184 (layout idéntico al justificante AEAT).
 */
export async function exportModelo184Pdf(draft: Modelo184Draft): Promise<Blob> {
  const bytes = await buildModelo184PdfBytes(draft);
  return new Blob([bytes], { type: 'application/pdf' });
}

/**
 * Genera certificado individual de socio (hoja S oficial, un bloque).
 */
export async function exportPartnerCertificatePdf(
  draft: Modelo184Draft,
  partnerId: string
): Promise<Blob> {
  const bytes = await buildPartnerCertificatePdfBytes(draft, partnerId);
  return new Blob([bytes], { type: 'application/pdf' });
}

export function getModelo184PdfFileName(draft: Modelo184Draft): string {
  return `Modelo184_${draft.ejercicio}_${draft.declarante.nif.replace(/\s/g, '')}.pdf`;
}

export function getPartnerCertificateFileName(
  draft: Modelo184Draft,
  partnerNif: string
): string {
  return `Modelo184_Socio_${draft.ejercicio}_${partnerNif.replace(/\s/g, '')}.pdf`;
}
