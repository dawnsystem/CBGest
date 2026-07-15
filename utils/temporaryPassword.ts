/**
 * @fileoverview Generación y validación de contraseñas temporales (SEC-016).
 * @description Sustituye el esquema predecible `cambiar` + 100–999 (~900 valores)
 *              por secretos con ≥128 bits de entropía vía `crypto.getRandomValues`.
 *              La contraseña temporal se comunica al usuario una sola vez; debe
 *              cambiarla en el primer login (`ForcePasswordChange`).
 */

/** Mínimo aceptable para contraseñas temporales (Appwrite exige ≥8; SEC-016 exige ≥16). */
export const MIN_TEMP_PASSWORD_LENGTH = 16;

/** Bytes de entropía por defecto (≥128 bits). */
export const TEMP_PASSWORD_ENTROPY_BYTES = 16;

/**
 * Patrones claramente débiles / legacy que la función `manage-users` y el cliente
 * deben rechazar aunque cumplan la longitud mínima.
 */
const WEAK_TEMP_PASSWORD_PATTERN = /^cambiar\d{1,4}$/i;

/**
 * Genera una contraseña temporal criptográficamente segura.
 *
 * Usa `crypto.getRandomValues` (Web Crypto / Node global) y codifica en base64url
 * sin padding para obtener una cadena compacta y fácil de copiar (~22 caracteres
 * con 16 bytes de entropía).
 *
 * @param entropyBytes - Número de bytes aleatorios (mínimo 16).
 * @returns Contraseña temporal en base64url.
 * @throws Error si el entorno no expone Web Crypto / `crypto.getRandomValues`.
 * @example
 * ```ts
 * const temp = generateTemporaryPassword();
 * // → "xK9_mPqR2nVwL0sT8uAbCd" (ejemplo; valor aleatorio)
 * ```
 */
export function generateTemporaryPassword(entropyBytes: number = TEMP_PASSWORD_ENTROPY_BYTES): string {
  const bytesNeeded = Math.max(TEMP_PASSWORD_ENTROPY_BYTES, Math.floor(entropyBytes));
  const cryptoApi = globalThis.crypto;

  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('Web Crypto no disponible: no se puede generar una contraseña temporal segura.');
  }

  const bytes = new Uint8Array(bytesNeeded);
  cryptoApi.getRandomValues(bytes);

  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  const base64 = typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(bytes).toString('base64');

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Indica si una contraseña temporal cumple la política SEC-016.
 *
 * @param password - Candidata a contraseña temporal.
 * @returns `true` si tiene longitud mínima y no coincide con patrones legacy débiles.
 * @example
 * ```ts
 * isAcceptableTemporaryPassword('cambiar123'); // false
 * isAcceptableTemporaryPassword(generateTemporaryPassword()); // true
 * ```
 */
export function isAcceptableTemporaryPassword(password: string): boolean {
  if (typeof password !== 'string') return false;
  const trimmed = password.trim();
  if (trimmed.length < MIN_TEMP_PASSWORD_LENGTH) return false;
  if (WEAK_TEMP_PASSWORD_PATTERN.test(trimmed)) return false;
  return true;
}
