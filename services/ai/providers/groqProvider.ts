/**
 * @fileoverview Adapter Groq (visión multimodal cuando el modelo esté disponible).
 *
 * Nota 2026-07: la cuenta free de Groq ya no lista Llama 4 Scout/Maverick.
 * Se prueban varios IDs históricos; si ninguno existe, el router pasa a OpenRouter.
 */

import type { Supplier } from '../../../types';
import { AiProviderError } from '../errors';
import { getGroqApiKey } from '../envKeys';
import { completeVisionJsonWithModelFallback } from '../openaiCompatible';
import { buildBankStatementPrompt, buildInvoicePrompt } from '../prompts';
import type { AiDocumentProvider } from '../provider';
import type { BankTransactionAiResponse, InvoiceAiResponse } from '../types';
import { AI_PROVIDER_LABELS } from '../types';
import { unwrapBankTransactions } from '../unwrapBankTransactions';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/** Candidatos vision (el primero disponible gana). Override con VITE_GROQ_MODEL. */
const GROQ_VISION_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.2-11b-vision-preview',
  'llama-3.2-90b-vision-preview',
] as const;

const INVOICE_PDF_PAGES = 3;
const BANK_PDF_PAGES = 8;

/**
 * Resuelve la lista de modelos Groq a probar.
 *
 * @returns Model ids
 */
function getGroqModels(): string[] {
  const fromEnv =
    process.env.GROQ_MODEL ||
    (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_GROQ_MODEL : undefined);
  const preferred = (fromEnv || '').trim();
  if (!preferred) {
    return [...GROQ_VISION_MODELS];
  }
  return [preferred, ...GROQ_VISION_MODELS.filter((m) => m !== preferred)];
}

/**
 * Proveedor Groq con visión multimodal (PDF convertido a imagen).
 */
export const groqProvider: AiDocumentProvider = {
  id: 'groq',
  displayName: AI_PROVIDER_LABELS.groq,
  supportsPdfNative: false,

  isConfigured(): boolean {
    return Boolean(getGroqApiKey());
  },

  async analyzeInvoice(
    base64Data: string,
    mimeType: string,
    existingSuppliers: Supplier[] = []
  ): Promise<InvoiceAiResponse> {
    const apiKey = getGroqApiKey();
    if (!apiKey) {
      throw new AiProviderError(
        'groq',
        'AUTH',
        'API Key de Groq no configurada. Define VITE_GROQ_API_KEY en tu entorno.'
      );
    }

    try {
      return await completeVisionJsonWithModelFallback<InvoiceAiResponse>(
        {
          providerId: 'groq',
          apiKey,
          endpoint: GROQ_ENDPOINT,
        },
        getGroqModels(),
        buildInvoicePrompt(existingSuppliers),
        base64Data,
        mimeType,
        INVOICE_PDF_PAGES
      );
    } catch (error: unknown) {
      if (error instanceof AiProviderError && error.code === 'MODEL_NOT_FOUND') {
        throw new AiProviderError(
          'groq',
          'MODEL_NOT_FOUND',
          'Groq no tiene modelos vision disponibles en esta cuenta ahora mismo (Llama 4 Scout/Maverick ausentes). Se usará otro proveedor.',
          error
        );
      }
      throw error;
    }
  },

  async analyzeBankStatement(
    base64Data: string,
    mimeType: string
  ): Promise<BankTransactionAiResponse[]> {
    const apiKey = getGroqApiKey();
    if (!apiKey) {
      throw new AiProviderError(
        'groq',
        'AUTH',
        'API Key de Groq no configurada. Define VITE_GROQ_API_KEY en tu entorno.'
      );
    }

    const prompt = `${buildBankStatementPrompt()}

IMPORTANTE: Si debes devolver un objeto (no un array raíz), usa la forma:
{ "transactions": [ ...movimientos... ] }
`;

    try {
      const parsed = await completeVisionJsonWithModelFallback<unknown>(
        {
          providerId: 'groq',
          apiKey,
          endpoint: GROQ_ENDPOINT,
        },
        getGroqModels(),
        prompt,
        base64Data,
        mimeType,
        BANK_PDF_PAGES
      );
      return unwrapBankTransactions(parsed, 'groq');
    } catch (error: unknown) {
      if (error instanceof AiProviderError && error.code === 'MODEL_NOT_FOUND') {
        throw new AiProviderError(
          'groq',
          'MODEL_NOT_FOUND',
          'Groq no tiene modelos vision disponibles en esta cuenta ahora mismo. Se usará otro proveedor.',
          error
        );
      }
      throw error;
    }
  },
};
