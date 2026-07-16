export interface AccountOption {
  code: string;
  name: string;
}

// Helper function para obtener una cuenta por código
export const getAccountByCode = (code: string): AccountOption | undefined => {
  return ACCOUNT_PLAN.find(a => a.code === code);
};

// Helper function para obtener nombre de cuenta por código
export const getAccountName = (code: string): string => {
  const account = getAccountByCode(code);
  return account?.name || code;
};

// Helper function para formatear cuenta como "CÓDIGO - NOMBRE"
export const formatAccount = (code: string): string => {
  const account = getAccountByCode(code);
  return account ? `${account.code} - ${account.name}` : code;
};

// Grupos de cuentas por naturaleza
export const ACCOUNT_GROUPS = {
  ACTIVO: ['1', '2', '3', '4', '5'], // Simplificado - activos
  PASIVO: ['1', '4', '5'],           // Simplificado - pasivos
  GASTOS: ['6'],                      // Grupo 6
  INGRESOS: ['7'],                    // Grupo 7
  TESORERIA: ['57'],                  // Cuentas de caja y bancos
  IVA_SOPORTADO: ['472'],             // IVA soportado
  IVA_REPERCUTIDO: ['477'],           // IVA repercutido
  PROVEEDORES: ['40'],                // Proveedores
  ACREEDORES: ['41'],                 // Acreedores
  CLIENTES: ['43'],                   // Clientes
};

// Verificar si una cuenta es de tesorería (banco/caja)
export const isTreasuryAccount = (code: string): boolean => {
  return code.startsWith('57');
};

/** Prefijos PGC del grupo 4 con naturaleza deudora (CTB-002). */
const DEBIT_NATURE_GROUP4_PREFIXES = [
  '43',  // Clientes
  '44',  // Deudores varios
  '460', // Anticipos de remuneraciones
  '470', // Hacienda Pública, deudora por diversos conceptos
  '471', // Organismos de la Seguridad Social, deudores
  '472', // Hacienda Pública, IVA soportado
  '473', // Hacienda Pública, retenciones y pagos a cuenta
  '474', // Activos por impuesto diferido
] as const;

/**
 * Determina si una cuenta es de naturaleza deudora (saldo normal en el Debe).
 *
 * Regla general: grupos 1, 2, 3, 5, 6 son deudores.
 * Excepciones dentro del grupo 4 (activos pese a ser grupo 4):
 * 43x/44x, 460 y 470–474. No incluye 465 ni 475–479 (acreedoras).
 *
 * @param accountCode - Código de cuenta PGC (ej: "430", "472", "400")
 * @returns true si la cuenta tiene naturaleza deudora
 * @example
 * isDebitNatureAccount('472') // true — IVA soportado
 * isDebitNatureAccount('477') // false — IVA repercutido
 * isDebitNatureAccount('400') // false — Proveedores
 */
export const isDebitNatureAccount = (accountCode: string): boolean => {
  if (['1', '2', '3', '5', '6'].some(g => accountCode.startsWith(g))) {
    return true;
  }
  return DEBIT_NATURE_GROUP4_PREFIXES.some(prefix => accountCode.startsWith(prefix));
};

// Verificar si una cuenta es de IVA
export const isVATAccount = (code: string): boolean => {
  return code.startsWith('472') || code.startsWith('477');
};

// Verificar si una cuenta es de gasto
export const isExpenseAccount = (code: string): boolean => {
  return code.startsWith('6');
};

// Verificar si una cuenta es de ingreso
export const isIncomeAccount = (code: string): boolean => {
  return code.startsWith('7');
};

// Plan General Contable Español - Adaptado para Comunidades de Bienes
// Fuente: PGC aprobado por Real Decreto 1514/2007
// Simplificado y enfocado en actividades inmobiliarias/turísticas
export const ACCOUNT_PLAN: AccountOption[] = [
  // ===================================================================
  // GRUPO 6 - COMPRAS Y GASTOS
  // ===================================================================

  // Subgrupo 60 - Compras
  { code: '600', name: 'Compras de mercaderías' },
  { code: '601', name: 'Compras de materias primas' },
  { code: '602', name: 'Compras de otros aprovisionamientos' },

  // Subgrupo 62 - Servicios exteriores
  { code: '621', name: 'Arrendamientos y cánones' },
  { code: '622', name: 'Reparaciones y conservación' },
  { code: '623', name: 'Servicios de profesionales independientes' },
  { code: '624', name: 'Transportes' },
  { code: '625', name: 'Primas de seguros' },
  { code: '626', name: 'Servicios bancarios y similares' },
  { code: '627', name: 'Publicidad, propaganda y relaciones públicas' },
  { code: '628', name: 'Suministros' },
  { code: '629', name: 'Otros servicios' },

  // Subgrupo 63 - Tributos
  { code: '630', name: 'Impuesto sobre beneficios' },
  { code: '631', name: 'Otros tributos' },
  { code: '633', name: 'Ajustes negativos en la imposición sobre beneficios' },
  { code: '634', name: 'Ajustes negativos en la imposición indirecta' },
  { code: '636', name: 'Devolución de impuestos' },
  { code: '638', name: 'Ajustes positivos en la imposición sobre beneficios' },
  { code: '639', name: 'Ajustes positivos en la imposición indirecta' },

  // Subgrupo 64 - Gastos de personal
  { code: '640', name: 'Sueldos y salarios' },
  { code: '641', name: 'Indemnizaciones' },
  { code: '642', name: 'Seguridad Social a cargo de la empresa' },
  { code: '643', name: 'Retribuciones a largo plazo mediante sistemas de aportación definida' },
  { code: '644', name: 'Retribuciones a largo plazo mediante sistemas de prestación definida' },
  { code: '649', name: 'Otros gastos sociales' },

  // Subgrupo 65 - Otros gastos de gestión
  { code: '650', name: 'Pérdidas de créditos comerciales incobrables' },
  { code: '651', name: 'Resultados de operaciones en común' },
  { code: '659', name: 'Otras pérdidas en gestión corriente' },

  // Subgrupo 66 - Gastos financieros
  { code: '662', name: 'Intereses de deudas' },
  { code: '663', name: 'Pérdidas por valoración de activos financieros por su valor razonable' },
  { code: '665', name: 'Intereses por descuento de efectos y operaciones de factoring' },
  { code: '666', name: 'Pérdidas en participaciones y valores representativos de deuda' },
  { code: '667', name: 'Pérdidas de créditos no comerciales' },
  { code: '668', name: 'Diferencias negativas de cambio' },
  { code: '669', name: 'Otros gastos financieros' },

  // Subgrupo 68 - Dotaciones para amortizaciones
  { code: '680', name: 'Amortización del inmovilizado intangible' },
  { code: '681', name: 'Amortización del inmovilizado material' },
  { code: '682', name: 'Amortización de las inversiones inmobiliarias' },

  // Subgrupo 69 - Pérdidas por deterioro y otras dotaciones
  { code: '690', name: 'Pérdidas por deterioro del inmovilizado intangible' },
  { code: '691', name: 'Pérdidas por deterioro del inmovilizado material' },
  { code: '692', name: 'Pérdidas por deterioro de las inversiones inmobiliarias' },
  { code: '693', name: 'Pérdidas por deterioro de existencias' },
  { code: '694', name: 'Pérdidas por deterioro de créditos comerciales' },
  { code: '695', name: 'Dotación a la provisión por operaciones comerciales' },
  { code: '696', name: 'Pérdidas por deterioro de participaciones y valores representativos de deuda a largo plazo' },
  { code: '697', name: 'Pérdidas por deterioro de créditos a largo plazo' },
  { code: '698', name: 'Pérdidas por deterioro de participaciones y valores representativos de deuda a corto plazo' },
  { code: '699', name: 'Pérdidas por deterioro de créditos a corto plazo' },

  // ===================================================================
  // GRUPO 7 - VENTAS E INGRESOS
  // ===================================================================

  // Subgrupo 70 - Ventas de mercaderías, de producción propia, de servicios, etc.
  { code: '700', name: 'Ventas de mercaderías' },
  { code: '701', name: 'Ventas de productos terminados' },
  { code: '702', name: 'Ventas de productos semiterminados' },
  { code: '703', name: 'Ventas de subproductos y residuos' },
  { code: '704', name: 'Ventas de envases y embalajes' },
  { code: '705', name: 'Prestaciones de servicios' },
  { code: '706', name: 'Descuentos sobre ventas por pronto pago' },
  { code: '708', name: 'Devoluciones de ventas y operaciones similares' },
  { code: '709', name: 'Rappels sobre ventas' },

  // Subgrupo 71 - Variación de existencias
  { code: '710', name: 'Variación de existencias de productos en curso' },
  { code: '711', name: 'Variación de existencias de productos semiterminados' },
  { code: '712', name: 'Variación de existencias de productos terminados' },
  { code: '713', name: 'Variación de existencias de subproductos, residuos y materiales recuperados' },

  // Subgrupo 73 - Trabajos realizados para la empresa
  { code: '730', name: 'Trabajos realizados para el inmovilizado intangible' },
  { code: '731', name: 'Trabajos realizados para el inmovilizado material' },
  { code: '732', name: 'Trabajos realizados en inversiones inmobiliarias' },
  { code: '733', name: 'Trabajos realizados para el inmovilizado material en curso' },

  // Subgrupo 74 - Subvenciones, donaciones y legados
  { code: '740', name: 'Subvenciones, donaciones y legados a la explotación' },
  { code: '746', name: 'Subvenciones, donaciones y legados de capital transferidos al resultado del ejercicio' },
  { code: '747', name: 'Otras subvenciones, donaciones y legados transferidos al resultado del ejercicio' },

  // Subgrupo 75 - Otros ingresos de gestión
  { code: '751', name: 'Resultados de operaciones en común' },
  { code: '752', name: 'Ingresos por arrendamientos' },
  { code: '753', name: 'Ingresos de propiedad industrial cedida en explotación' },
  { code: '754', name: 'Ingresos por comisiones' },
  { code: '755', name: 'Ingresos por servicios al personal' },
  { code: '759', name: 'Ingresos por servicios diversos' },

  // Subgrupo 76 - Ingresos financieros
  { code: '760', name: 'Ingresos de participaciones en instrumentos de patrimonio' },
  { code: '761', name: 'Ingresos de valores representativos de deuda' },
  { code: '762', name: 'Ingresos de créditos' },
  { code: '763', name: 'Beneficios por valoración de activos financieros por su valor razonable' },
  { code: '766', name: 'Beneficios en participaciones y valores representativos de deuda' },
  { code: '768', name: 'Diferencias positivas de cambio' },
  { code: '769', name: 'Otros ingresos financieros' },

  // Subgrupo 79 - Excesos y aplicaciones de provisiones y de pérdidas por deterioro
  { code: '790', name: 'Reversión del deterioro del inmovilizado intangible' },
  { code: '791', name: 'Reversión del deterioro del inmovilizado material' },
  { code: '792', name: 'Reversión del deterioro de las inversiones inmobiliarias' },
  { code: '793', name: 'Reversión del deterioro de existencias' },
  { code: '794', name: 'Reversión del deterioro de créditos comerciales' },
  { code: '795', name: 'Exceso de provisiones' },
  { code: '796', name: 'Reversión del deterioro de participaciones y valores representativos de deuda a largo plazo' },
  { code: '797', name: 'Reversión del deterioro de créditos a largo plazo' },
  { code: '798', name: 'Reversión del deterioro de participaciones y valores representativos de deuda a corto plazo' },
  { code: '799', name: 'Reversión del deterioro de créditos a corto plazo' },

  // ===================================================================
  // GRUPO 4 - ACREEDORES Y DEUDORES POR OPERACIONES COMERCIALES
  // ===================================================================

  // Subgrupo 40 - Proveedores
  { code: '400', name: 'Proveedores' },
  { code: '401', name: 'Proveedores, efectos comerciales a pagar' },
  { code: '403', name: 'Proveedores, empresas del grupo' },
  { code: '406', name: 'Envases y embalajes a devolver a proveedores' },
  { code: '407', name: 'Anticipos a proveedores' },

  // Subgrupo 41 - Acreedores varios
  { code: '410', name: 'Acreedores por prestaciones de servicios' },
  { code: '411', name: 'Acreedores, efectos comerciales a pagar' },
  { code: '419', name: 'Acreedores por operaciones en común' },

  // Subgrupo 43 - Clientes
  { code: '430', name: 'Clientes' },
  { code: '431', name: 'Clientes, efectos comerciales a cobrar' },
  { code: '432', name: 'Clientes, operaciones de factoring' },
  { code: '435', name: 'Clientes de dudoso cobro' },
  { code: '436', name: 'Clientes de dudoso cobro' },
  { code: '437', name: 'Envases y embalajes a devolver por clientes' },
  { code: '438', name: 'Anticipos de clientes' },

  // Subgrupo 44 - Deudores varios
  { code: '440', name: 'Deudores' },
  { code: '441', name: 'Deudores, efectos comerciales a cobrar' },
  { code: '445', name: 'Deudores de dudoso cobro' },
  { code: '449', name: 'Deudores por operaciones en común' },

  // Subgrupo 46 - Personal
  { code: '460', name: 'Anticipos de remuneraciones' },
  { code: '465', name: 'Remuneraciones pendientes de pago' },

  // Subgrupo 47 - Administraciones Públicas
  { code: '470', name: 'Hacienda Pública, deudora por diversos conceptos' },
  { code: '4700', name: 'Hacienda Pública, deudora por IVA' },
  { code: '4708', name: 'Hacienda Pública, deudora por subvenciones' },
  { code: '4709', name: 'Hacienda Pública, deudora por devoluciones' },
  { code: '471', name: 'Organismos de la Seguridad Social, deudores' },
  { code: '472', name: 'Hacienda Pública, IVA soportado' },
  { code: '4720', name: 'IVA soportado 21%' },
  { code: '4721', name: 'IVA soportado 10%' },
  { code: '4722', name: 'IVA soportado 4%' },
  { code: '473', name: 'Hacienda Pública, retenciones y pagos a cuenta' },
  { code: '4730', name: 'Retenciones IRPF practicadas' },
  { code: '474', name: 'Activos por impuesto diferido' },
  { code: '475', name: 'Hacienda Pública, acreedora por conceptos fiscales' },
  { code: '4750', name: 'Hacienda Pública, acreedora por IVA' },
  { code: '4751', name: 'Hacienda Pública, acreedora por retenciones' },
  { code: '4752', name: 'Hacienda Pública, acreedora por impuesto sociedades' },
  { code: '476', name: 'Organismos de la Seguridad Social, acreedores' },
  { code: '477', name: 'Hacienda Pública, IVA repercutido' },
  { code: '4770', name: 'IVA repercutido 21%' },
  { code: '4771', name: 'IVA repercutido 10%' },
  { code: '4772', name: 'IVA repercutido 4%' },
  { code: '479', name: 'Pasivos por diferencias temporarias imponibles' },

  // ===================================================================
  // GRUPO 5 - CUENTAS FINANCIERAS
  // ===================================================================

  { code: '550', name: 'Titular de la explotación' },
  { code: '551', name: 'Cuenta corriente con socios y administradores' },
  { code: '554', name: 'Cuenta corriente con uniones temporales de empresas y comunidades de bienes' },
  { code: '557', name: 'Dividendo activo a cuenta' },
  { code: '570', name: 'Caja, euros' },
  { code: '571', name: 'Caja, moneda extranjera' },
  { code: '572', name: 'Bancos e instituciones de crédito c/c vista, euros' },
  { code: '573', name: 'Bancos e instituciones de crédito c/c vista, moneda extranjera' },
  { code: '574', name: 'Bancos e instituciones de crédito, cuentas de ahorro, euros' },
  { code: '575', name: 'Bancos e instituciones de crédito, cuentas de ahorro, moneda extranjera' },
];

// ============================================================================
// ACCOUNTING ENTRY HELPERS — DEBT-011
// These helpers are centralised here so all consumers share a single
// implementation and tests only need to cover one location.
// ============================================================================

import type { AccountingEntry } from '../types';
import { getEntryLines } from '../types';

/**
 * Returns true if the entry contains at least one treasury/bank account line.
 */
export const entryHasBankLine = (entry: AccountingEntry): boolean => {
  const lines = getEntryLines(entry);
  return lines.some(line => isTreasuryAccount(line.accountCode));
};

/**
 * Returns the net bank movement amount from the entry.
 * Debit on a bank account → positive (money in).
 * Credit on a bank account → negative (money out).
 * CONC-002: suma todas las líneas 57x (no solo la primera).
 *
 * @param entry - Asiento contable
 * @returns Importe neto de tesorería
 * @example
 * getBankLineAmount(entryWithTwoBankLines); // debit572 - credit573
 */
export const getBankLineAmount = (entry: AccountingEntry): number => {
  const lines = getEntryLines(entry);
  let total = 0;
  let found = false;
  for (const line of lines) {
    if (isTreasuryAccount(line.accountCode)) {
      found = true;
      total += line.debit > 0 ? line.debit : -line.credit;
    }
  }
  return found ? total : 0;
};

/**
 * Returns the first treasury account code found in the entry, or empty string.
 */
export const getBankAccountCode = (entry: AccountingEntry): string => {
  const lines = getEntryLines(entry);
  for (const line of lines) {
    if (isTreasuryAccount(line.accountCode)) return line.accountCode;
  }
  return '';
};
