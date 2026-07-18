/**
 * @fileoverview Prompts compartidos para análisis de facturas y extractos.
 */

import { ACCOUNT_PLAN } from '../../utils/accountingPlan';
import type { Supplier } from '../../types';

/**
 * Construye el prompt de extracción de factura (contable ES + PGC).
 *
 * @param existingSuppliers - Proveedores registrados para matching
 * @returns Prompt en español
 * @example
 * const prompt = buildInvoicePrompt(suppliers);
 */
export function buildInvoicePrompt(existingSuppliers: Supplier[] = []): string {
  const accountsList = ACCOUNT_PLAN.map((acc) => `${acc.code} - ${acc.name}`).join('\n      ');
  const suppliersList =
    existingSuppliers.length > 0
      ? existingSuppliers.map((s) => `${s.name} (${s.nifType}: ${s.nif})`).join('\n      ')
      : 'No hay proveedores registrados aún';

  return `
      Analiza este documento (factura o ticket).
      Eres un contable experto en normativa española (Plan General Contable) y europea.

      **PROVEEDORES EXISTENTES EN LA BASE DE DATOS:**
      ${suppliersList}

      **IMPORTANTE SOBRE PROVEEDORES:**
      - Primero, verifica si el emisor de esta factura coincide con alguno de los proveedores listados arriba.
      - Busca coincidencias por nombre O por NIF/CIF (ignorando espacios y guiones).
      - Si encuentras una coincidencia, devuelve el campo "matchedSupplierId" con el nombre exacto del proveedor que coincide.
      - Si NO encuentras coincidencia, devuelve "matchedSupplierId" como null.
      - En cualquier caso, extrae los datos del emisor como "issuerName" e "issuerNif".

      Instrucciones CRÍTICAS de Limpieza de Datos:
      1. **NIF/CIF/VAT**: Extrae el identificador fiscal del emisor.
         - ELIMINA cualquier carácter que no sea letra o número (guiones, espacios, puntos, barras).
         - Ejemplo: "B-12345678" -> "B12345678". "ES B 12345678" -> "ESB12345678".
         - Estandariza a mayúsculas.
      2. **Tipo de Documento**: Identifica si es un NIF (Persona física ES), CIF (Empresa ES), VAT (Intracomunitario), PASAPORTE o OTRO.
      3. **Cuenta Contable**: DEBES seleccionar el código de cuenta más apropiado del Plan General Contable español.

      **PLAN CONTABLE DISPONIBLE** (selecciona el código más apropiado según el concepto de la factura):
      ${accountsList}

      **INSTRUCCIONES PARA ASIGNAR LA CUENTA CONTABLE:**
      - Si es una factura de GASTO (EXPENSE), usa cuentas del Grupo 6 (600-699).
      - Si es una factura de INGRESO (INCOME), usa cuentas del Grupo 7 (700-799).
      - Analiza el concepto del documento para elegir la cuenta más específica:
        * Facturas de alquiler pagado → 621
        * Reparaciones/mantenimiento → 622
        * Gestoría/abogados → 623
        * Seguros → 625
        * Comisiones bancarias → 626
        * Luz/agua/gas/internet → 628
        * Comisiones Booking/Airbnb → 629
        * IBI/basuras → 631
        * Ingresos por alquiler → 705
      - El código debe ser EXACTAMENTE uno de los listados arriba.

      Instrucciones Generales:
      1. Extrae los datos fiscales.
      2. Valida que la fecha tenga sentido.
      3. IMPORTANTE: Devuelve SOLO el código de cuenta (ej: "628"), NO incluyas el nombre.
      4. Responde ÚNICAMENTE con un objeto JSON válido (sin markdown ni texto extra).

      Campos a extraer (JSON object):
      - number (string)
      - date (YYYY-MM-DD)
      - issuerName (string)
      - issuerNif (string) - LIMPIO SIN SEPARADORES
      - issuerNifType (string) - Enum: 'NIF', 'CIF', 'VAT', 'PASSPORT', 'OTHER'
      - issuerAddress (string | null)
      - issuerCity (string | null)
      - issuerPostalCode (string | null)
      - issuerCountry (string | null)
      - matchedSupplierId (string | null)
      - baseAmount (number)
      - vatRate (number, ej: 21)
      - vatAmount (number)
      - totalAmount (number)
      - type ('EXPENSE' | 'INCOME')
      - suggestedAccountCode (string) - SOLO EL CÓDIGO (ej: "628")
    `;
}

/**
 * Construye el prompt de extracción de extracto bancario.
 *
 * @returns Prompt en español
 * @example
 * const prompt = buildBankStatementPrompt();
 */
export function buildBankStatementPrompt(): string {
  return `
      Analiza este Extracto Bancario (PDF o Imagen), probablemente de BBVA Empresas o similar.
      
      Tu objetivo es extraer la lista de movimientos (transacciones) fila por fila.
      Ignora cabeceras, pies de página y saldos iniciales/finales si no son movimientos.
      
      Devuelve ÚNICAMENTE un ARRAY JSON válido (sin markdown ni texto extra).
      
      Para cada fila detectada:
      - date: La fecha de operación (YYYY-MM-DD).
      - concept: La descripción o concepto del movimiento.
      - amount: El importe. IMPORTANTE: Si es un cargo/pago, debe ser NEGATIVO. Si es un abono/ingreso, POSITIVO.
      
      Ejemplo de salida esperado:
      [
        { "date": "2024-01-15", "concept": "RECIBO LUZ", "amount": -150.50 },
        { "date": "2024-01-16", "concept": "TRANSF. INQUILINO", "amount": 800.00 }
      ]
    `;
}
