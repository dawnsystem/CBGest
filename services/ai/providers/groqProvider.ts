/**
 * @fileoverview Adapter Groq (Llama 4 Scout vision) — OpenAI-compatible.
 */

import type { Supplier } from '../../../types';
import { AiProviderError } from '../errors';
import { getGroqApiKey } from '../envKeys';
import { completeVisionJson } from '../openaiCompatible';
import { buildBankStatementPrompt, buildInvoicePrompt } from '../prompts';
import type { AiDocumentProvider } from '../provider';
import type { CbIssuerContext } from '../cbIssuerContext';
import type { BankTransactionAiResponse, InvoiceAiResponse } from '../types';
import { AI_PROVIDER_LABELS } from '../types';
import { unwrapBankTransactions } from '../unwrapBankTransactions';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const INVOICE_PDF_PAGES = 3;
const BANK_PDF_PAGES = 8;

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
    existingSuppliers: Supplier[] = [],
    cbIssuer: CbIssuerContext | null = null
  ): Promise<InvoiceAiResponse> {
    const apiKey = getGroqApiKey();
    if (!apiKey) {
      throw new AiProviderError(
        'groq',
        'AUTH',
        'API Key de Groq no configurada. Define VITE_GROQ_API_KEY en tu entorno.'
      );
    }

    return completeVisionJson<InvoiceAiResponse>(
      {
        providerId: 'groq',
        apiKey,
        endpoint: GROQ_ENDPOINT,
        model: GROQ_MODEL,
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

    const parsed = await completeVisionJson<unknown>(
      {
        providerId: 'groq',
        apiKey,
        endpoint: GROQ_ENDPOINT,
        model: GROQ_MODEL,
      },
      prompt,
      base64Data,
      mimeType,
      BANK_PDF_PAGES
    );

    return unwrapBankTransactions(parsed, 'groq');
  },
};
