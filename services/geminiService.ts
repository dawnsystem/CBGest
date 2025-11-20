
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const analyzeInvoiceImage = async (base64Data: string, mimeType: string): Promise<any> => {
  try {
    const model = 'gemini-2.5-flash';
    
    const prompt = `
      Analiza este documento (factura o ticket).
      Eres un contable experto en normativa española (Plan General Contable) y europea.
      
      Instrucciones CRÍTICAS de Limpieza de Datos:
      1. **NIF/CIF/VAT**: Extrae el identificador fiscal del emisor.
         - ELIMINA cualquier carácter que no sea letra o número (guiones, espacios, puntos, barras).
         - Ejemplo: "B-12345678" -> "B12345678". "ES B 12345678" -> "ESB12345678".
         - Estandariza a mayúsculas.
      2. **Tipo de Documento**: Identifica si es un NIF (Persona física ES), CIF (Empresa ES), VAT (Intracomunitario), PASAPORTE o OTRO.
      3. **Cuenta Contable**: Sugiere el código PGC (Grupo 6 o 7).

      Instrucciones Generales:
      1. Extrae los datos fiscales.
      2. Valida que la fecha tenga sentido.
      
      Campos a extraer:
      - number (string)
      - date (YYYY-MM-DD)
      - issuerName (string)
      - issuerNif (string) - LIMPIO SIN SEPARADORES
      - issuerNifType (string) - Enum: 'NIF', 'CIF', 'VAT', 'PASSPORT', 'OTHER'
      - baseAmount (number)
      - vatRate (number, ej: 21)
      - vatAmount (number)
      - totalAmount (number)
      - type ('EXPENSE' | 'INCOME')
      - suggestedAccountCode (string, ej: "628")
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
