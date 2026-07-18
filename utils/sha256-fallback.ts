/**
 * @fileoverview SHA-256 puro (FIPS 180-4) para entornos sin SubtleCrypto.
 * @description Fallback cuando `crypto.subtle` no existe (HTTP no seguro,
 *   hosts Tailscale, iframes, etc.). Produce el mismo digest hex que Web Crypto.
 */

/** Initial hash values (H0…H7) for SHA-256. */
const H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

/** Round constants K0…K63. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/**
 * Right-rotate a 32-bit word.
 *
 * @param value - Unsigned 32-bit integer
 * @param bits - Rotation amount (0–31)
 * @returns Rotated value as uint32
 */
function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/**
 * Converts a Uint32Array of 8 words into a lowercase hex digest.
 *
 * @param words - SHA-256 state (8 × uint32)
 * @returns 64-character hex string
 */
function wordsToHex(words: Uint32Array): string {
  let hex = '';
  for (let i = 0; i < words.length; i++) {
    hex += (words[i] >>> 0).toString(16).padStart(8, '0');
  }
  return hex;
}

/**
 * Computes SHA-256 of binary data and returns a lowercase hex digest.
 * Compatible with `crypto.subtle.digest('SHA-256', …)` + hex encoding.
 *
 * @param data - Bytes to hash (copied; not mutated)
 * @returns Lowercase hex SHA-256 digest (64 chars)
 * @example
 * ```ts
 * sha256HexFallback(new TextEncoder().encode('abc'));
 * // "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
 * ```
 */
export function sha256HexFallback(data: Uint8Array): string {
  const bitLen = data.byteLength * 8;
  // Padding: 0x80, zeros, then 64-bit big-endian length
  const withOne = data.byteLength + 1;
  const paddedLen = ((withOne + 8 + 63) & ~63) >>> 0;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[data.byteLength] = 0x80;
  // Length in bits as uint64 BE in the last 8 bytes
  const view = new DataView(padded.buffer);
  // High 32 bits (always 0 for inputs < 2^32 bytes, which covers browser blobs)
  const high = Math.floor(bitLen / 0x100000000);
  const low = bitLen >>> 0;
  view.setUint32(paddedLen - 8, high, false);
  view.setUint32(paddedLen - 4, low, false);

  const h = new Uint32Array(H0);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  return wordsToHex(h);
}
