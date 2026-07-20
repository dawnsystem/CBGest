/**
 * @fileoverview Conversión PDF → imágenes PNG (data URLs) vía pdfjs-dist.
 * Necesario para proveedores vision que no aceptan PDF nativo (Groq, OpenRouter).
 * Import dinámico de pdfLoader para no cargar pdfjs en el camino Gemini (tests/CI).
 */

import { AiProviderError } from './errors';
import type { AiProviderId } from './types';

export interface PdfToImagesOptions {
  /** Máximo de páginas a renderizar. */
  maxPages?: number;
  /** Escala de render (default 1.5). */
  scale?: number;
}

/**
 * Decodifica base64 a Uint8Array.
 *
 * @param base64Data - Base64 sin prefijo data:
 * @returns Bytes del PDF
 */
function base64ToUint8Array(base64Data: string): Uint8Array {
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Renderiza las primeras páginas de un PDF a data-URLs PNG.
 *
 * @param base64Data - PDF en base64 (sin prefijo)
 * @param options - Límites de páginas y escala
 * @param providerId - Proveedor que solicita la conversión (para errores)
 * @returns Array de data URLs `data:image/png;base64,...`
 * @throws AiProviderError si pdfjs falla o no hay páginas
 * @example
 * const images = await pdfBase64ToImageDataUrls(pdfB64, { maxPages: 3 });
 */
export async function pdfBase64ToImageDataUrls(
  base64Data: string,
  options: PdfToImagesOptions = {},
  providerId: AiProviderId = 'groq'
): Promise<string[]> {
  const maxPages = options.maxPages ?? 3;
  const scale = options.scale ?? 1.5;

  try {
    const { pdfjsLib } = await import('../../utils/pdfLoader');
    const data = base64ToUint8Array(base64Data);
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    const pageCount = Math.min(pdf.numPages, maxPages);
    const images: string[] = [];

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new AiProviderError(
          providerId,
          'FATAL',
          'No se pudo obtener contexto 2D del canvas para renderizar el PDF.'
        );
      }

      // pdfjs-dist v5 tipa `canvas` como requerido en RenderParameters
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      images.push(canvas.toDataURL('image/png'));
    }

    if (images.length === 0) {
      throw new AiProviderError(
        providerId,
        'FATAL',
        'El PDF no contiene páginas renderizables.'
      );
    }

    return images;
  } catch (error: unknown) {
    if (error instanceof AiProviderError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Error convirtiendo PDF a imagen';
    throw new AiProviderError(providerId, 'FATAL', message, error);
  }
}

/**
 * Prepara partes de imagen para APIs OpenAI-compatible.
 * Si el MIME es PDF, convierte a PNG; si no, usa la imagen tal cual.
 *
 * @param base64Data - Contenido base64
 * @param mimeType - MIME del archivo
 * @param providerId - Proveedor solicitante
 * @param maxPdfPages - Tope de páginas PDF
 * @returns Lista de data URLs de imagen
 */
export async function prepareImageDataUrls(
  base64Data: string,
  mimeType: string,
  providerId: AiProviderId,
  maxPdfPages: number
): Promise<string[]> {
  if (mimeType === 'application/pdf') {
    return pdfBase64ToImageDataUrls(base64Data, { maxPages: maxPdfPages }, providerId);
  }
  return [`data:${mimeType};base64,${base64Data}`];
}
