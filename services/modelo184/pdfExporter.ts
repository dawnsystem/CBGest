/**
 * @fileoverview Exportador PDF del Modelo 184 con layout alineado al formulario oficial.
 */

import { jsPDF } from 'jspdf';
import type { Modelo184Draft } from './types';

const PAGE_W = 210;
const MARGIN = 12;

function formatEuro(value: number): string {
  return `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function drawHeader(doc: jsPDF, title: string, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('MODELO 184', PAGE_W / 2, y, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(title, PAGE_W / 2, y + 5, { align: 'center' });
  return y + 12;
}

function drawBox(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  doc.setDrawColor(60);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);
}

/**
 * Genera PDF del borrador Modelo 184 (4 secciones equivalentes al formulario AEAT).
 */
export function exportModelo184Pdf(draft: Modelo184Draft): Blob {
  const doc = new jsPDF();
  let y = 14;

  y = drawHeader(doc, 'Declaración informativa anual — Entidades en atribución de rentas', y);
  doc.setFontSize(10);
  doc.text(`Ejercicio: ${draft.ejercicio}`, MARGIN, y);
  doc.text(`Generado: ${new Date(draft.generatedAt).toLocaleString('es-ES')}`, PAGE_W - MARGIN, y, { align: 'right' });
  y += 8;

  drawBox(doc, MARGIN, y, PAGE_W - MARGIN * 2, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Identificación del declarante', MARGIN + 2, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`NIF: ${draft.declarante.nif}`, MARGIN + 2, y + 12);
  doc.text(`Denominación: ${draft.declarante.denominacion}`, MARGIN + 2, y + 18);
  doc.text(
    `Domicilio: ${draft.declarante.domicilio.calle} ${draft.declarante.domicilio.numero}, ${draft.declarante.domicilio.codigoPostal} ${draft.declarante.domicilio.municipio}`,
    MARGIN + 2,
    y + 24
  );
  doc.text(`Teléfono: ${draft.declarante.telefono || '—'}`, MARGIN + 2, y + 30);
  doc.text(`Contacto: ${draft.declarante.personaContacto || '—'}`, MARGIN + 90, y + 30);
  doc.text(`Tipo entidad: ${draft.declarante.tipoEntidad} | Actividad: ${draft.declarante.actividadPrincipal}`, MARGIN + 2, y + 36);
  y += 50;

  drawBox(doc, MARGIN, y, PAGE_W - MARGIN * 2, 20);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumen declaración', MARGIN + 2, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(`Registros entidad: ${draft.resumen.numRegistrosEntidad}`, MARGIN + 2, y + 12);
  doc.text(`Registros socios: ${draft.resumen.numRegistrosSocios}`, MARGIN + 70, y + 12);
  doc.text(`Cifra de negocios: ${formatEuro(draft.declarante.cifraNegocios)}`, MARGIN + 2, y + 18);
  y += 28;

  doc.addPage();
  y = drawHeader(doc, 'Hoja de rentas de la entidad (Clave C — Capital inmobiliario)', 14);

  for (const renta of draft.rentasEntidad) {
    if (y > 250) {
      doc.addPage();
      y = drawHeader(doc, 'Hoja de rentas de la entidad (continuación)', 14);
    }

    drawBox(doc, MARGIN, y, PAGE_W - MARGIN * 2, 58);
    doc.setFont('helvetica', 'bold');
    doc.text(`Inmueble: ${renta.apartmentNames.join(', ') || renta.cadastralRef}`, MARGIN + 2, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(`Clave C / Subclave 01 | Ref. catastral: ${renta.cadastralRef}`, MARGIN + 2, y + 12);
    doc.text(`Ingresos íntegros: ${formatEuro(renta.ingresosIntegros)}`, MARGIN + 2, y + 18);
    doc.text(`Gastos deducibles: ${formatEuro(renta.gastos)}`, MARGIN + 90, y + 18);
    doc.text(`Renta atribuible: ${formatEuro(renta.rentaAtribuible)}`, MARGIN + 2, y + 24);
    doc.text(`Días arrendamiento: ${renta.diasArrendamiento}`, MARGIN + 90, y + 24);
    doc.setFontSize(8);
    doc.text(
      `Detalle gastos — Int:${renta.gastosDetalle.interesesFinanciacion.toFixed(2)} Rep:${renta.gastosDetalle.conservacionReparacion.toFixed(2)} Trib:${renta.gastosDetalle.tributosRecargos.toFixed(2)} Terc:${renta.gastosDetalle.cantidadesTerceros.toFixed(2)} Amort:${renta.gastosDetalle.amortizacionInmueble.toFixed(2)} Otros:${renta.gastosDetalle.otrosGastos.toFixed(2)}`,
      MARGIN + 2,
      y + 32,
      { maxWidth: PAGE_W - MARGIN * 2 - 4 }
    );
    doc.setFontSize(9);
    y += 66;
  }

  doc.addPage();
  y = drawHeader(doc, 'Hoja de socios, comuneros y partícipes', 14);

  for (const socio of draft.atribucionesSocios) {
    if (y > 255) {
      doc.addPage();
      y = drawHeader(doc, 'Hoja de socios (continuación)', 14);
    }

    drawBox(doc, MARGIN, y, PAGE_W - MARGIN * 2, 36);
    doc.setFont('helvetica', 'bold');
    doc.text(`${socio.nombre} (${socio.nif})`, MARGIN + 2, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(`Participación: ${socio.participacion}% | Clave C | Importe: ${formatEuro(socio.importe)}`, MARGIN + 2, y + 12);
    doc.text(`Domicilio: ${socio.domicilioFiscal}`, MARGIN + 2, y + 18);
    doc.text(`Ref. catastral: ${socio.cadastralRef} | Titularidad: ${socio.porcentajeTitularidad}%`, MARGIN + 2, y + 24);
    doc.text(`Miembro 31/12: ${socio.miembro31Diciembre ? 'Sí' : 'No'} | Días: ${socio.diasMiembro}`, MARGIN + 2, y + 30);
    y += 42;
  }

  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.text(
    'Borrador generado por CBGest. Verificar con asesoría antes de presentar en la AEAT.',
    PAGE_W / 2,
    290,
    { align: 'center' }
  );

  return doc.output('blob');
}

export function getModelo184PdfFileName(draft: Modelo184Draft): string {
  return `Modelo184_${draft.ejercicio}_${draft.declarante.nif.replace(/\s/g, '')}.pdf`;
}
