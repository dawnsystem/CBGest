/**
 * @fileoverview Adapter OpenRouter (modelos :free con visión).
 */

import type { Supplier } from '../../../types';
import { AiProviderError } from '../errors';
import { getOpenRouterApiKey } from '../envKeys';
import { completeVisionJsonWithModelFallback } from '../openaiCompatible';
import { buildBankStatementPrompt, buildInvoicePrompt } from '../prompts';
import type { AiDocumentProvider } from '../provider';
import type { CbIssuerContext } from '../cbIssuerContext';
import type { BankTransactionAiResponse, InvoiceAiResponse } from '../types';
import { AI_PROVIDER_LABELS } from '../types';
import { unwrapBankTransactions } from '../unwrapBankTransactions';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Modelos free con visión verificados (orden de preferencia).
 * El slug antiguo qwen2.5-vl:free dejó de estar en capa free.
 */
const OPENROUTER_FREE_VL_MODELS = [
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
  'openrouter/free',
] as const;

const INVOICE_PDF_PAGES = 3;
const BANK_PDF_PAGES = 8;

/**
 * Resuelve la lista de modelos OpenRouter (env opcional como primero).
 *
 * @returns Model ids a probar
 */
function getOpenRouterModels(): string[] {
  const fromEnv =
    process.env.OPENROUTER_MODEL ||
    (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_OPENROUTER_MODEL : undefined);
  const preferred = (fromEnv || '').trim();
  if (!preferred) {
    return [...OPENROUTER_FREE_VL_MODELS];
  }
  return [preferred, ...OPENROUTER_FREE_VL_MODELS.filter((m) => m !== preferred)];
}

/**
 * Proveedor OpenRouter (capa free multimodal).
 */
export const openrouterProvider: AiDocumentProvider = {
  id: 'openrouter',
  displayName: AI_PROVIDER_LABELS.openrouter,
  supportsPdfNative: false,

  isConfigured(): boolean {
    return Boolean(getOpenRouterApiKey());
  },

  async analyzeInvoice(
    base64Data: string,
    mimeType: string,
    existingSuppliers: Supplier[] = [],
    cbIssuer: CbIssuerContext | null = null
  ): Promise<InvoiceAiResponse> {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      throw new AiProviderError(
        'openrouter',
        'AUTH',
        'API Key de OpenRouter no configurada. Define VITE_OPENROUTER_API_KEY en tu entorno.'
      );
    }

    return completeVisionJsonWithModelFallback<InvoiceAiResponse>(
      {
        providerId: 'openrouter',
        apiKey,
        endpoint: OPENROUTER_ENDPOINT,
        extraHeaders: {
          'HTTP-Referer': 'https://cbgest.local',
          'X-Title': 'CBGest',
        },
      },
      getOpenRouterModels(),
      buildInvoicePrompt(existingSuppliers, cbIssuer),
      base64Data,
      mimeType,
      INVOICE_PDF_PAGES
    );
  },

  async analyzeBankStatement(
    base64Data: string,
    mimeType: string
  ): Promise<BankTransactionAiResponse[]> {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      throw new AiProviderError(
        'openrouter',
        'AUTH',
        'API Key de OpenRouter no configurada. Define VITE_OPENROUTER_API_KEY en tu entorno.'
      );
    }

    const prompt = `${buildBankStatementPrompt()}

IMPORTANTE: Si debes devolver un objeto (no un array raíz), usa la forma:
{ "transactions": [ ...movimientos... ] }
`;

    const parsed = await completeVisionJsonWithModelFallback<unknown>(
      {
        providerId: 'openrouter',
        apiKey,
        endpoint: OPENROUTER_ENDPOINT,
        extraHeaders: {
          'HTTP-Referer': 'https://cbgest.local',
          'X-Title': 'CBGest',
        },
      },
      getOpenRouterModels(),
      prompt,
      base64Data,
      mimeType,
      BANK_PDF_PAGES
    );

    return unwrapBankTransactions(parsed, 'openrouter');
  },
};
