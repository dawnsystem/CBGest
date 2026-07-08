import { NifType } from '../types';

/**
 * Spanish NIF/CIF/NIE validation and detection utilities
 */

// Valid VAT rates in Spain
export const VALID_VAT_RATES = [0, 4, 10, 21] as const;
export type VatRate = typeof VALID_VAT_RATES[number];

// PERF-007: Compile regexes once at module level instead of inside each function call.
const DNI_REGEX = /^[0-9]{8}[TRWAGMYFPDXBNJZSQVHLCKE]$/;
const NIE_REGEX = /^[XYZ][0-9]{7}[TRWAGMYFPDXBNJZSQVHLCKE]$/;
const CIF_REGEX = /^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/;

/**
 * Detect the type of Spanish identification number
 */
export const detectNifType = (nif: string): NifType => {
  if (!nif) return 'NIF';
  const str = nif.toUpperCase().replace(/\s/g, '');

  if (DNI_REGEX.test(str)) return 'DNI';
  if (NIE_REGEX.test(str)) return 'NIE';
  if (CIF_REGEX.test(str)) return 'CIF';

  return 'NIF';
};

export const isValidNIF = (nif: string): boolean => {
  if (!nif) return false;
  const str = nif.toUpperCase().replace(/\s/g, '');

  // Validación DNI
  if (DNI_REGEX.test(str)) {
    const number = parseInt(str.substr(0, 8), 10);
    const letter = str.substr(8, 1);
    const letters = "TRWAGMYFPDXBNJZSQVHLCKE";
    return letters.charAt(number % 23) === letter;
  }

  // Validación NIE
  if (NIE_REGEX.test(str)) {
    const niePrefix = str.charAt(0);
    const prefixMap: {[key: string]: string} = { 'X': '0', 'Y': '1', 'Z': '2' };
    const numberStr = prefixMap[niePrefix] + str.substr(1, 7);
    const number = parseInt(numberStr, 10);
    const expectedLetter = str.substr(8, 1);
    const letters = "TRWAGMYFPDXBNJZSQVHLCKE";
    return letters.charAt(number % 23) === expectedLetter;
  }

  // Validación CIF (Simplificada pero robusta para la mayoría de casos)
  if (CIF_REGEX.test(str)) {
    const digits = str.substr(1, 7);
    const control = str.charAt(8);
    
    let evenSum = 0;
    let oddSum = 0;
    
    for (let i = 0; i < digits.length; i++) {
      const n = parseInt(digits[i], 10);
      if (i % 2 === 0) { // Posiciones impares (índice 0, 2, 4...)
        const doubled = n * 2;
        oddSum += doubled < 10 ? doubled : doubled - 9;
      } else {
        evenSum += n;
      }
    }
    
    const total = evenSum + oddSum;
    const unit = total % 10;
    const controlDigit = unit === 0 ? 0 : 10 - unit;
    const controlLetter = "JABCDEFGHI".charAt(controlDigit);
    
    return control == controlDigit.toString() || control === controlLetter;
  }

  return false;
};

/**
 * Normalize a NIF/CIF/NIE string (uppercase, remove spaces/dashes)
 */
export const normalizeNif = (nif: string): string => {
  if (!nif) return '';
  return nif.toUpperCase().replace(/[\s-]/g, '');
};

/**
 * Format NIF with proper display (with or without dashes)
 */
export const formatNif = (nif: string, withDashes = false): string => {
  const normalized = normalizeNif(nif);
  if (!normalized) return '';

  if (!withDashes) return normalized;

  // Format: XX-XXXXXXX-X for CIF, XXXXXXXX-X for DNI/NIE
  const type = detectNifType(normalized);
  if (type === 'CIF') {
    return `${normalized.slice(0, 1)}-${normalized.slice(1, 8)}-${normalized.slice(8)}`;
  }
  return `${normalized.slice(0, 8)}-${normalized.slice(8)}`;
};

/**
 * Validate a VAT rate
 */
export const isValidVatRate = (rate: number): rate is VatRate => {
  return VALID_VAT_RATES.includes(rate as VatRate);
};

/**
 * Validate a monetary amount (non-negative, max 2 decimal places)
 */
export const isValidAmount = (amount: number): boolean => {
  if (typeof amount !== 'number' || isNaN(amount)) return false;
  if (amount < 0) return false;
  // Check max 2 decimal places
  const rounded = Math.round(amount * 100) / 100;
  return Math.abs(amount - rounded) < 0.001;
};

/**
 * Round a number to 2 decimal places (for currency)
 */
export const roundCurrency = (amount: number): number => {
  return Math.round(amount * 100) / 100;
};

/**
 * Validate date string in YYYY-MM-DD format
 */
export const isValidDateYYYYMMDD = (dateStr: string): boolean => {
  if (!dateStr) return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;

  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year &&
         date.getMonth() === month - 1 &&
         date.getDate() === day;
};

/**
 * Validate Spanish IBAN
 */
export const isValidSpanishIBAN = (iban: string): boolean => {
  if (!iban) return false;

  // Normalize: remove spaces and convert to uppercase
  const normalized = iban.replace(/\s/g, '').toUpperCase();

  // Spanish IBAN: ES + 22 digits = 24 characters total
  if (!/^ES\d{22}$/.test(normalized)) return false;

  // Move first 4 chars to end and convert letters to numbers (E=14, S=28)
  const rearranged = normalized.slice(4) + '1428' + normalized.slice(2, 4);

  // Mod 97 check
  let remainder = 0;
  for (const char of rearranged) {
    remainder = (remainder * 10 + parseInt(char, 10)) % 97;
  }

  return remainder === 1;
};

/**
 * Validate invoice number format (non-empty, reasonable length)
 */
export const isValidInvoiceNumber = (number: string): boolean => {
  if (!number || typeof number !== 'string') return false;
  const trimmed = number.trim();
  return trimmed.length >= 1 && trimmed.length <= 50;
};

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number (Spanish format)
 */
export const isValidSpanishPhone = (phone: string): boolean => {
  if (!phone) return false;
  // Remove spaces, dashes, parentheses
  const normalized = phone.replace(/[\s\-()]/g, '');
  // Spanish phones: 9 digits starting with 6, 7, 8, or 9
  // Or with +34 prefix
  return /^(\+34)?[6-9]\d{8}$/.test(normalized);
};

/**
 * Validate postal code (Spanish format: 5 digits, 01000-52999)
 */
export const isValidSpanishPostalCode = (code: string): boolean => {
  if (!code) return false;
  const normalized = code.trim();
  if (!/^\d{5}$/.test(normalized)) return false;
  const num = parseInt(normalized, 10);
  return num >= 1000 && num <= 52999;
};

/**
 * Check if a string contains potential XSS/injection content
 */
export const isSafeString = (str: string): boolean => {
  if (!str) return true;
  // Basic check for script tags and event handlers
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe/i,
    /<object/i,
  ];
  return !dangerousPatterns.some(pattern => pattern.test(str));
};

/**
 * Sanitize a string for safe display (basic XSS prevention)
 */
export const sanitizeString = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};