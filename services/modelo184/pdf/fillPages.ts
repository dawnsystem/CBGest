/**
 * @fileoverview Relleno de campos sobre plantilla PDF oficial Modelo 184.
 */

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { Modelo184AtribucionSocio, Modelo184Draft, Modelo184RentaEntidad } from '../types';
import {
  HOJA_RESUMEN_FIELDS,
  PDF_FONT_SIZE,
  RENTA_BLOCK_Y_OFFSET,
  RENTA_ENTIDAD_BLOCK,
  SOCIO_BLOCK,
  SOCIO_BLOCK_Y_OFFSET,
  SOCIO_PAGE_HEADER,
  type PdfPoint,
} from './coordinates';
import {
  formatAeatAmount,
  formatAeatDomicilio,
  formatAeatInteger,
  formatAeatParticipation,
  formatAeatPercent,
  formatAeatText,
} from './formatters';
import { loadModelo184Template } from './templateLoader';

function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  point: PdfPoint,
  size: number = PDF_FONT_SIZE.default
): void {
  if (!text) return;
  page.drawText(text, {
    x: point.x,
    y: point.y,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawAtOffset(
  page: PDFPage,
  font: PDFFont,
  text: string,
  point: PdfPoint,
  yOffset: number,
  size: number = PDF_FONT_SIZE.default
): void {
  drawText(page, font, text, { x: point.x, y: point.y - yOffset }, size);
}

function fillHojaResumen(page: PDFPage, font: PDFFont, draft: Modelo184Draft): void {
  const { declarante, resumen } = draft;
  const f = HOJA_RESUMEN_FIELDS;

  drawText(page, font, String(draft.ejercicio), f.ejercicio);
  drawText(page, font, formatAeatText(declarante.nif), f.nif);
  drawText(page, font, formatAeatText(declarante.denominacion), f.denominacion);
  drawText(page, font, declarante.telefono || '', f.telefono);
  drawText(page, font, formatAeatText(declarante.representativeName), { x: 128, y: 488.8 });
  drawText(page, font, formatAeatText(declarante.representativeNif), f.contactoNif);
  drawText(page, font, formatAeatText(declarante.personaContacto), f.representanteNombre);
  drawText(page, font, formatAeatInteger(resumen.numRegistrosSocios), f.numRegistrosSocios);
  drawText(page, font, formatAeatInteger(resumen.numRegistrosEntidad), { x: 169.1, y: 134.6 });
  drawText(page, font, formatAeatInteger(declarante.tipoEntidad), { x: 556.1, y: 113.6 });
  drawText(page, font, formatAeatInteger(declarante.tipoEntidad), f.tipoEntidad);
  drawText(page, font, formatAeatInteger(declarante.actividadPrincipal), f.actividadPrincipal);
  drawText(page, font, formatAeatAmount(declarante.cifraNegocios), f.cifraNegocios, PDF_FONT_SIZE.amount);
}

function fillRentaBlock(
  page: PDFPage,
  font: PDFFont,
  draft: Modelo184Draft,
  renta: Modelo184RentaEntidad,
  blockIndex: number
): void {
  const yOff = blockIndex * RENTA_BLOCK_Y_OFFSET;
  const b = RENTA_ENTIDAD_BLOCK;
  const det = renta.gastosDetalle;

  if (blockIndex === 0) {
    drawText(page, font, formatAeatText(draft.declarante.nif), b.headerNif);
    drawText(page, font, String(draft.ejercicio), b.headerEjercicio);
    drawText(page, font, formatAeatText(draft.declarante.denominacion), b.headerDenominacion);
  }

  drawAtOffset(page, font, renta.clave, b.clave, yOff);
  drawAtOffset(page, font, renta.subclave, b.subclave, yOff);
  drawAtOffset(page, font, formatAeatAmount(renta.ingresosIntegros), b.ingresos, yOff, PDF_FONT_SIZE.amount);
  drawAtOffset(page, font, formatAeatAmount(renta.gastos), b.gastos, yOff, PDF_FONT_SIZE.amount);
  drawAtOffset(page, font, formatAeatAmount(renta.rentaAtribuible), b.rentaAtribuible, yOff, PDF_FONT_SIZE.amount);
  drawAtOffset(page, font, formatAeatInteger(renta.situacionInmueble), b.situacionInmueble, yOff);
  drawAtOffset(page, font, renta.cadastralRef, b.cadastralRef, yOff, PDF_FONT_SIZE.small);
  drawAtOffset(page, font, formatAeatInteger(renta.diasArrendamiento), b.diasArrendamiento, yOff);

  if (det.interesesFinanciacion > 0) {
    drawAtOffset(page, font, formatAeatAmount(det.interesesFinanciacion), b.interesesFinanciacion, yOff, PDF_FONT_SIZE.amount);
  }
  if (det.conservacionReparacion > 0) {
    drawAtOffset(page, font, formatAeatAmount(det.conservacionReparacion), b.conservacionReparacion, yOff, PDF_FONT_SIZE.amount);
  }
  if (det.tributosRecargos > 0) {
    drawAtOffset(page, font, formatAeatAmount(det.tributosRecargos), b.tributosRecargos, yOff, PDF_FONT_SIZE.amount);
  }
  if (det.cantidadesTerceros > 0) {
    drawAtOffset(page, font, formatAeatAmount(det.cantidadesTerceros), b.cantidadesTerceros, yOff, PDF_FONT_SIZE.amount);
  }
  if (det.amortizacionInmueble > 0) {
    drawAtOffset(page, font, formatAeatAmount(det.amortizacionInmueble), b.amortizacionInmueble, yOff, PDF_FONT_SIZE.amount);
  }
}

function fillSocioBlock(
  page: PDFPage,
  font: PDFFont,
  socio: Modelo184AtribucionSocio,
  slotIndex: number
): void {
  const yOff = slotIndex * SOCIO_BLOCK_Y_OFFSET;
  const b = SOCIO_BLOCK;

  drawAtOffset(page, font, formatAeatText(socio.nif), b.nif, yOff);
  drawAtOffset(page, font, formatAeatText(socio.nombre), b.nombre, yOff);
  drawAtOffset(page, font, socio.provinciaCode.padStart(2, '0'), b.provinciaCode, yOff);
  drawAtOffset(page, font, formatAeatInteger(socio.tipoParticipe), b.tipoParticipe, yOff);
  if (socio.miembro31Diciembre) {
    drawAtOffset(page, font, 'X', b.miembroX, yOff);
  }
  drawAtOffset(page, font, formatAeatInteger(socio.diasMiembro), b.diasMiembro, yOff);
  drawAtOffset(page, font, formatAeatParticipation(socio.participacion), b.participacion, yOff);
  drawAtOffset(page, font, socio.clave, b.clave, yOff);
  drawAtOffset(page, font, formatAeatAmount(socio.importe), b.importe, yOff, PDF_FONT_SIZE.amount);
  drawAtOffset(page, font, formatAeatDomicilio(socio.domicilioFiscal), b.domicilio, yOff, PDF_FONT_SIZE.small);
  drawAtOffset(page, font, formatAeatInteger(socio.situacionInmueble), b.situacionInmueble, yOff);
  drawAtOffset(page, font, formatAeatInteger(socio.naturalezaInmueble), b.naturalezaInmueble, yOff);
  drawAtOffset(page, font, socio.cadastralRef, b.cadastralRef, yOff, PDF_FONT_SIZE.small);
  drawAtOffset(page, font, socio.claveTitularidad, b.claveTitularidad, yOff);
  drawAtOffset(page, font, formatAeatPercent(socio.porcentajeTitularidad), b.porcentajeTitularidad, yOff);
  drawAtOffset(page, font, formatAeatInteger(socio.diasArrendamiento), b.diasArrendamiento, yOff);
}

function fillSocioPageHeader(page: PDFPage, font: PDFFont, draft: Modelo184Draft): void {
  drawText(page, font, formatAeatText(draft.declarante.nif), SOCIO_PAGE_HEADER.nifEntidad);
  drawText(page, font, String(draft.ejercicio), SOCIO_PAGE_HEADER.ejercicio);
}

/**
 * Genera PDF completo del Modelo 184 sobre plantilla oficial AEAT.
 */
export async function buildModelo184PdfBytes(draft: Modelo184Draft): Promise<Uint8Array> {
  const templateBytes = await loadModelo184Template();
  const templateDoc = await PDFDocument.load(templateBytes);
  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);

  const [resumenPage, rentasPage] = await outDoc.copyPages(templateDoc, [0, 1]);
  outDoc.addPage(resumenPage);
  outDoc.addPage(rentasPage);

  fillHojaResumen(outDoc.getPages()[0], font, draft);

  const rentasOutPage = outDoc.getPages()[1];
  draft.rentasEntidad.slice(0, 2).forEach((renta, index) => {
    fillRentaBlock(rentasOutPage, font, draft, renta, index);
  });

  const socios = draft.atribucionesSocios;
  const sociosPerPage = 3;
  const sociosPagesNeeded = Math.max(1, Math.ceil(socios.length / sociosPerPage));

  for (let p = 0; p < sociosPagesNeeded; p++) {
    const [socioPage] = await outDoc.copyPages(templateDoc, [2]);
    outDoc.addPage(socioPage);
    const page = outDoc.getPages()[outDoc.getPageCount() - 1];
    fillSocioPageHeader(page, font, draft);
    socios.slice(p * sociosPerPage, p * sociosPerPage + sociosPerPage).forEach((socio, index) => {
      fillSocioBlock(page, font, socio, index);
    });
  }

  return outDoc.save();
}

/**
 * Genera PDF de certificado (hoja S) para un socio — layout idéntico al bloque oficial.
 */
export async function buildPartnerCertificatePdfBytes(
  draft: Modelo184Draft,
  partnerId: string
): Promise<Uint8Array> {
  const socio = draft.atribucionesSocios.find((s) => s.partnerId === partnerId);
  if (!socio) {
    throw new Error('Socio no encontrado en el borrador Modelo 184');
  }

  const templateBytes = await loadModelo184Template();
  const templateDoc = await PDFDocument.load(templateBytes);
  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);

  const [socioPage] = await outDoc.copyPages(templateDoc, [2]);
  outDoc.addPage(socioPage);
  const page = outDoc.getPages()[0];

  fillSocioPageHeader(page, font, draft);
  fillSocioBlock(page, font, socio, 0);

  return outDoc.save();
}
