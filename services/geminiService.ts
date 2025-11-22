
import { GoogleGenAI, Type } from "@google/genai";
import readXlsxFile from 'read-excel-file';
import { ACCOUNT_PLAN } from '../utils/accountingPlan';
import { Supplier, BankTransaction } from '../types';

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const analyzeInvoiceImage = async (
  base64Data: string,
  mimeType: string,
  existingSuppliers: Supplier[] = []
): Promise<any> => {
  try {
    const model = 'gemini-2.5-flash';

    // Crear lista de cuentas contables para el prompt
    const accountsList = ACCOUNT_PLAN.map(acc => `${acc.code} - ${acc.name}`).join('\n      ');

    // Crear lista de proveedores existentes para el prompt
    const suppliersList = existingSuppliers.length > 0
      ? existingSuppliers.map(s => `${s.name} (${s.nifType}: ${s.nif})`).join('\n      ')
      : 'No hay proveedores registrados aún';

    const prompt = `
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

      Campos a extraer:
      - number (string)
      - date (YYYY-MM-DD)
      - issuerName (string) - Nombre o razón social del emisor
      - issuerNif (string) - LIMPIO SIN SEPARADORES
      - issuerNifType (string) - Enum: 'NIF', 'CIF', 'VAT', 'PASSPORT', 'OTHER'
      - issuerAddress (string | null) - Domicilio fiscal completo del emisor (calle, número, piso, etc.). Extrae toda la dirección visible en el documento.
      - issuerCity (string | null) - Ciudad/localidad del emisor
      - issuerPostalCode (string | null) - Código postal del emisor
      - issuerCountry (string | null) - País del emisor (si no es España, indica el país)
      - matchedSupplierId (string | null) - Nombre del proveedor que coincide, o null
      - baseAmount (number)
      - vatRate (number, ej: 21)
      - vatAmount (number)
      - totalAmount (number)
      - type ('EXPENSE' | 'INCOME')
      - suggestedAccountCode (string) - SOLO EL CÓDIGO (ej: "628")
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Data } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            number: { type: Type.STRING },
            date: { type: Type.STRING },
            issuerName: { type: Type.STRING },
            issuerNif: { type: Type.STRING },
            issuerNifType: { type: Type.STRING },
            issuerAddress: { type: Type.STRING, nullable: true, description: "Domicilio fiscal del emisor" },
            issuerCity: { type: Type.STRING, nullable: true, description: "Ciudad del emisor" },
            issuerPostalCode: { type: Type.STRING, nullable: true, description: "Código postal del emisor" },
            issuerCountry: { type: Type.STRING, nullable: true, description: "País del emisor" },
            matchedSupplierId: { type: Type.STRING, nullable: true, description: "Nombre del proveedor existente que coincide, o null" },
            baseAmount: { type: Type.NUMBER },
            vatRate: { type: Type.NUMBER },
            vatAmount: { type: Type.NUMBER },
            totalAmount: { type: Type.NUMBER },
            type: { type: Type.STRING, enum: ['EXPENSE', 'INCOME'] },
            suggestedAccountCode: { type: Type.STRING, description: "Código cuenta contable PGC sugerido (ej: 628)" }
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    return JSON.parse(text);

  } catch (error) {
    console.error("Error parsing invoice:", error);
    throw error;
  }
};

// NEW: Bank Statement Parser
export const analyzeBankStatement = async (base64Data: string, mimeType: string): Promise<any[]> => {
  try {
    const model = 'gemini-2.5-flash';
    
    const prompt = `
      Analiza este Extracto Bancario (PDF o Imagen), probablemente de BBVA Empresas o similar.
      
      Tu objetivo es extraer la lista de movimientos (transacciones) fila por fila.
      Ignora cabeceras, pies de página y saldos iniciales/finales si no son movimientos.
      
      Devuelve un ARRAY de objetos JSON.
      
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

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Data } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING },
              concept: { type: Type.STRING },
              amount: { type: Type.NUMBER }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    return JSON.parse(text);

  } catch (error) {
    console.error("Error parsing bank statement:", error);
    throw error;
  }
};

// Helper function to parse dates from various formats
const parseDateValue = (value: any): string => {
  if (!value) return '';

  // Handle Date objects (read-excel-file returns actual Date objects for date cells)
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const dateStr = String(value).trim();

  // DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Excel serial date number (days since 1899-12-30)
  if (!isNaN(Number(dateStr))) {
    const serial = Number(dateStr);
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return '';
};

// NEW: Parse XLSX Bank Statement (without AI)
export const parseXlsxBankStatement = async (base64Data: string): Promise<Omit<BankTransaction, 'id' | 'status'>[]> => {
  try {
    // Decode base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create a Blob for read-excel-file
    const blob = new Blob([bytes.buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    // read-excel-file returns rows as arrays of cell values
    // It automatically handles dates, numbers, and strings
    const rows = await readXlsxFile(blob);

    if (!rows || rows.length < 2) {
      throw new Error("El archivo XLSX no contiene suficientes datos");
    }

    // Convert to our expected format
    const rawData: any[][] = rows.map(row => [...row]);

    // Find header row (look for keywords in first 10 rows)
    let headerRowIndex = 0;
    const dateKeywords = ['fecha', 'date', 'f.valor', 'f. valor', 'f.operación', 'f. operación'];
    const conceptKeywords = ['concepto', 'descripción', 'descripcion', 'concept', 'movimiento', 'detalle'];
    const amountKeywords = ['importe', 'amount', 'cantidad', 'cargo', 'abono', 'débito', 'crédito', 'debito', 'credito', 'monto'];

    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      const row = rawData[i];
      if (!row || !Array.isArray(row)) continue;

      const rowLower = row.map((cell: any) => String(cell || '').toLowerCase().trim());
      const hasDate = rowLower.some((cell: string) => dateKeywords.some(k => cell.includes(k)));
      const hasConcept = rowLower.some((cell: string) => conceptKeywords.some(k => cell.includes(k)));
      const hasAmount = rowLower.some((cell: string) => amountKeywords.some(k => cell.includes(k)));

      if (hasDate && (hasConcept || hasAmount)) {
        headerRowIndex = i;
        break;
      }
    }

    const headers = rawData[headerRowIndex].map((h: any) => String(h || '').toLowerCase().trim());

    // Find column indices
    const findColumnIndex = (keywords: string[]): number => {
      for (const keyword of keywords) {
        const idx = headers.findIndex((h: string) => h.includes(keyword));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const dateCol = findColumnIndex(dateKeywords);
    const conceptCol = findColumnIndex(conceptKeywords);
    const amountCol = findColumnIndex(amountKeywords);

    // Also check for separate debit/credit columns
    const debitCol = findColumnIndex(['cargo', 'débito', 'debito', 'debe']);
    const creditCol = findColumnIndex(['abono', 'crédito', 'credito', 'haber']);

    if (dateCol === -1) {
      throw new Error("No se encontró columna de fecha en el archivo XLSX");
    }

    // Parse data rows
    const transactions: Omit<BankTransaction, 'id' | 'status'>[] = [];

    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || !Array.isArray(row)) continue;

      // Skip empty rows
      if (row.every((cell: any) => !cell || String(cell).trim() === '')) continue;

      const rawDate = row[dateCol];
      const concept = conceptCol !== -1 ? String(row[conceptCol] || '').trim() : '';

      // Parse date using helper function
      const date = parseDateValue(rawDate);

      // Skip rows without valid date
      if (!date) continue;

      // Parse amount
      let amount = 0;
      if (amountCol !== -1 && row[amountCol] !== undefined && row[amountCol] !== '') {
        // Single amount column
        const rawAmount = String(row[amountCol]).replace(/[^\d,.\-]/g, '').replace(',', '.');
        amount = parseFloat(rawAmount) || 0;
      } else if (debitCol !== -1 || creditCol !== -1) {
        // Separate debit/credit columns
        const debit = debitCol !== -1 ? parseFloat(String(row[debitCol] || 0).replace(/[^\d,.\-]/g, '').replace(',', '.')) || 0 : 0;
        const credit = creditCol !== -1 ? parseFloat(String(row[creditCol] || 0).replace(/[^\d,.\-]/g, '').replace(',', '.')) || 0 : 0;

        // Debit is negative (expense), Credit is positive (income)
        if (debit > 0) {
          amount = -Math.abs(debit);
        } else if (credit > 0) {
          amount = Math.abs(credit);
        }
      }

      // Skip rows with 0 amount (might be balance rows or headers)
      if (amount === 0) continue;

      transactions.push({
        date,
        concept: concept || 'Sin concepto',
        amount
      });
    }

    if (transactions.length === 0) {
      throw new Error("No se encontraron transacciones válidas en el archivo XLSX");
    }

    return transactions;

  } catch (error) {
    console.error("Error parsing XLSX bank statement:", error);
    throw error;
  }
};
