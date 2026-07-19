/**
 * @fileoverview Adapter OpenRouter (modelos :free con visión).
 */

import type { Supplier } from '../../../types';
import { AiProviderError } from '../errors';
import { getOpenRouterApiKey } from '../envKeys';
import { completeVisionJson } from '../openaiCompatible';
import { buildBankStatementPrompt, buildInvoicePrompt } from '../prompts';
import type { AiDocumentProvider } from '../provider';
import type { CbIssuerContext } from '../cbIssuerContext';
import type { BankTransactionAiResponse, InvoiceAiResponse } from '../types';
import { AI_PROVIDER_LABELS } from '../types';
import { unwrapBankTransactions } from '../unwrapBankTransactions';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
/** Modelo free con visión; ajustable vía env VITE_OPENROUTER_MODEL. */
const DEFAULT_OPENROUTER_MODEL = 'qwen/qwen2.5-vl-72b-instruct:free';
const INVOICE_PDF_PAGES = 3;
const BANK_PDF_PAGES = 8;

/**
 * Resuelve el modelo OpenRouter (env opcional).
 *
 * @returns Model id
 */
function getOpenRouterModel(): string {
  const fromEnv =
    process.env.OPENROUTER_MODEL ||
    (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_OPENROUTER_MODEL : undefined);
  return (fromEnv || DEFAULT_OPENROUTER_MODEL).trim();
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

    return completeVisionJson<InvoiceAiResponse>(
      {
        providerId: 'openrouter',
        apiKey,
        endpoint: OPENROUTER_ENDPOINT,
        model: getOpenRouterModel(),
        extraHeaders: {
          'HTTP-Referer': 'https://cbgest.local',
          'X-Title': 'CBGest',
        },
      },
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

    const parsed = await completeVisionJson<unknown>(
      {
        providerId: 'openrouter',
        apiKey,
        endpoint: OPENROUTER_ENDPOINT,
        model: getOpenRouterModel(),
        extraHeaders: {
          'HTTP-Referer': 'https://cbgest.local',
          'X-Title': 'CBGest',
        },
      },
      prompt,
      base64Data,
      mimeType,
      BANK_PDF_PAGES
    );

    return unwrapBankTransactions(parsed, 'openrouter');
  },
};
