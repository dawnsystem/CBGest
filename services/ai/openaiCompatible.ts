/**
 * @fileoverview Cliente genérico OpenAI-compatible (Groq / OpenRouter) para visión + JSON.
 */

import { AiProviderError, classifyHttpError, toProviderError } from './errors';
import { parseModelJson } from './parseJson';
import { prepareImageDataUrls } from './pdfToImages';
import type { AiProviderId } from './types';

export interface OpenAiCompatibleConfig {
  providerId: AiProviderId;
  apiKey: string;
  endpoint: string;
  model: string;
  /** Headers extra (p.ej. HTTP-Referer de OpenRouter). */
  extraHeaders?: Record<string, string>;
}

/**
 * Llama a un endpoint chat/completions con imágenes y espera JSON.
 *
 * @param config - Endpoint, modelo y key
 * @param prompt - Instrucciones de texto
 * @param base64Data - Documento en base64
 * @param mimeType - MIME del documento
 * @param maxPdfPages - Páginas máximas si es PDF
 * @returns Texto de contenido del assistant
 * @throws AiProviderError
 */
export async function callVisionJsonCompletion(
  config: OpenAiCompatibleConfig,
  prompt: string,
  base64Data: string,
  mimeType: string,
  maxPdfPages: number
): Promise<string> {
  const imageUrls = await prepareImageDataUrls(
    base64Data,
    mimeType,
    config.providerId,
    maxPdfPages
  );

  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [{ type: 'text', text: prompt }];

  for (const url of imageUrls) {
    content.push({ type: 'image_url', image_url: { url } });
  }

  const messages = [
    {
      role: 'system',
      content:
        'Eres un extractor de datos fiscales. Responde únicamente con JSON válido según las instrucciones del usuario.',
    },
    { role: 'user', content },
  ];

  const baseBody = {
    model: config.model,
    temperature: 0,
    messages,
  };

  let response = await postChatCompletion(config, {
    ...baseBody,
    response_format: { type: 'json_object' },
  });

  // Algunos modelos free no soportan response_format → reintento sin él.
  if (!response.ok && response.status === 400) {
    const bodyText = await safeReadText(response);
    if (/response_format|json_object|not supported/i.test(bodyText)) {
      response = await postChatCompletion(config, baseBody);
    } else {
      throw httpError(config.providerId, response.status, bodyText);
    }
  }

  if (!response.ok) {
    const bodyText = await safeReadText(response);
    throw httpError(config.providerId, response.status, bodyText);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error: unknown) {
    throw new AiProviderError(
      config.providerId,
      'PARSE',
      'Respuesta HTTP no es JSON válido.',
      error
    );
  }

  const contentText = extractAssistantText(payload);
  if (!contentText) {
    throw new AiProviderError(
      config.providerId,
      'PARSE',
      'El modelo no devolvió contenido de texto.'
    );
  }

  return contentText;
}

/**
 * POST a chat/completions.
 *
 * @param config - Config del proveedor
 * @param body - Body JSON
 * @returns Response fetch
 */
async function postChatCompletion(
  config: OpenAiCompatibleConfig,
  body: Record<string, unknown>
): Promise<Response> {
  try {
    return await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        ...config.extraHeaders,
      },
      body: JSON.stringify(body),
    });
  } catch (error: unknown) {
    throw toProviderError(
      config.providerId,
      error,
      `Error de red al contactar ${config.providerId}.`
    );
  }
}

/**
 * Lee el body de error de forma segura.
 *
 * @param response - Response HTTP
 * @returns Texto o vacío
 */
async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/**
 * Construye AiProviderError desde status HTTP.
 *
 * @param providerId - Proveedor
 * @param status - Status HTTP
 * @param bodyText - Cuerpo de error
 * @returns AiProviderError
 */
function httpError(
  providerId: AiProviderId,
  status: number,
  bodyText: string
): AiProviderError {
  const code = classifyHttpError(
    { message: bodyText || `HTTP ${status}`, status },
    status
  );
  return new AiProviderError(
    providerId,
    code,
    `${providerId}: HTTP ${status}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ''}`,
    { status, body: bodyText }
  );
}

/**
 * Extrae el texto del assistant de una respuesta chat.completions.
 *
 * @param payload - JSON de la API
 * @returns Texto o undefined
 */
function extractAssistantText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const message = (choices[0] as { message?: { content?: unknown } })?.message;
  const content = message?.content;
  return typeof content === 'string' ? content : undefined;
}

/**
 * Completa visión + parsea JSON tipado.
 *
 * @param config - Config OpenAI-compatible
 * @param prompt - Prompt
 * @param base64Data - Documento
 * @param mimeType - MIME
 * @param maxPdfPages - Páginas PDF
 * @returns Objeto tipado
 */
export async function completeVisionJson<T>(
  config: OpenAiCompatibleConfig,
  prompt: string,
  base64Data: string,
  mimeType: string,
  maxPdfPages: number
): Promise<T> {
  const text = await callVisionJsonCompletion(
    config,
    prompt,
    base64Data,
    mimeType,
    maxPdfPages
  );
  return parseModelJson<T>(text, config.providerId);
}

/**
 * Igual que `completeVisionJson`, pero rota modelos ante 404 / model_not_found.
 *
 * @param baseConfig - Config sin model (o con el primero)
 * @param models - Lista de model ids a probar en orden
 * @param prompt - Prompt
 * @param base64Data - Documento
 * @param mimeType - MIME
 * @param maxPdfPages - Páginas PDF
 * @returns Objeto tipado
 * @throws AiProviderError del último intento si todos fallan
 */
export async function completeVisionJsonWithModelFallback<T>(
  baseConfig: Omit<OpenAiCompatibleConfig, 'model'>,
  models: string[],
  prompt: string,
  base64Data: string,
  mimeType: string,
  maxPdfPages: number
): Promise<T> {
  const uniqueModels = [...new Set(models.map((m) => m.trim()).filter(Boolean))];
  if (uniqueModels.length === 0) {
    throw new AiProviderError(
      baseConfig.providerId,
      'MODEL_NOT_FOUND',
      `${baseConfig.providerId}: no hay modelos configurados.`
    );
  }

  let lastError: unknown;
  for (let i = 0; i < uniqueModels.length; i++) {
    const model = uniqueModels[i];
    try {
      return await completeVisionJson<T>(
        { ...baseConfig, model },
        prompt,
        base64Data,
        mimeType,
        maxPdfPages
      );
    } catch (error: unknown) {
      lastError = error;
      const canTryNext =
        i < uniqueModels.length - 1 &&
        error instanceof AiProviderError &&
        (error.code === 'MODEL_NOT_FOUND' ||
          /model_not_found|does not exist|unavailable for free|no longer available/i.test(
            error.message
          ));
      if (!canTryNext) {
        throw error;
      }
      console.warn(
        `[${baseConfig.providerId}] Modelo ${model} no disponible; probando siguiente…`
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AiProviderError(
        baseConfig.providerId,
        'MODEL_NOT_FOUND',
        `${baseConfig.providerId}: ningún modelo de la lista está disponible.`
      );
}
