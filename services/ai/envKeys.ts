/**
 * @fileoverview Lectura de API keys de proveedores IA (Vite / process.env).
 */

/**
 * Obtiene la API key de Gemini (patrón histórico SEC-001 / SEC-002).
 *
 * @returns Key o string vacío
 */
export function getGeminiApiKey(): string {
  return (
    process.env.API_KEY ||
    process.env.GEMINI_API_KEY ||
    (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_GEMINI_API_KEY : undefined) ||
    ''
  ).trim();
}

/**
 * Obtiene la API key de Groq.
 *
 * @returns Key o string vacío
 */
export function getGroqApiKey(): string {
  return (
    process.env.GROQ_API_KEY ||
    (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_GROQ_API_KEY : undefined) ||
    ''
  ).trim();
}

/**
 * Obtiene la API key de OpenRouter.
 *
 * @returns Key o string vacío
 */
export function getOpenRouterApiKey(): string {
  return (
    process.env.OPENROUTER_API_KEY ||
    (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_OPENROUTER_API_KEY : undefined) ||
    ''
  ).trim();
}

/**
 * Indica si hay al menos una key de IA configurada.
 *
 * @returns true si Gemini, Groq u OpenRouter tienen key
 */
export function hasAnyAiApiKey(): boolean {
  return Boolean(getGeminiApiKey() || getGroqApiKey() || getOpenRouterApiKey());
}
