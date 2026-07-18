/**
 * @fileoverview Tipos canónicos del borrador Modelo 184 (AEAT).
 */

import type { AppSettings } from '../../types';

/** Clave de rendimiento declarada en el registro tipo 2. */
export type Modelo184Clave = 'C';

/** Subclave para rendimientos en España (capital inmobiliario). */
export type Modelo184Subclave = '01';

/** Desglose de gastos deducibles — clave C (capital inmobiliario). */
export interface Modelo184GastosInmobiliario {
  interesesFinanciacion: number;
  conservacionReparacion: number;
  interesesPendientes: number;
  tributosRecargos: number;
  saldosDudosoCobro: number;
  cantidadesTerceros: number;
  primasSeguros: number;
  amortizacionInmueble: number;
  amortizacionMuebles: number;
  otrosGastos: number;
}

/** Renta de la entidad por inmueble (registro tipo 2, hoja E). */
export interface Modelo184RentaEntidad {
  cadastralRef: string;
  apartmentIds: string[];
  apartmentNames: string[];
  clave: Modelo184Clave;
  subclave: Modelo184Subclave;
  situacionInmueble: 1 | 2 | 3 | 4 | 5;
  ingresosIntegros: number;
  gastos: number;
  gastosDetalle: Modelo184GastosInmobiliario;
  rentaAtribuible: number;
  diasArrendamiento: number;
}

/** Atribución a socio por inmueble (registro tipo 2, hoja S). */
export interface Modelo184AtribucionSocio {
  partnerId: string;
  nif: string;
  nombre: string;
  domicilioFiscal: string;
  provinciaCode: string;
  tipoParticipe: 1 | 2 | 3;
  miembro31Diciembre: boolean;
  diasMiembro: number;
  participacion: number;
  cadastralRef: string;
  situacionInmueble: number;
  naturalezaInmueble: 1 | 2;
  claveTitularidad: 'T' | 'N' | 'U' | 'O';
  porcentajeTitularidad: number;
  diasArrendamiento: number;
  clave: Modelo184Clave;
  importe: number;
}

/** Aviso de validación pre-exportación. */
export interface Modelo184ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

/** Borrador completo del Modelo 184. */
export interface Modelo184Draft {
  ejercicio: number;
  fiscalYearId: string;
  generatedAt: string;
  declarante: {
    nif: string;
    denominacion: string;
    telefono: string;
    personaContacto: string;
    domicilio: {
      calle: string;
      numero: string;
      municipio: string;
      provincia: string;
      codigoPostal: string;
    };
    tipoEntidad: number;
    actividadPrincipal: number;
    representativeNif: string;
    representativeName: string;
    cifraNegocios: number;
  };
  rentasEntidad: Modelo184RentaEntidad[];
  atribucionesSocios: Modelo184AtribucionSocio[];
  resumen: {
    ingresosTotales: number;
    gastosTotales: number;
    rendimientoNeto: number;
    numRegistrosEntidad: number;
    numRegistrosSocios: number;
  };
  settings: AppSettings;
  issues: Modelo184ValidationIssue[];
}

/** Estado persistido en Appwrite (`tax_reports`). */
export type TaxReportStatus = 'DRAFT' | 'EXPORTED' | 'FILED';

export interface TaxReport {
  id: string;
  fiscalYearId: string;
  year: number;
  status: TaxReportStatus;
  draft: Modelo184Draft;
  exportedAt?: string;
  fileHash?: string;
  presentationReference?: string;
  appwriteId?: string;
}
