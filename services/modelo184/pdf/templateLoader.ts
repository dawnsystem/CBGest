/**
 * @fileoverview Carga la plantilla PDF en blanco del Modelo 184.
 */

const TEMPLATE_URL = '/assets/modelo184/modelo184-blank.pdf';

let templateCache: ArrayBuffer | null = null;

/**
 * Carga bytes de la plantilla (con caché en memoria).
 */
export async function loadModelo184Template(): Promise<ArrayBuffer> {
  if (templateCache) return templateCache;
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) {
    throw new Error(`No se pudo cargar la plantilla Modelo 184 (${response.status})`);
  }
  templateCache = await response.arrayBuffer();
  return templateCache;
}

/** Limpia caché (tests). */
export function clearModelo184TemplateCache(): void {
  templateCache = null;
}
