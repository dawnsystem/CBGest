// Utility for Military-Grade Encryption (AES-GCM 256) in the Browser
//
// NOTA: LocalStorage en CBGest (estado actual - 2025-11-21)
// =========================================================
// Este módulo de cifrado NO se usa para datos en LocalStorage cuando Appwrite está activo.
//
// MIGRACIÓN A APPWRITE COMPLETADA (PARCIAL):
// ✅ Settings: Ya NO se guardan en localStorage cuando Appwrite está activo
// ✅ Datos principales (invoices, entries, transactions, suppliers): Solo en localStorage si Appwrite NO está activo
// ⏳ Notificaciones: Todavía en localStorage (servicios de Appwrite listos, pendiente migración de contexto)
// ⏳ Cola de uploads: Todavía en localStorage (servicios de Appwrite listos, pendiente migración de contexto)
//
// Este módulo se usa SOLO para:
// - Cifrado de archivos locales cuando el usuario elige modo "archivo local cifrado"
// - Exportación/importación de datos cifrados
//
// TODO: Migrar contextos de notificaciones y cola de uploads para usar Appwrite completamente
// y eliminar las últimas dependencias de LocalStorage.

const ENC_ALGO = 'AES-GCM';
const KDF_ALGO = 'PBKDF2';
const SALT_LEN = 16;
const IV_LEN = 12;
const ITERATIONS = 100000; // OWASP recommended minimum for PBKDF2

// Helper: ArrayBuffer to Base64
// NOTA: Procesa el buffer en chunks para evitar "Maximum call stack size exceeded"
// con datos grandes (el spread operator tiene límites)
const ab2base64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  const chunkSize = 8192; // 8KB chunks - evita stack overflow
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

// Helper: Base64 to Uint8Array
// NOTA: Devuelve Uint8Array en lugar de ArrayBuffer para evitar problemas de tipo
// con SubtleCrypto.decrypt. Uint8Array es un BufferSource válido y garantiza
// que el buffer tenga exactamente el tamaño correcto.
const base642ab = (base64: string): Uint8Array => {
  // Validar que la entrada sea una cadena válida
  if (typeof base64 !== 'string' || base64.length === 0) {
    throw new Error('Invalid base64 input');
  }

  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    // Devolver Uint8Array directamente en lugar de bytes.buffer
    // Esto garantiza compatibilidad con SubtleCrypto.decrypt
    return bytes;
  } catch (error) {
    throw new Error('Failed to decode base64 string');
  }
};

// 1. Derive Key from Password
const deriveKey = async (password: string, salt: Uint8Array): Promise<CryptoKey> => {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: KDF_ALGO },
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: KDF_ALGO,
      salt: salt,
      iterations: ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: ENC_ALGO, length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

// 2. Encrypt Data
export const encryptData = async (data: string, password: string): Promise<string> => {
  const enc = new TextEncoder();
  const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LEN));
  
  const key = await deriveKey(password, salt);
  
  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: ENC_ALGO, iv: iv },
    key,
    enc.encode(data)
  );

  // Pack everything into a JSON structure
  const packet = {
    salt: ab2base64(salt),
    iv: ab2base64(iv),
    ciphertext: ab2base64(encryptedContent),
    version: 1
  };

  return JSON.stringify(packet);
};

// 3. Decrypt Data
export const decryptData = async (encryptedJson: string, password: string): Promise<string> => {
  try {
    // Validar entrada
    if (!encryptedJson || typeof encryptedJson !== 'string') {
      throw new Error("Invalid encrypted data");
    }

    if (!password || typeof password !== 'string') {
      throw new Error("Invalid password");
    }

    // Parsear y validar estructura del paquete cifrado
    const packet = JSON.parse(encryptedJson);

    // Validar que todos los campos requeridos existen y son strings
    if (!packet.salt || typeof packet.salt !== 'string') {
      throw new Error("Invalid or missing salt");
    }
    if (!packet.iv || typeof packet.iv !== 'string') {
      throw new Error("Invalid or missing IV");
    }
    if (!packet.ciphertext || typeof packet.ciphertext !== 'string') {
      throw new Error("Invalid or missing ciphertext");
    }

    // Decodificar base64 a Uint8Array
    // base642ab ahora devuelve Uint8Array directamente (tipo válido para SubtleCrypto)
    const salt = base642ab(packet.salt);
    const iv = base642ab(packet.iv);
    const ciphertext = base642ab(packet.ciphertext);

    // Validar tamaños esperados
    if (salt.length !== SALT_LEN) {
      throw new Error(`Invalid salt length: expected ${SALT_LEN}, got ${salt.length}`);
    }
    if (iv.length !== IV_LEN) {
      throw new Error(`Invalid IV length: expected ${IV_LEN}, got ${iv.length}`);
    }

    // Derivar clave desde la contraseña
    const key = await deriveKey(password, salt);

    // Descifrar usando SubtleCrypto
    // IMPORTANTE: ciphertext es ahora Uint8Array (BufferSource), no ArrayBuffer
    // Esto previene el error "3rd argument is not instance of ArrayBuffer..."
    const decryptedContent = await window.crypto.subtle.decrypt(
      { name: ENC_ALGO, iv: iv },
      key,
      ciphertext
    );

    // Decodificar el contenido descifrado a string
    const dec = new TextDecoder();
    return dec.decode(decryptedContent);
  } catch (error) {
    console.error("Decryption failed:", error);
    // Mantener el mensaje de error amigable para el usuario
    throw new Error("Contraseña incorrecta o archivo dañado.");
  }
};
