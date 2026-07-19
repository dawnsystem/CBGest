import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { buildModelo184Draft } from '../buildModelo184Draft';
import { buildModelo184PdfBytes, buildPartnerCertificatePdfBytes } from '../pdf/fillPages';
import { clearModelo184TemplateCache } from '../pdf/templateLoader';
import type { AppSettings } from '../../../types';

const templatePath = path.resolve(process.cwd(), 'public/assets/modelo184/modelo184-blank.pdf');

const baseSettings: AppSettings = {
  cbName: 'APARTAMENTOS GRACIA 4, C.B.',
  nif: 'E56452543',
  fiscalRegime: 'ALQUILER_EXENTO',
  vatObligation: false,
  address: 'C/ Example 1',
  postalCode: '08012',
  city: 'Barcelona',
  province: 'Barcelona',
  phone: '977365665',
  contactPerson: 'PERDRIX - SOLE ASSESSORS SLP',
  representativeNif: '45542273L',
  representativeName: 'BADILLO PUJOL DANIEL',
  partners: [
    {
      id: 'p1',
      name: 'BADILLO PUJOL ROSA',
      nif: '45542148D',
      participation: 50,
      fiscalAddress: 'CR NACIONAL 340 KM 1145 43391 VINYOLS I LES GALLECS',
      provinceCode: '43',
    },
    {
      id: 'p2',
      name: 'BADILLO PUJOL DANIEL',
      nif: '45542273L',
      participation: 50,
      fiscalAddress: 'CL PUIGVERT 4 1 A 08490 SANT ESTEVE DE PALAUTORDERA',
      provinceCode: '08',
    },
  ],
};

beforeAll(() => {
  const bytes = fs.readFileSync(templatePath);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('modelo184-blank.pdf')) {
      return new Response(bytes, { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }));
  clearModelo184TemplateCache();
});

describe('modelo184 PDF oficial', () => {
  it('genera PDF completo con 3+ páginas sobre plantilla AEAT', async () => {
    const draft = buildModelo184Draft({
      settings: baseSettings,
      invoices: [],
      reservations: [
        {
          id: 'r1',
          apartmentId: 'a1',
          checkIn: '2025-06-01',
          checkOut: '2025-06-10',
          totalAmount: 61020.39,
          status: 'CONFIRMED',
          fiscalYearId: 'fy-2025',
        } as never,
      ],
      apartments: [
        {
          id: 'a1',
          name: 'Apt 1',
          cadastralRef: '6591102CF3469B0001DD',
          fiscalYearId: 'fy-2025',
        } as never,
      ],
      fiscalYearId: 'fy-2025',
      ejercicio: 2025,
    });

    const pdfBytes = await buildModelo184PdfBytes(draft);
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it('genera certificado de socio (1 página hoja S)', async () => {
    const draft = buildModelo184Draft({
      settings: baseSettings,
      invoices: [],
      reservations: [
        {
          id: 'r1',
          apartmentId: 'a1',
          checkIn: '2025-06-01',
          checkOut: '2025-06-10',
          totalAmount: 1000,
          status: 'CONFIRMED',
          fiscalYearId: 'fy-2025',
        } as never,
      ],
      apartments: [{ id: 'a1', name: 'Apt 1', cadastralRef: '6591102CF3469B0001DD' } as never],
      fiscalYearId: 'fy-2025',
      ejercicio: 2025,
    });

    const pdfBytes = await buildPartnerCertificatePdfBytes(draft, 'p1');
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(1);
  });
});
