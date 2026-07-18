/**
 * @fileoverview Construye el borrador canónico del Modelo 184 desde datos CBGest.
 */

import type {
  Apartment,
  AppSettings,
  Invoice,
  Partner,
  Reservation,
} from '../../types';
import { MODELO_184_FISCAL, PROVINCE_NAME_TO_CODE } from './constants';
import {
  addGastoToDetalle,
  createEmptyGastosInmobiliario,
  round2,
  totalGastosDetalle,
} from './expenseMapping';
import type {
  Modelo184AtribucionSocio,
  Modelo184Draft,
  Modelo184RentaEntidad,
  Modelo184ValidationIssue,
} from './types';
import { formatDomicilioFiscal } from './recordUtils';

const CONFIRMED_RESERVATION_STATUSES = new Set(['CONFIRMED', 'PAID', 'PAIDCC', 'COMPLETED']);

export interface BuildModelo184DraftInput {
  settings: AppSettings;
  invoices: Invoice[];
  reservations: Reservation[];
  apartments: Apartment[];
  fiscalYearId: string;
  ejercicio: number;
}

interface PropertyBucket {
  cadastralRef: string;
  apartmentIds: string[];
  apartmentNames: string[];
  ingresos: number;
  gastosDetalle: ReturnType<typeof createEmptyGastosInmobiliario>;
  diasArrendamiento: number;
}

function parseIsoDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isInPeriod(dateValue: string, start: string, end: string): boolean {
  const date = parseIsoDate(dateValue);
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (!date || !startDate || !endDate) return false;
  return date >= startDate && date <= endDate;
}

function getReservationIncome(reservation: Reservation): number {
  if (reservation.paidAmount && reservation.paidAmount > 0) {
    return reservation.paidAmount;
  }
  return reservation.totalAmount
    || (reservation.pricePerNight || 0) * (reservation.nights || 0);
}

function isConfirmedReservation(reservation: Reservation): boolean {
  return CONFIRMED_RESERVATION_STATUSES.has(reservation.status?.toUpperCase() || '');
}

function expenseAmount(invoice: Invoice, settings: AppSettings): number {
  return settings.fiscalRegime === 'ALQUILER_EXENTO'
    ? (invoice.totalAmount || 0)
    : (invoice.baseAmount || 0);
}

function resolveProvinceCode(province?: string, fallback = '99'): string {
  if (!province) return fallback;
  const normalized = province.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return PROVINCE_NAME_TO_CODE[normalized] || PROVINCE_NAME_TO_CODE[province.toUpperCase()] || fallback;
}

function getPartnerDomicilio(partner: Partner): string {
  if (partner.fiscalAddress) return partner.fiscalAddress;
  return formatDomicilioFiscal({
    calle: partner.address,
    codigoPostal: partner.postalCode,
    municipio: partner.city,
    provincia: partner.province,
  });
}

function buildPropertyBuckets(
  input: BuildModelo184DraftInput,
  periodStart: string,
  periodEnd: string
): Map<string, PropertyBucket> {
  const apartmentById = new Map(input.apartments.map((apt) => [apt.id, apt]));
  const apartmentByName = new Map(
    input.apartments.map((apt) => [apt.name.trim().toLowerCase(), apt])
  );

  const buckets = new Map<string, PropertyBucket>();

  const getBucketKey = (apartment?: Apartment, fallbackName?: string): string => {
    const ref = apartment?.cadastralRef?.trim();
    if (ref) return ref;
    const name = apartment?.name || fallbackName || 'SIN_INMUEBLE';
    return `__NO_CATASTRO__:${name}`;
  };

  const ensureBucket = (key: string, apartment?: Apartment): PropertyBucket => {
    if (!buckets.has(key)) {
      buckets.set(key, {
        cadastralRef: apartment?.cadastralRef?.trim() || key.replace('__NO_CATASTRO__:', ''),
        apartmentIds: [],
        apartmentNames: [],
        ingresos: 0,
        gastosDetalle: createEmptyGastosInmobiliario(),
        diasArrendamiento: 0,
      });
    }
    const bucket = buckets.get(key)!;
    if (apartment?.id && !bucket.apartmentIds.includes(apartment.id)) {
      bucket.apartmentIds.push(apartment.id);
      bucket.apartmentNames.push(apartment.name);
    }
    return bucket;
  };

  const yearReservations = input.reservations.filter((reservation) => {
    if (!isConfirmedReservation(reservation)) return false;
    if (reservation.fiscalYearId && reservation.fiscalYearId !== input.fiscalYearId) return false;
    return isInPeriod(reservation.checkIn, periodStart, periodEnd);
  });

  for (const reservation of yearReservations) {
    const apartment = reservation.apartmentId
      ? apartmentById.get(reservation.apartmentId)
      : apartmentByName.get((reservation.apartmentName || '').trim().toLowerCase());
    const bucketKey = getBucketKey(apartment, reservation.apartmentName);
    const bucket = ensureBucket(bucketKey, apartment);
    bucket.ingresos = round2(bucket.ingresos + getReservationIncome(reservation));
    bucket.diasArrendamiento += reservation.nights || 0;
  }

  const finalizedExpenses = input.invoices.filter((invoice) => {
    if (invoice.type !== 'EXPENSE') return false;
    if (invoice.status === 'PENDING') return false;
    if (invoice.isDeductible === false) return false;
    if (invoice.fiscalYearId && invoice.fiscalYearId !== input.fiscalYearId) return false;
    return isInPeriod(invoice.date, periodStart, periodEnd);
  });

  const totalIngresos = Array.from(buckets.values()).reduce((sum, bucket) => sum + bucket.ingresos, 0);

  for (const invoice of finalizedExpenses) {
    const amount = expenseAmount(invoice, input.settings);
    let bucket: PropertyBucket | undefined;

    if (invoice.apartmentId) {
      const apartment = apartmentById.get(invoice.apartmentId);
      bucket = ensureBucket(getBucketKey(apartment), apartment);
    } else if (totalIngresos > 0) {
      for (const [, propertyBucket] of buckets) {
        const share = propertyBucket.ingresos / totalIngresos;
        propertyBucket.gastosDetalle = addGastoToDetalle(
          propertyBucket.gastosDetalle,
          invoice.category,
          round2(amount * share)
        );
      }
      continue;
    } else {
      bucket = ensureBucket('SIN_INMUEBLE');
    }

    bucket.gastosDetalle = addGastoToDetalle(bucket.gastosDetalle, invoice.category, amount);
  }

  return buckets;
}

function validateDraft(
  settings: AppSettings,
  rentas: Modelo184RentaEntidad[],
  issues: Modelo184ValidationIssue[]
): Modelo184ValidationIssue[] {
  const result = [...issues];

  if (!settings.nif?.trim()) {
    result.push({ severity: 'error', code: 'M184-NIF-CB', message: 'Falta el NIF de la comunidad de bienes.' });
  }
  if (!settings.cbName?.trim()) {
    result.push({ severity: 'error', code: 'M184-NAME', message: 'Falta la denominación de la CB.' });
  }
  if (!settings.address?.trim() || !settings.city?.trim() || !settings.postalCode?.trim()) {
    result.push({ severity: 'error', code: 'M184-DOMICILIO', message: 'Completa el domicilio fiscal de la CB en Ajustes.' });
  }

  const participation = (settings.partners || []).reduce((sum, partner) => sum + partner.participation, 0);
  if (Math.abs(participation - 100) > 0.1) {
    result.push({
      severity: 'error',
      code: 'M184-PARTICIPATION',
      message: `La suma de participaciones debe ser 100% (actual: ${participation}%).`,
    });
  }

  for (const partner of settings.partners || []) {
    if (!partner.nif?.trim()) {
      result.push({ severity: 'error', code: 'M184-NIF-PARTNER', message: `Falta NIF del comunero ${partner.name}.` });
    }
  }

  for (const renta of rentas) {
    if (!renta.cadastralRef || renta.cadastralRef.startsWith('__NO_CATASTRO__')) {
      result.push({
        severity: 'error',
        code: 'M184-CATASTRO',
        message: `Falta referencia catastral para: ${renta.apartmentNames.join(', ') || 'inmueble sin nombre'}.`,
      });
    }
  }

  return result;
}

/**
 * Construye el borrador del Modelo 184 alineado con clave C (capital inmobiliario).
 */
export function buildModelo184Draft(input: BuildModelo184DraftInput): Modelo184Draft {
  const periodStart = `${input.ejercicio}-01-01`;
  const periodEnd = `${input.ejercicio}-12-31`;
  const buckets = buildPropertyBuckets(input, periodStart, periodEnd);
  const issues: Modelo184ValidationIssue[] = [];

  if (buckets.size === 0) {
    issues.push({
      severity: 'warning',
      code: 'M184-SIN-INGRESOS',
      message: 'No hay reservas confirmadas en el ejercicio fiscal seleccionado.',
    });
  }

  const rentasEntidad: Modelo184RentaEntidad[] = Array.from(buckets.values()).map((bucket) => {
    const gastos = totalGastosDetalle(bucket.gastosDetalle);
    const ingresos = round2(bucket.ingresos);
    return {
      cadastralRef: bucket.cadastralRef,
      apartmentIds: bucket.apartmentIds,
      apartmentNames: bucket.apartmentNames,
      clave: MODELO_184_FISCAL.clave,
      subclave: MODELO_184_FISCAL.subclave,
      situacionInmueble: bucket.cadastralRef ? MODELO_184_FISCAL.situacionInmuebleEspanaConCatastro : 4,
      ingresosIntegros: ingresos,
      gastos,
      gastosDetalle: bucket.gastosDetalle,
      rentaAtribuible: round2(ingresos - gastos),
      diasArrendamiento: Math.min(bucket.diasArrendamiento, 365),
    };
  });

  const atribucionesSocios: Modelo184AtribucionSocio[] = [];
  for (const renta of rentasEntidad) {
    for (const partner of input.settings.partners || []) {
      atribucionesSocios.push({
        partnerId: partner.id,
        nif: partner.nif,
        nombre: partner.name,
        domicilioFiscal: getPartnerDomicilio(partner),
        provinciaCode: partner.provinceCode || resolveProvinceCode(partner.province),
        tipoParticipe: MODELO_184_FISCAL.tipoParticipeResidente,
        miembro31Diciembre: partner.memberAtYearEnd ?? true,
        diasMiembro: partner.memberDays ?? 365,
        participacion: partner.participation,
        cadastralRef: renta.cadastralRef,
        situacionInmueble: renta.situacionInmueble,
        naturalezaInmueble: MODELO_184_FISCAL.naturalezaInmuebleUrbano,
        claveTitularidad: MODELO_184_FISCAL.claveTitularidad,
        porcentajeTitularidad: partner.participation,
        diasArrendamiento: renta.diasArrendamiento,
        clave: MODELO_184_FISCAL.clave,
        importe: round2(renta.rentaAtribuible * (partner.participation / 100)),
      });
    }
  }

  const ingresosTotales = round2(rentasEntidad.reduce((sum, renta) => sum + renta.ingresosIntegros, 0));
  const gastosTotales = round2(rentasEntidad.reduce((sum, renta) => sum + renta.gastos, 0));
  const rendimientoNeto = round2(ingresosTotales - gastosTotales);

  const validatedIssues = validateDraft(input.settings, rentasEntidad, issues);

  return {
    ejercicio: input.ejercicio,
    fiscalYearId: input.fiscalYearId,
    generatedAt: new Date().toISOString(),
    declarante: {
      nif: input.settings.nif,
      denominacion: input.settings.cbName,
      telefono: input.settings.phone || '',
      personaContacto: input.settings.contactPerson || '',
      domicilio: {
        calle: input.settings.address || '',
        numero: input.settings.streetNumber || '',
        municipio: input.settings.city || '',
        provincia: input.settings.province || '',
        codigoPostal: input.settings.postalCode || '',
      },
      tipoEntidad: MODELO_184_FISCAL.tipoEntidad,
      actividadPrincipal: MODELO_184_FISCAL.actividadPrincipal,
      representativeNif: input.settings.representativeNif || '',
      representativeName: input.settings.representativeName || '',
      cifraNegocios: ingresosTotales,
    },
    rentasEntidad,
    atribucionesSocios,
    resumen: {
      ingresosTotales,
      gastosTotales,
      rendimientoNeto,
      numRegistrosEntidad: rentasEntidad.length,
      numRegistrosSocios: atribucionesSocios.length,
    },
    settings: input.settings,
    issues: validatedIssues,
  };
}

/**
 * Indica si el borrador tiene errores bloqueantes para exportar.
 */
export function hasBlockingIssues(draft: Modelo184Draft): boolean {
  return draft.issues.some((issue) => issue.severity === 'error');
}
