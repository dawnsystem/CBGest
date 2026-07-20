/**
 * @fileoverview Exportador de fichero telemático Modelo 184 (registros longitud fija).
 */

import { MODELO, MODELO_184_FISCAL } from './constants';
import type { Modelo184Draft, Modelo184GastosInmobiliario, Modelo184RentaEntidad } from './types';
import {
  createEmptyRecord,
  encodeIso88591,
  formatNifField,
  normalizeAeatText,
  recordToString,
  setAmount,
  setField,
  setPercentage,
  setSignedAmount,
} from './recordUtils';

function writeGastosInmobiliarioDetalle(record: string[], detalle: Modelo184GastosInmobiliario): void {
  setAmount(record, 397, 405, 406, 407, detalle.interesesFinanciacion);
  setAmount(record, 408, 416, 417, 418, detalle.conservacionReparacion);
  setAmount(record, 419, 427, 428, 429, detalle.interesesPendientes);
  setAmount(record, 430, 437, 438, 439, detalle.tributosRecargos);
  setAmount(record, 440, 448, 449, 450, detalle.saldosDudosoCobro);
  setAmount(record, 451, 458, 459, 460, detalle.cantidadesTerceros);
  setAmount(record, 461, 468, 469, 470, detalle.primasSeguros);
  setAmount(record, 471, 478, 479, 480, detalle.amortizacionInmueble);
  setAmount(record, 481, 486, 487, 488, detalle.amortizacionMuebles);
  setAmount(record, 489, 495, 496, 497, detalle.otrosGastos);
}

function buildRegistroTipo1(draft: Modelo184Draft, declarationId = '1840000000001'): string {
  const record = createEmptyRecord();
  const { declarante, resumen } = draft;

  setField(record, 1, 1, '1', 'num');
  setField(record, 2, 4, MODELO, 'num');
  setField(record, 5, 8, String(draft.ejercicio), 'num');
  setField(record, 9, 17, formatNifField(declarante.nif), 'alpha');
  setField(record, 18, 57, declarante.denominacion, 'alpha');
  setField(record, 58, 58, MODELO_184_FISCAL.tipoSoporteTelematico, 'alpha');
  setField(record, 59, 67, declarante.telefono.replace(/\D/g, ''), 'num');
  setField(record, 68, 107, declarante.personaContacto, 'alpha');
  setField(record, 108, 120, declarationId, 'num');
  setField(record, 136, 144, String(resumen.numRegistrosSocios), 'num');
  setField(record, 145, 145, String(declarante.tipoEntidad), 'num');
  setField(record, 146, 146, String(declarante.actividadPrincipal), 'num');
  setAmount(record, 157, 169, 170, 171, declarante.cifraNegocios);
  setField(record, 172, 180, formatNifField(declarante.representativeNif), 'alpha');
  setField(record, 181, 220, declarante.representativeName, 'alpha');
  setField(record, 221, 229, String(resumen.numRegistrosEntidad), 'num');

  return recordToString(record);
}

function buildRegistroTipo2Entidad(draft: Modelo184Draft, renta: Modelo184RentaEntidad): string {
  const record = createEmptyRecord();
  const { declarante } = draft;

  setField(record, 1, 1, '2', 'num');
  setField(record, 2, 4, MODELO, 'num');
  setField(record, 5, 8, String(draft.ejercicio), 'num');
  setField(record, 9, 17, formatNifField(declarante.nif), 'alpha');
  setField(record, 18, 26, formatNifField(declarante.nif), 'alpha');
  setField(record, 36, 75, declarante.denominacion, 'alpha');
  setField(record, 76, 76, 'E', 'alpha');
  setField(record, 77, 77, renta.clave, 'alpha');
  setField(record, 78, 79, renta.subclave, 'num');
  setAmount(record, 152, 162, 163, 164, renta.ingresosIntegros);
  setAmount(record, 165, 174, 175, 176, renta.gastos);
  setSignedAmount(record, 177, 178, 188, 189, 190, renta.rentaAtribuible);
  setField(record, 245, 245, String(renta.situacionInmueble), 'num');
  setField(record, 246, 265, renta.cadastralRef, 'alpha');
  writeGastosInmobiliarioDetalle(record, renta.gastosDetalle);
  setField(record, 498, 500, String(renta.diasArrendamiento), 'num');

  return recordToString(record);
}

function buildRegistroTipo2Socio(
  draft: Modelo184Draft,
  atribucion: Modelo184Draft['atribucionesSocios'][number]
): string {
  const record = createEmptyRecord();
  const { declarante } = draft;

  setField(record, 1, 1, '2', 'num');
  setField(record, 2, 4, MODELO, 'num');
  setField(record, 5, 8, String(draft.ejercicio), 'num');
  setField(record, 9, 17, formatNifField(declarante.nif), 'alpha');
  setField(record, 18, 26, formatNifField(atribucion.nif), 'alpha');
  setField(record, 36, 75, atribucion.nombre, 'alpha');
  setField(record, 76, 76, 'S', 'alpha');
  setField(record, 77, 78, atribucion.provinciaCode, 'num');
  setField(record, 81, 81, String(atribucion.tipoParticipe), 'num');
  setField(record, 82, 82, atribucion.miembro31Diciembre ? 'X' : ' ', 'alpha');
  setField(record, 83, 85, String(atribucion.diasMiembro), 'num');
  setPercentage(record, 86, 88, 89, 92, atribucion.participacion);
  setField(record, 93, 93, atribucion.clave, 'alpha');
  setSignedAmount(record, 96, 97, 106, 107, 108, atribucion.importe);
  setField(record, 120, 159, atribucion.domicilioFiscal, 'alpha');
  setField(record, 172, 172, String(atribucion.naturalezaInmueble), 'num');
  setField(record, 173, 173, String(atribucion.situacionInmueble), 'num');
  setField(record, 174, 193, atribucion.cadastralRef, 'alpha');
  setField(record, 194, 194, atribucion.claveTitularidad, 'alpha');
  setPercentage(record, 195, 197, 198, 199, atribucion.porcentajeTitularidad);
  setField(record, 200, 202, String(atribucion.diasArrendamiento), 'num');

  return recordToString(record);
}

/**
 * Genera los registros del fichero telemático (cada uno de 500 caracteres).
 */
export function buildModelo184Records(draft: Modelo184Draft): string[] {
  return [
    buildRegistroTipo1(draft),
    ...draft.rentasEntidad.map((renta) => buildRegistroTipo2Entidad(draft, renta)),
    ...draft.atribucionesSocios.map((atribucion) => buildRegistroTipo2Socio(draft, atribucion)),
  ];
}

/**
 * Genera el contenido textual del fichero telemático (registros de 500 caracteres).
 */
export function buildModelo184FileContent(draft: Modelo184Draft): string {
  const lines = buildModelo184Records(draft);
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Exporta el fichero telemático como Blob ISO-8859-1.
 */
export function exportModelo184File(draft: Modelo184Draft): Blob {
  const content = buildModelo184FileContent(draft);
  const bytes = encodeIso88591(content);
  return new Blob([bytes], { type: 'text/plain;charset=iso-8859-1' });
}

/**
 * Nombre de fichero sugerido para la exportación telemática.
 */
export function getModelo184FileName(draft: Modelo184Draft): string {
  const nif = normalizeAeatText(draft.declarante.nif).replace(/\s/g, '');
  return `184_${nif}_${draft.ejercicio}.txt`;
}
