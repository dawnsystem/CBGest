import { describe, expect, it } from 'vitest';
import { sha256HexFallback } from '../sha256-fallback';
import { bufferToHex, sha256Hex } from '../bankStatementFingerprint';

describe('sha256HexFallback', () => {
  it('matches NIST vector for empty input', () => {
    expect(sha256HexFallback(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('matches NIST vector for "abc"', () => {
    expect(sha256HexFallback(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('matches SubtleCrypto for binary payloads when available', async () => {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      return;
    }
    const bytes = new Uint8Array([0, 1, 2, 255, 128, 64]);
    const native = bufferToHex(await crypto.subtle.digest('SHA-256', bytes));
    expect(sha256HexFallback(bytes)).toBe(native);
    expect(await sha256Hex(bytes)).toBe(native);
  });
});
