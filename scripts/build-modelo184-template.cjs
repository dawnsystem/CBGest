#!/usr/bin/env node
/**
 * Genera plantilla PDF en blanco del Modelo 184 a partir del justificante AEAT.
 * Blanquea automáticamente todos los valores de datos detectados.
 *
 * Uso:
 *   node scripts/build-modelo184-template.cjs [ruta-pdf-referencia]
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_REF = path.join(PROJECT_ROOT, 'scripts/fixtures/modelo184-reference.pdf');
const OUT_PATH = path.join(PROJECT_ROOT, 'public/assets/modelo184/modelo184-blank.pdf');

function isDataToken(text) {
  const s = text.trim();
  if (!s || s.length < 1) return false;
  if (s.includes('....')) return false;
  if (/^https?:/i.test(s)) return false;
  if (/autenticidad|verificación|justificante|sede\.agenciatributaria/i.test(s)) return false;
  if (/^(IMPUESTO|ENTIDADES|DECLARACIÓN|DECLARACION|MODELO|MINISTERIO|AGENCIA|TRIBUTARIA)/i.test(s)) return false;
  if (/^DE (NO )?RESIDENTES/i.test(s)) return false;
  if (/^[\d.,]+$/.test(s)) return true;
  if (/^[0-9]{8}[A-Z0-9]$/i.test(s) || /^[A-Z][0-9]{7}[A-Z0-9]$/i.test(s) || /^[A-Z]\d{8}$/i.test(s)) return true;
  if (s === 'X' || /^[A-Z]$/.test(s) || /^\d{1,2}$/.test(s)) return true;
  if (/^\d{1,3},\d{2,4}$/.test(s)) return true;
  if (/[A-Z].*\d/.test(s) && s.length >= 8) return true;
  if (/^[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s.\-/]{6,}$/.test(s)) return true;
  return false;
}

async function loadPdfJs() {
  return import('pdfjs-dist/legacy/build/pdf.mjs');
}

async function collectDataRects(pdfjs, pdfBytes, pageNumber) {
  const doc = await pdfjs.getDocument({ data: pdfBytes }).promise;
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const rects = [];

  for (const item of content.items) {
    const text = (item.str || '').trim();
    if (!isDataToken(text)) continue;
    const t = item.transform;
    const x = t[4];
    const y = t[5];
    const w = Math.max(item.width || text.length * 5, 12);
    const h = 11;
    rects.push({ x: x - 2, y: y - 2, w: w + 6, h: h + 4 });
  }

  return rects;
}

async function main() {
  const refPath = process.argv[2] || DEFAULT_REF;
  if (!fs.existsSync(refPath)) {
    console.error(`❌ No se encuentra PDF de referencia: ${refPath}`);
    process.exit(1);
  }

  const pdfjs = await loadPdfJs();
  const refBytes = fs.readFileSync(refPath);
  const refDoc = await PDFDocument.load(refBytes);
  const outDoc = await PDFDocument.create();

  const pageIndexes = [1, 2, 3];
  const pageNumbers = [2, 3, 4];

  for (let i = 0; i < pageIndexes.length; i++) {
    const rects = await collectDataRects(pdfjs, new Uint8Array(refBytes), pageNumbers[i]);
    const [copiedPage] = await outDoc.copyPages(refDoc, [pageIndexes[i]]);
    const page = outDoc.addPage(copiedPage);

    for (const rect of rects) {
      page.drawRectangle({
        x: rect.x,
        y: rect.y,
        width: rect.w,
        height: rect.h,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      });
    }
    console.log(`  Página ${i + 1}: ${rects.length} casillas blanqueadas`);
  }

  const pdfOut = await outDoc.save();
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, pdfOut);
  console.log(`✅ Plantilla generada: ${OUT_PATH}`);
}

main().catch((error) => {
  console.error('❌', error);
  process.exit(1);
});
