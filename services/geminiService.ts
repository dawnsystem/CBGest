import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini client
// Note: Ensure process.env.API_KEY is available in the environment
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const analyzeInvoiceImage = async (base64Data: string, mimeType: string): Promise<any> => {
  try {
    const model = 'gemini-2.5-flash';
    
    const prompt = `
      Analiza este documento (factura o ticket).
      Eres un contable experto en normativa española para Comunidades de Bienes.
      
      Instrucciones:
      1. Si es un PDF multipágina, busca la información principal de la factura (totales, emisor).
      2. Extrae los siguientes datos en formato JSON estricto.
      3. Valida que la fecha tenga sentido (no futuro).
      
      Campos a extraer:
      - number (número de factura, string)
      - date (fecha formato YYYY-MM-DD, string)
      - issuerName (nombre del emisor, string)
      - issuerNif (NIF/CIF del emisor, string)
      - baseAmount (base imponible, number)
      - vatRate (tipo de IVA más alto encontrado 4, 10, o 21, number)
      - vatAmount (cuota de IVA, number)
      - totalAmount (total factura, number)
      - type (siempre devuelve 'EXPENSE' si parece una compra, o 'INCOME' si es una venta)
      
      Si algún campo no es visible, intenta deducirlo o déjalo en blanco/0.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType, // Supports 'image/...' and 'application/pdf'
              data: base64Data
            }
          },
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
            type: { type: Type.STRING, enum: ['EXPENSE', 'INCOME'] }
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    return JSON.parse(text);

  } catch (error) {
    console.error("Error parsing document with Gemini:", error);
    throw error;
  }
};