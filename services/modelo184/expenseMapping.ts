/**
 * @fileoverview Mapeo de categorías de gasto CBGest → casillas clave C del Modelo 184.
 */

import type { Modelo184GastosInmobiliario } from './types';

export type GastoCasillaKey = keyof Modelo184GastosInmobiliario;

const CATEGORY_RULES: Array<{ key: GastoCasillaKey; patterns: RegExp[] }> = [
  {
    key: 'interesesFinanciacion',
    patterns: [/interes/i, /hipoteca/i, /prestamo/i, /financiacion/i],
  },
  {
    key: 'conservacionReparacion',
    patterns: [/repar/i, /manten/i, /conserv/i, /fontaner/i, /electric/i],
  },
  {
    key: 'tributosRecargos',
    patterns: [/ibi/i, /impuesto.*bienes/i, /tasa/i, /tributo/i, /ieet/i],
  },
  {
    key: 'cantidadesTerceros',
    patterns: [/limpieza/i, /gestion/i, /administr/i, /porter/i, /community/i, /comunidad/i],
  },
  {
    key: 'primasSeguros',
    patterns: [/seguro/i],
  },
  {
    key: 'amortizacionInmueble',
    patterns: [/amortiz/i],
  },
  {
    key: 'amortizacionMuebles',
    patterns: [/mobiliario/i, /mueble/i],
  },
  {
    key: 'otrosGastos',
    patterns: [/suministro/i, /electricidad/i, /agua/i, /gas/i, /internet/i, /telefonia/i],
  },
];

/**
 * Crea un objeto de gastos inmobiliarios vacío.
 */
export function createEmptyGastosInmobiliario(): Modelo184GastosInmobiliario {
  return {
    interesesFinanciacion: 0,
    conservacionReparacion: 0,
    interesesPendientes: 0,
    tributosRecargos: 0,
    saldosDudosoCobro: 0,
    cantidadesTerceros: 0,
    primasSeguros: 0,
    amortizacionInmueble: 0,
    amortizacionMuebles: 0,
    otrosGastos: 0,
  };
}

/**
 * Clasifica un importe de gasto según su categoría contable.
 *
 * @param category - Categoría de la factura en CBGest.
 * @param amount - Importe deducible.
 * @returns Casilla destino del Modelo 184.
 */
export function classifyExpenseCategory(category: string | undefined, amount: number): {
  key: GastoCasillaKey;
  amount: number;
} {
  const normalized = (category || 'Otros').trim();
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return { key: rule.key, amount };
    }
  }
  return { key: 'otrosGastos', amount };
}

/**
 * Suma un gasto clasificado al detalle acumulado.
 */
export function addGastoToDetalle(
  detalle: Modelo184GastosInmobiliario,
  category: string | undefined,
  amount: number
): Modelo184GastosInmobiliario {
  const { key } = classifyExpenseCategory(category, amount);
  return {
    ...detalle,
    [key]: round2(detalle[key] + amount),
  };
}

/**
 * Total de un desglose de gastos inmobiliarios.
 */
export function totalGastosDetalle(detalle: Modelo184GastosInmobiliario): number {
  return round2(
    detalle.interesesFinanciacion
    + detalle.conservacionReparacion
    + detalle.interesesPendientes
    + detalle.tributosRecargos
    + detalle.saldosDudosoCobro
    + detalle.cantidadesTerceros
    + detalle.primasSeguros
    + detalle.amortizacionInmueble
    + detalle.amortizacionMuebles
    + detalle.otrosGastos
  );
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
