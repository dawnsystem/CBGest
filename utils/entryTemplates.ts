import { AccountingEntryLine } from '../types';

/**
 * Plantilla de asiento contable predefinida.
 * Las líneas tienen cuenta pre-asignada; el usuario rellena los importes.
 */
export interface EntryTemplate {
  /** Identificador único de la plantilla */
  id: string;
  /** Nombre descriptivo mostrado en el selector */
  name: string;
  /** Emoji/icono representativo */
  icon: string;
  /** Concepto sugerido para el asiento (editable por el usuario) */
  defaultConcept: string;
  /** Líneas pre-configuradas (importes en 0, el usuario los introduce) */
  lines: AccountingEntryLine[];
}

/**
 * Librería de plantillas de asientos frecuentes para la gestión de apartamentos.
 * Basada en el régimen simplificado de IRPF (sin IVA soportado ni repercutido).
 *
 * @example
 * const template = ENTRY_TEMPLATES.find(t => t.id === 'airbnb-income');
 * if (template) applyTemplate(template);
 */
export const ENTRY_TEMPLATES: EntryTemplate[] = [
  {
    id: 'airbnb-income',
    name: 'Ingreso Airbnb',
    icon: '🏠',
    defaultConcept: 'Ingreso reserva Airbnb',
    lines: [
      { accountCode: '572', accountName: 'Bancos e instituciones de crédito', debit: 0, credit: 0 },
      { accountCode: '705', accountName: 'Prestaciones de servicios', debit: 0, credit: 0 },
    ],
  },
  {
    id: 'booking-income',
    name: 'Ingreso Booking',
    icon: '📅',
    defaultConcept: 'Ingreso reserva Booking.com',
    lines: [
      { accountCode: '572', accountName: 'Bancos e instituciones de crédito', debit: 0, credit: 0 },
      { accountCode: '705', accountName: 'Prestaciones de servicios', debit: 0, credit: 0 },
    ],
  },
  {
    id: 'cleaning-service',
    name: 'Servicio de limpieza',
    icon: '🧹',
    defaultConcept: 'Servicio de limpieza apartamento',
    lines: [
      { accountCode: '623', accountName: 'Servicios de profesionales independientes', debit: 0, credit: 0 },
      { accountCode: '572', accountName: 'Bancos e instituciones de crédito', debit: 0, credit: 0 },
    ],
  },
  {
    id: 'utilities',
    name: 'Suministros (luz/agua/gas)',
    icon: '⚡',
    defaultConcept: 'Suministros - luz/agua/gas',
    lines: [
      { accountCode: '628', accountName: 'Suministros', debit: 0, credit: 0 },
      { accountCode: '572', accountName: 'Bancos e instituciones de crédito', debit: 0, credit: 0 },
    ],
  },
  {
    id: 'insurance',
    name: 'Seguro apartamento',
    icon: '🛡️',
    defaultConcept: 'Prima seguro multirriesgo hogar',
    lines: [
      { accountCode: '625', accountName: 'Primas de seguros', debit: 0, credit: 0 },
      { accountCode: '572', accountName: 'Bancos e instituciones de crédito', debit: 0, credit: 0 },
    ],
  },
  {
    id: 'platform-commission',
    name: 'Comisión plataforma',
    icon: '💳',
    defaultConcept: 'Comisión plataforma de alquiler',
    lines: [
      { accountCode: '627', accountName: 'Publicidad, propaganda y relaciones públicas', debit: 0, credit: 0 },
      { accountCode: '572', accountName: 'Bancos e instituciones de crédito', debit: 0, credit: 0 },
    ],
  },
  {
    id: 'maintenance-repair',
    name: 'Reparación / mantenimiento',
    icon: '🔧',
    defaultConcept: 'Reparación y conservación',
    lines: [
      { accountCode: '622', accountName: 'Reparaciones y conservación', debit: 0, credit: 0 },
      { accountCode: '572', accountName: 'Bancos e instituciones de crédito', debit: 0, credit: 0 },
    ],
  },
  {
    id: 'ibi-taxes',
    name: 'IBI / tributos locales',
    icon: '🏛️',
    defaultConcept: 'IBI - Impuesto sobre Bienes Inmuebles',
    lines: [
      { accountCode: '631', accountName: 'Otros tributos', debit: 0, credit: 0 },
      { accountCode: '572', accountName: 'Bancos e instituciones de crédito', debit: 0, credit: 0 },
    ],
  },
  {
    id: 'manager-fee',
    name: 'Gestor / asesoría',
    icon: '📊',
    defaultConcept: 'Honorarios gestor/asesoría',
    lines: [
      { accountCode: '623', accountName: 'Servicios de profesionales independientes', debit: 0, credit: 0 },
      { accountCode: '572', accountName: 'Bancos e instituciones de crédito', debit: 0, credit: 0 },
    ],
  },
];
