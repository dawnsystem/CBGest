/**
 * @fileoverview Adapter Gemini (google/genai) para análisis documental.
 */

import { GoogleGenAI, Type } from '@google/genai';
import type { Supplier } from '../../../types';
import { AiProviderError, getErrorDetails, toProviderError } from '../errors';
import { getGeminiApiKey } from '../envKeys';
import { parseModelJson } from '../parseJson';
import { buildBankStatementPrompt, buildInvoicePrompt } from '../prompts';
import type { AiDocumentProvider } from '../provider';
import type { BankTransactionAiResponse, InvoiceAiResponse } from '../types';
import { AI_PROVIDER_LABELS } from '../types';

const MODEL_NAME = 'gemini-2.5-flash';

/**
 * Cliente Gemini lazy (SEC-002): nueva instancia por invocación.
 *
 * @returns GoogleGenAI
 * @throws AiProviderError AUTH si falta key
 */
function getAiClient(): GoogleGenAI {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new AiProviderError(
      'gemini',
      'AUTH',
      'API Key de Gemini no configurada. Define VITE_GEMINI_API_KEY en tu entorno.'
    );
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Proveedor Gemini con structured output nativo y PDF inline.
 */
export const geminiProvider: AiDocumentProvider = {
  id: 'gemini',
  displayName: AI_PROVIDER_LABELS.gemini,
  supportsPdfNative: true,

  isConfigured(): boolean {
    return Boolean(getGeminiApiKey());
  },

  async analyzeInvoice(
    base64Data: string,
    mimeType: string,
    existingSuppliers: Supplier[] = []
  ): Promise<InvoiceAiResponse> {
    try {
      const prompt = buildInvoicePrompt(existingSuppliers);
      const response = await getAiClient().models.generateContent({
        model: MODEL_NAME,
        contents: {
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              number: { type: Type.STRING },
              date: { type: Type.STRING },
              issuerName: { type: Type.STRING },
              issuerNif: { type: Type.STRING },
              issuerNifType: { type: Type.STRING },
              issuerAddress: {
                type: Type.STRING,
                nullable: true,
                description: 'Domicilio fiscal del emisor',
              },
              issuerCity: {
                type: Type.STRING,
                nullable: true,
                description: 'Ciudad del emisor',
              },
              issuerPostalCode: {
                type: Type.STRING,
                nullable: true,
                description: 'Código postal del emisor',
              },
              issuerCountry: {
                type: Type.STRING,
                nullable: true,
                description: 'País del emisor',
              },
              matchedSupplierId: {
                type: Type.STRING,
                nullable: true,
                description: 'Nombre del proveedor existente que coincide, o null',
              },
              baseAmount: { type: Type.NUMBER },
              vatRate: { type: Type.NUMBER },
              vatAmount: { type: Type.NUMBER },
              totalAmount: { type: Type.NUMBER },
              type: { type: Type.STRING, enum: ['EXPENSE', 'INCOME'] },
              suggestedAccountCode: {
                type: Type.STRING,
                description: 'Código cuenta contable PGC sugerido (ej: 628)',
              },
            },
          },
        },
      });

      const text = response.text;
      if (!text) {
        throw new AiProviderError('gemini', 'PARSE', 'No response from Gemini');
      }
      return parseModelJson<InvoiceAiResponse>(text, 'gemini');
    } catch (error: unknown) {
      throw mapGeminiError(error, 'Error analizando factura con Gemini.');
    }
  },

  async analyzeBankStatement(
    base64Data: string,
    mimeType: string
  ): Promise<BankTransactionAiResponse[]> {
    try {
      const prompt = buildBankStatementPrompt();
      const response = await getAiClient().models.generateContent({
        model: MODEL_NAME,
        contents: {
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                concept: { type: Type.STRING },
                amount: { type: Type.NUMBER },
              },
            },
          },
        },
      });

      const text = response.text;
      if (!text) {
        throw new AiProviderError('gemini', 'PARSE', 'No response from Gemini');
      }
      return parseModelJson<BankTransactionAiResponse[]>(text, 'gemini');
    } catch (error: unknown) {
      throw mapGeminiError(error, 'Error analizando extracto con Gemini.');
    }
  },
};

/**
 * Mapea errores del SDK Gemini a AiProviderError con mensajes UX históricos.
 *
 * @param error - Error crudo
 * @param fallback - Mensaje fallback
 * @returns AiProviderError
 */
function mapGeminiError(error: unknown, fallback: string): AiProviderError {
  if (error instanceof AiProviderError) {
    return error;
  }
  const { message, status } = getErrorDetails(error);
  if (message?.includes('API key')) {
    return new AiProviderError(
      'gemini',
      'AUTH',
      'Error de autenticación: API Key inválida o no encontrada.',
      error
    );
  }
  if (status === 429 || message?.includes('quota')) {
    return new AiProviderError(
      'gemini',
      'QUOTA',
      'Cuota excedida: Has superado el límite de uso de la API de Gemini.',
      error
    );
  }
  if (status === 404 || message?.includes('not found')) {
    return new AiProviderError(
      'gemini',
      'MODEL_NOT_FOUND',
      `Modelo no encontrado: Asegúrate de tener acceso al modelo ${MODEL_NAME}.`,
      error
    );
  }
  return toProviderError('gemini', error, fallback);
}
