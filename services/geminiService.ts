import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const analyzeInvoiceImage = async (base64Data: string, mimeType: string): Promise<any> => {
  try {
    const model = 'gemini-2.5-flash';
    
    const prompt = `
      Analiza este documento (factura o ticket).
      Eres un contable experto en normativa española (Plan General Contable).
      
      Instrucciones:
      1. Extrae los datos fiscales.
      2. Valida que la fecha tenga sentido.
      3. CRÍTICO: Basándote en el concepto y el emisor, sugiere el código de cuenta contable (Grupo 6 o 7) más apropiado según el PGC.
         Ejemplos:
         - Iberdrola/Endesa -> 628 (Suministros)
         - Leroy Merlin/Reparación -> 622 (Reparaciones)
         - Gestoría/Abogado -> 623 (Profesionales)
         - Seguro -> 625 (Primas de seguros)
         - Comisiones Booking/Airbnb -> 629 (Otros servicios)
         - Ingreso Alquiler -> 705 (Prestación de servicios)
      
      Campos a extraer:
      - number (string)
      - date (YYYY-MM-DD)
      - issuerName (string)
      - issuerNif (string)
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