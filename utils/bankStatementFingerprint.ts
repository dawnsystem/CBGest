/**
 * Fingerprints for bank statement deduplication.
 * Uses Web Crypto SHA-256 for file and content identity checks.
 */

/** Minimal movement shape used for content fingerprints. */
export interface FingerprintableTransaction {
  date: string;
  amount: number;
  concept: string;
}

/**
 * Converts an ArrayBuffer to a lowercase hex string.
 *
 * @param buffer - Digest bytes from SubtleCrypto
 * @returns Hex-encoded digest
 * @example
 * ```ts
 * bufferToHex(new Uint8Array([0xab, 0xcd]).buffer); // "abcd"
 * ```
 */
export function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Computes SHA-256 of a string or binary buffer and returns hex.
 *
 * @param input - UTF-8 string or ArrayBuffer / TypedArray
 * @returns Lowercase hex SHA-256 digest (64 chars)
 * @throws When Web Crypto is unavailable
 * @example
 * ```ts
 * await sha256Hex('hello');
 * ```
 */
export async function sha256Hex(input: string | ArrayBuffer | ArrayBufferView): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto SubtleCrypto no está disponible en este entorno');
  }

  let data: Uint8Array;
  if (typeof input === 'string') {
    data = new TextEncoder().encode(input);
  } else if (ArrayBuffer.isView(input)) {
    // Copy into a concrete Uint8Array (some test envs return exotic views)
    data = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  } else {
    data = new Uint8Array(input);
  }

  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(digest);
}

/**
 * Normalizes a bank concept for stable fingerprinting.
 * Collapses whitespace, lowercases, and strips zero-width chars.
 *
 * @param concept - Raw concept from bank extract
 * @returns Normalized concept
 * @example
 * ```ts
 * normalizeConcept('  RECIBO  LUZ  '); // "recibo luz"
 * ```
 */
export function normalizeConcept(concept: string): string {
  return String(concept || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Formats amount with fixed cents to avoid float key drift.
 *
 * @param amount - Signed amount (negative = cargo)
 * @returns Canonical amount string (e.g. "-150.50")
 * @example
 * ```ts
 * amountToFingerprintKey(-150.5); // "-150.50"
 * ```
 */
export function amountToFingerprintKey(amount: number): string {
  if (!Number.isFinite(amount)) return '0.00';
  return (Math.round(amount * 100) / 100).toFixed(2);
}

/**
 * Builds the canonical line key before hashing.
 *
 * @param date - ISO date YYYY-MM-DD
 * @param amount - Signed amount
 * @param concept - Raw concept
 * @returns Canonical `date|amount|concept` key
 * @example
 * ```ts
 * buildTransactionFingerprintKey('2027-01-15', -10, 'Luz');
 * ```
 */
export function buildTransactionFingerprintKey(
  date: string,
  amount: number,
  concept: string
): string {
  const safeDate = String(date || '').trim();
  return `${safeDate}|${amountToFingerprintKey(amount)}|${normalizeConcept(concept)}`;
}

/**
 * SHA-256 fingerprint of a single bank movement.
 *
 * @param date - ISO date YYYY-MM-DD
 * @param amount - Signed amount
 * @param concept - Raw concept
 * @returns Hex SHA-256 of the normalized line
 * @example
 * ```ts
 * await transactionFingerprint('2027-01-15', -10, 'Luz');
 * ```
 */
export async function transactionFingerprint(
  date: string,
  amount: number,
  concept: string
): Promise<string> {
  return sha256Hex(buildTransactionFingerprintKey(date, amount, concept));
}

/**
 * SHA-256 of the sorted unique set of line fingerprints.
 * Order-independent: same movements in any row order yield the same hash.
 *
 * @param txs - Parsed movements
 * @returns Hex SHA-256 of the statement content
 * @example
 * ```ts
 * await statementContentFingerprint([{ date: '2027-01-01', amount: 1, concept: 'A' }]);
 * ```
 */
export async function statementContentFingerprint(
  txs: FingerprintableTransaction[]
): Promise<string> {
  const lineHashes = await Promise.all(
    txs.map((tx) => transactionFingerprint(tx.date, tx.amount, tx.concept))
  );
  const uniqueSorted = Array.from(new Set(lineHashes)).sort();
  return sha256Hex(uniqueSorted.join('\n'));
}

/**
 * SHA-256 of a File or binary buffer (exact file bytes).
 *
 * @param source - Browser File or ArrayBuffer / TypedArray
 * @returns Hex SHA-256 of file contents
 * @throws When reading the file fails or Web Crypto is unavailable
 * @example
 * ```ts
 * await computeFileSha256(file);
 * ```
 */
export async function computeFileSha256(source: File | ArrayBuffer | ArrayBufferView): Promise<string> {
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    // File extends Blob. Prefer native arrayBuffer; fall back for test envs (happy-dom).
    let buffer: ArrayBuffer;
    if (typeof source.arrayBuffer === 'function') {
      buffer = await source.arrayBuffer();
    } else {
      buffer = await new Response(source).arrayBuffer();
    }
    return sha256Hex(new Uint8Array(buffer));
  }
  return sha256Hex(source as ArrayBuffer | ArrayBufferView);
}

/**
 * Attaches `contentFingerprint` to each transaction.
 *
 * @param txs - Transactions without fingerprints
 * @returns Same transactions with contentFingerprint set
 * @example
 * ```ts
 * const enriched = await enrichTransactionsWithFingerprints(txs);
 * ```
 */
export async function enrichTransactionsWithFingerprints<T extends FingerprintableTransaction>(
  txs: T[]
): Promise<Array<T & { contentFingerprint: string }>> {
  return Promise.all(
    txs.map(async (tx) => ({
      ...tx,
      contentFingerprint: await transactionFingerprint(tx.date, tx.amount, tx.concept),
    }))
  );
}
