/**
 * @fileoverview Utilidades para registros de longitud fija AEAT (500 posiciones).
 */

import { RECORD_LENGTH } from './constants';

/** Posiciones AEAT son 1-indexed; internamente usamos 0-indexed. */
export type AeatRecord = string[];

/**
 * Crea un registro vacío relleno de espacios.
 */
export function createEmptyRecord(): AeatRecord {
  return Array.from({ length: RECORD_LENGTH }, () => ' ');
}

/**
 * Normaliza texto alfabético AEAT: mayúsculas, sin acentos.
 */
export function normalizeAeatText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s.\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Escribe un valor en el registro (posiciones inclusivas 1-based).
 */
export function setField(
  record: AeatRecord,
  startPos: number,
  endPos: number,
  rawValue: string,
  mode: 'alpha' | 'num' = 'alpha'
): void {
  while (record.length < RECORD_LENGTH) {
    record.push(' ');
  }

  const length = endPos - startPos + 1;
  let value = rawValue ?? '';

  if (mode === 'num') {
    value = value.replace(/[^\d]/g, '');
    value = value.padStart(length, '0').slice(-length);
  } else {
    value = normalizeAeatText(value).padEnd(length, ' ').slice(0, length);
  }

  for (let i = 0; i < length; i += 1) {
    const char = value[i] ?? ' ';
    record[startPos - 1 + i] = char === '\r' || char === '\n' ? ' ' : char;
  }
}

/**
 * Escribe un importe con signo opcional (campo signo + entero + decimal).
 */
export function setSignedAmount(
  record: AeatRecord,
  signPos: number,
  intStart: number,
  intEnd: number,
  decStart: number,
  decEnd: number,
  amount: number
): void {
  const sign = amount < 0 ? 'N' : ' ';
  const absolute = Math.abs(amount);
  const [integerPart, decimalPart = '00'] = absolute.toFixed(2).split('.');
  setField(record, signPos, signPos, sign, 'alpha');
  setField(record, intStart, intEnd, integerPart, 'num');
  setField(record, decStart, decEnd, decimalPart, 'num');
}

/**
 * Escribe un importe sin signo (entero + decimal empaquetados).
 */
export function setAmount(
  record: AeatRecord,
  intStart: number,
  intEnd: number,
  decStart: number,
  decEnd: number,
  amount: number
): void {
  const absolute = Math.abs(amount);
  const [integerPart, decimalPart = '00'] = absolute.toFixed(2).split('.');
  setField(record, intStart, intEnd, integerPart, 'num');
  setField(record, decStart, decEnd, decimalPart, 'num');
}

/**
 * Escribe un porcentaje con parte entera y decimal.
 */
export function setPercentage(
  record: AeatRecord,
  intStart: number,
  intEnd: number,
  decStart: number,
  decEnd: number,
  percentage: number
): void {
  const [integerPart, decimalPart = '00'] = percentage.toFixed(2).split('.');
  setField(record, intStart, intEnd, integerPart, 'num');
  setField(record, decStart, decEnd, decimalPart.padEnd(decEnd - decStart + 1, '0'), 'num');
}

/**
 * Convierte el registro a string de exactamente 500 caracteres.
 */
export function recordToString(record: AeatRecord): string {
  const chars: string[] = Array.from({ length: RECORD_LENGTH }, () => ' ');
  for (let i = 0; i < RECORD_LENGTH; i += 1) {
    if (record[i] !== undefined && record[i] !== '') {
      chars[i] = record[i];
    }
  }
  const str = chars.join('').replace(/[\r\n]/g, ' ');
  if (str.length !== RECORD_LENGTH) {
    throw new Error(`Registro AEAT inválido: longitud ${str.length}, esperado ${RECORD_LENGTH}`);
  }
  return str;
}

/**
 * Codifica texto a ISO-8859-1 (latin1) para exportación telemática.
 */
export function encodeIso88591(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    bytes[i] = code <= 0xff ? code : 0x3f;
  }
  return bytes;
}

/**
 * Formatea NIF/CIF ajustado a la derecha con ceros a la izquierda (9 posiciones).
 */
export function formatNifField(nif: string): string {
  const cleaned = normalizeAeatText(nif).replace(/\s/g, '');
  return cleaned.padStart(9, '0').slice(-9);
}

/**
 * Construye domicilio fiscal en una sola línea para registro S.
 */
export function formatDomicilioFiscal(parts: {
  calle?: string;
  numero?: string;
  codigoPostal?: string;
  municipio?: string;
  provincia?: string;
}): string {
  const calle = [parts.calle, parts.numero].filter(Boolean).join(' ');
  const municipio = [parts.codigoPostal, parts.municipio, parts.provincia].filter(Boolean).join(' ');
  return normalizeAeatText([calle, municipio].filter(Boolean).join(' '));
}
