/**
 * @fileoverview API pública del módulo multi-IA documental.
 */

export {
  analyzeBankStatementWithRouter,
  analyzeInvoiceWithRouter,
  getAiProviderAvailability,
  listAiProviders,
} from './aiRouter';
export { AiProviderError, isFailoverableError, classifyHttpError } from './errors';
export {
  getGeminiApiKey,
  getGroqApiKey,
  getOpenRouterApiKey,
  hasAnyAiApiKey,
} from './envKeys';
export {
  DEFAULT_EXPENSE_ACCOUNT,
  DEFAULT_RENTAL_INCOME_ACCOUNT,
  looksLikeClearCbExpense,
  looksLikePlatformCommission,
  looksLikeRentalIncome,
  normalizeInvoiceAiResponse,
} from './normalizeInvoiceResponse';
export {
  cbIssuerFromSettings,
  isIssuerOwnCb,
  namesLikelyMatch,
  normalizeComparableName,
  normalizeFiscalId,
} from './cbIssuerContext';
export type { CbIssuerContext } from './cbIssuerContext';
export { resolveProviderOrder } from './resolveProviderOrder';
export type {
  AiAnalysisMeta,
  AiConfig,
  AiPreferredProvider,
  AiProviderId,
  BankStatementAnalysisResult,
  BankTransactionAiResponse,
  InvoiceAiResponse,
  InvoiceAnalysisResult,
} from './types';
export {
  AI_PROVIDER_LABELS,
  DEFAULT_AI_CONFIG,
  DEFAULT_PROVIDER_ORDER,
} from './types';
