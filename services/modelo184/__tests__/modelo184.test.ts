import { describe, expect, it } from 'vitest';
import { buildModelo184Draft } from '../buildModelo184Draft';
import { buildModelo184FileContent, buildModelo184Records, exportModelo184File } from '../fileExporter';
import { RECORD_LENGTH } from '../constants';
import { createEmptyRecord, recordToString } from '../recordUtils';
import type { AppSettings, Apartment, Invoice, Reservation } from '../../../types';

const settings: AppSettings = {
  cbName: 'APARTAMENTOS GRACIA 4, C.B.',
  nif: 'E56452543',
  fiscalRegime: 'ALQUILER_EXENTO',
  vatObligation: false,
  address: 'C/ Example 1',
  postalCode: '08012',
  city: 'Barcelona',
  province: 'Barcelona',
  phone: '977365665',
  partners: [
    {
      id: 'p1',
      name: 'BADILLO PUJOL ROSA',
      nif: '45542148D',
      participation: 50,
      provinceCode: '43',
      fiscalAddress: 'CR NACIONAL 340 KM 1145 43391 VINYOLS I LES GALLECS',
    },
    {
      id: 'p2',
      name: 'BADILLO PUJOL DANIEL',
      nif: '45542273L',
      participation: 50,
      provinceCode: '08',
      fiscalAddress: 'CL PUIGVERT 4 1 A 08490 SANT ESTEVE DE PALAUTORDERA',
    },
  ],
};

const apartments: Apartment[] = [
  {
    id: 'apt-1',
    name: 'Gracia 4',
    cadastralRef: '6591102CF3469B0001DD',
    apartmentType: 'TOURIST',
    isActive: true,
    fiscalYearId: 'fy-2025',
  },
];

const reservations: Reservation[] = [
  {
    id: 'r1',
    apartmentId: 'apt-1',
    apartmentName: 'Gracia 4',
    checkIn: '2025-06-01',
    checkOut: '2025-06-08',
    nights: 7,
    pricePerNight: 100,
    totalAmount: 700,
    paidAmount: 700,
    channel: 'Airbnb',
    reservationNumber: 'BK-1',
    status: 'Confirmed',
    numberOfGuests: 2,
    numberOfChildren: 0,
    touristTaxAmount: 0,
    touristTaxCollected: false,
    touristTaxNightsCounted: 0,
    depositAmount: 0,
    depositCollected: false,
    depositReturned: false,
    depositRetainedAmount: 0,
    fiscalYearId: 'fy-2025',
  },
];

const invoices: Invoice[] = [
  {
    id: 'g1',
    number: 'G-1',
    date: '2025-03-01',
    issuerName: 'Seguros',
    issuerNif: 'A00000000',
    baseAmount: 200,
    vatRate: 0,
    vatAmount: 0,
    totalAmount: 200,
    type: 'EXPENSE',
    status: 'PAID',
    category: 'Seguros',
    apartmentId: 'apt-1',
    fiscalYearId: 'fy-2025',
    history: [],
  },
  {
    id: 'g2',
    number: 'G-2',
    date: '2025-04-01',
    issuerName: 'Limpieza',
    issuerNif: 'B00000000',
    baseAmount: 100,
    vatRate: 0,
    vatAmount: 0,
    totalAmount: 100,
    type: 'EXPENSE',
    status: 'PAID',
    category: 'Limpieza',
    fiscalYearId: 'fy-2025',
    history: [],
  },
];

describe('buildModelo184Draft', () => {
  it('calcula ingresos desde reservas y reparte gastos sin apartamento', () => {
    const draft = buildModelo184Draft({
      settings,
      invoices,
      reservations,
      apartments,
      fiscalYearId: 'fy-2025',
      ejercicio: 2025,
    });

    expect(draft.resumen.ingresosTotales).toBe(700);
    expect(draft.resumen.gastosTotales).toBe(300);
    expect(draft.resumen.rendimientoNeto).toBe(400);
    expect(draft.rentasEntidad).toHaveLength(1);
    expect(draft.rentasEntidad[0].clave).toBe('C');
    expect(draft.rentasEntidad[0].cadastralRef).toBe('6591102CF3469B0001DD');
    expect(draft.atribucionesSocios).toHaveLength(2);
    expect(draft.atribucionesSocios[0].importe).toBe(200);
  });
});

describe('recordUtils', () => {
  it('crea registros de 500 caracteres', () => {
    expect(recordToString(createEmptyRecord()).length).toBe(500);
    expect(RECORD_LENGTH).toBe(500);
  });
});

describe('fileExporter', () => {
  it('genera registros de 500 caracteres', () => {
    const draft = buildModelo184Draft({
      settings,
      invoices,
      reservations,
      apartments,
      fiscalYearId: 'fy-2025',
      ejercicio: 2025,
    });

    const records = buildModelo184Records(draft);
    expect(records.length).toBe(1 + draft.rentasEntidad.length + draft.atribucionesSocios.length);
    expect(records.map((line) => line.length)).toEqual(
      Array.from({ length: records.length }, () => RECORD_LENGTH)
    );

    const content = buildModelo184FileContent(draft);
    const lines = content.trimEnd().split('\r\n').filter(Boolean);
    expect(lines.length).toBe(records.length);
    expect(lines[0].startsWith('1184')).toBe(true);
    expect(lines[1].charAt(75)).toBe('E');
    expect(lines[2].charAt(75)).toBe('S');
  });

  it('cada registro socio tiene 500 caracteres individualmente', () => {
    const singlePartnerSettings = { ...settings, partners: [settings.partners[0]] };
    const draft = buildModelo184Draft({
      settings: singlePartnerSettings,
      invoices,
      reservations,
      apartments,
      fiscalYearId: 'fy-2025',
      ejercicio: 2025,
    });
    const records = buildModelo184Records(draft);
    expect(records.every((line) => line.length === RECORD_LENGTH)).toBe(true);
  });

  it('exporta blob ISO-8859-1', () => {
    const draft = buildModelo184Draft({
      settings,
      invoices: [],
      reservations,
      apartments,
      fiscalYearId: 'fy-2025',
      ejercicio: 2025,
    });
    const blob = exportModelo184File(draft);
    expect(blob.type).toContain('iso-8859-1');
  });
});
