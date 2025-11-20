
// Utility for Military-Grade Encryption (AES-GCM 256) in the Browser

const ENC_ALGO = 'AES-GCM';
const KDF_ALGO = 'PBKDF2';
const SALT_LEN = 16;
const IV_LEN = 12;
const ITERATIONS = 100000; // OWASP recommended minimum for PBKDF2

// Helper: ArrayBuffer to Base64
const ab2base64 = (buf: ArrayBuffer): string => {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
};

// Helper: Base64 to ArrayBuffer
const base642ab = (base64: string): ArrayBuffer => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
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
    const packet = JSON.parse(encryptedJson);
    if (!packet.salt || !packet.iv || !packet.ciphertext) throw new Error("Invalid format");

    const salt = new Uint8Array(base642ab(packet.salt));
    const iv = new Uint8Array(base642ab(packet.iv));
    const ciphertext = base642ab(packet.ciphertext);

    const key = await deriveKey(password, salt);

    const decryptedContent = await window.crypto.subtle.decrypt(
      { name: ENC_ALGO, iv: iv },
      key,
      ciphertext
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedContent);
  } catch (error) {
    console.error("Decryption failed:", error);
    throw new Error("Contraseña incorrecta o archivo dañado.");
  }
};
