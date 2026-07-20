/**
 * @fileoverview Formateo de valores al estilo AEAT (PDF Modelo 184).
 */

/** Importe con separador de miles y coma decimal: `61.020,39`. */
export function formatAeatAmount(value: number): string {
  return value.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Participación con 4 decimales: `50,0000`. */
export function formatAeatParticipation(value: number): string {
  return value.toLocaleString('es-ES', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

/** Porcentaje titularidad con 2 decimales: `50,00`. */
export function formatAeatPercent(value: number): string {
  return value.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Entero sin decimales. */
export function formatAeatInteger(value: number): string {
  return String(Math.round(value));
}

/** Texto en mayúsculas sin acentos (aprox. fichero AEAT). */
export function formatAeatText(value: string, maxLen?: number): string {
  const normalized = value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .trim();
  if (maxLen && normalized.length > maxLen) {
    return normalized.slice(0, maxLen);
  }
  return normalized;
}

/** Domicilio fiscal en una línea (truncado si excede). */
export function formatAeatDomicilio(value: string, maxLen = 40): string {
  return formatAeatText(value.replace(/\s+/g, ' '), maxLen);
}
