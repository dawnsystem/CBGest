/**
 * @fileoverview Coordenadas de campos en plantilla PDF oficial Modelo 184 (puntos PDF, origen abajo-izq).
 * Calibradas contra `APARTAMENTOS_GRACIA_CB` (presentación AEAT ejercicio 2025).
 */

export interface PdfPoint {
  x: number;
  y: number;
}

export interface PdfRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Zonas a blanquear por página (índice 0 = hoja resumen, 1 = rentas, 2 = socios). */
export const BLANK_RECTS: PdfRect[][] = [
  // Página hoja-resumen (pág. 2 del justificante AEAT)
  [
    { x: 508, y: 688, w: 35, h: 12 }, // ejercicio
    { x: 48, y: 674, w: 60, h: 12 }, // NIF
    { x: 148, y: 658, w: 160, h: 12 }, // denominación
    { x: 48, y: 502, w: 60, h: 12 }, // NIF representante
    { x: 120, y: 484, w: 130, h: 12 }, // nombre representante
    { x: 58, y: 570, w: 55, h: 12 }, // teléfono
    { x: 90, y: 587, w: 170, h: 12 }, // persona contacto / razón social representante
    { x: 548, y: 128, w: 20, h: 12 }, // num registros socios
    { x: 548, y: 108, w: 20, h: 12 }, // num registros entidad (alt)
    { x: 160, y: 408, w: 20, h: 12 }, // tipo entidad
    { x: 160, y: 392, w: 20, h: 12 }, // actividad
    { x: 375, y: 302, w: 55, h: 12 }, // cifra negocios
    { x: 548, y: 148, w: 20, h: 12 }, // num socios (pos alt)
  ],
  // Página rentas entidad
  [
    { x: 28, y: 712, w: 55, h: 12 },
    { x: 138, y: 712, w: 160, h: 12 },
    { x: 440, y: 712, w: 30, h: 12 },
    // Renta 1 (bloque superior)
    { x: 32, y: 656, w: 55, h: 80 },
    { x: 80, y: 448, w: 60, h: 200 },
    { x: 265, y: 425, w: 120, h: 15 },
    { x: 500, y: 425, w: 45, h: 15 },
    { x: 500, y: 490, w: 55, h: 120 },
    // Renta 2 (bloque inferior) — mismo layout desplazado
    { x: 32, y: 360, w: 55, h: 80 },
    { x: 80, y: 152, w: 60, h: 200 },
    { x: 265, y: 129, w: 120, h: 15 },
    { x: 500, y: 129, w: 45, h: 15 },
    { x: 500, y: 194, w: 55, h: 120 },
  ],
  // Página socios (3 bloques)
  [
    { x: 18, y: 740, w: 55, h: 12 },
    { x: 132, y: 740, w: 30, h: 12 },
    // Socio 1
    { x: 20, y: 560, w: 520, h: 150 },
    // Socio 2
    { x: 20, y: 350, w: 520, h: 150 },
    // Socio 3
    { x: 20, y: 140, w: 520, h: 150 },
  ],
];

/** Hoja resumen — campos de datos. */
export const HOJA_RESUMEN_FIELDS = {
  ejercicio: { x: 516, y: 693.2 },
  nif: { x: 52.5, y: 679 },
  denominacion: { x: 154.2, y: 662.8 },
  telefono: { x: 64, y: 575.5 },
  representanteNombre: { x: 96.4, y: 592.7 },
  contactoNif: { x: 51.7, y: 507 },
  contactoNombre: { x: 128, y: 488.8 },
  numRegistrosSocios: { x: 555.6, y: 134.6 },
  numRegistrosEntidad: { x: 555.6, y: 134.6 }, // misma fila visual en borrador
  tipoEntidad: { x: 169.1, y: 413.7 },
  actividadPrincipal: { x: 169.6, y: 397.1 },
  cifraNegocios: { x: 384.1, y: 307.1 },
} as const;

/** Bloque renta entidad (coordenadas bloque superior = Renta 1 en formulario). */
export const RENTA_ENTIDAD_BLOCK = {
  headerNif: { x: 33.4, y: 718 },
  headerEjercicio: { x: 446.4, y: 718 },
  headerDenominacion: { x: 143.9, y: 718.9 },
  clave: { x: 37, y: 662.8 },
  subclave: { x: 74.7, y: 662.8 },
  ingresos: { x: 427.2, y: 637.7 },
  gastos: { x: 85.6, y: 611.4 },
  rentaAtribuible: { x: 85.5, y: 454.6 },
  situacionInmueble: { x: 231.7, y: 432.1 },
  cadastralRef: { x: 272.4, y: 431.3 },
  diasArrendamiento: { x: 524, y: 431.3 },
  interesesFinanciacion: { x: 512.6, y: 598.7 },
  conservacionReparacion: { x: 520.1, y: 573.5 },
  tributosRecargos: { x: 520.1, y: 536 },
  cantidadesTerceros: { x: 512.6, y: 523.9 },
  amortizacionInmueble: { x: 507.6, y: 499.1 },
} as const;

/** Desplazamiento Y entre bloques Renta 1 y Renta 2 en la misma página. */
export const RENTA_BLOCK_Y_OFFSET = 293.4;

/** Bloque socio — slot superior (índice 0). */
export const SOCIO_BLOCK = {
  nif: { x: 25.4, y: 698.5 },
  nombre: { x: 247.9, y: 697.6 },
  provinciaCode: { x: 27.7, y: 670.1 },
  tipoParticipe: { x: 113.5, y: 670.1 },
  miembroX: { x: 381.2, y: 670.1 },
  diasMiembro: { x: 188, y: 652.5 },
  participacion: { x: 322.4, y: 651.8 },
  clave: { x: 26.3, y: 626.7 },
  importe: { x: 167, y: 626.7 },
  domicilio: { x: 25.4, y: 600 },
  situacionInmueble: { x: 409.9, y: 600.9 },
  naturalezaInmueble: { x: 459.5, y: 600 },
  cadastralRef: { x: 25.6, y: 572.3 },
  claveTitularidad: { x: 243.2, y: 572.7 },
  porcentajeTitularidad: { x: 347, y: 572.7 },
  diasArrendamiento: { x: 445.6, y: 572.7 },
} as const;

/** Desplazamiento Y entre bloques socio (3 por página). */
export const SOCIO_BLOCK_Y_OFFSET = 208.8;

export const SOCIO_PAGE_HEADER = {
  nifEntidad: { x: 22.8, y: 745.5 },
  ejercicio: { x: 138.3, y: 745.5 },
} as const;

export const PDF_FONT_SIZE = {
  default: 9,
  small: 8,
  amount: 9,
} as const;
