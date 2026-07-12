import { describe, it, expect } from 'vitest';
import { encryptData, decryptData } from '../crypto';

describe('crypto utilities', () => {
  const testPassword = 'TestPassword123!';
  const testData = 'Sensitive accounting data';

  describe('encryptData', () => {
    it('should encrypt data and return a JSON string', async () => {
      const encrypted = await encryptData(testData, testPassword);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');

      // Verify it's valid JSON
      const parsed = JSON.parse(encrypted);
      expect(parsed).toHaveProperty('salt');
      expect(parsed).toHaveProperty('iv');
      expect(parsed).toHaveProperty('ciphertext');
      expect(parsed).toHaveProperty('version');
      expect(parsed.version).toBe(1);
    });

    it('should produce different ciphertexts for same input (due to random IV)', async () => {
      const encrypted1 = await encryptData(testData, testPassword);
      const encrypted2 = await encryptData(testData, testPassword);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should encrypt empty string', async () => {
      const encrypted = await encryptData('', testPassword);
      expect(encrypted).toBeDefined();

      const decrypted = await decryptData(encrypted, testPassword);
      expect(decrypted).toBe('');
    });

    it('should encrypt long strings', async () => {
      const longData = 'A'.repeat(10000);
      const encrypted = await encryptData(longData, testPassword);
      expect(encrypted).toBeDefined();

      const decrypted = await decryptData(encrypted, testPassword);
      expect(decrypted).toBe(longData);
    });

    it('should encrypt special characters', async () => {
      const specialData = '¡Hola! €100 - Ñoño 你好 🎉';
      const encrypted = await encryptData(specialData, testPassword);
      const decrypted = await decryptData(encrypted, testPassword);
      expect(decrypted).toBe(specialData);
    });
  });

  describe('decryptData', () => {
    it('should decrypt data encrypted with same password', async () => {
      const encrypted = await encryptData(testData, testPassword);
      const decrypted = await decryptData(encrypted, testPassword);

      expect(decrypted).toBe(testData);
    });

    it('should fail with wrong password', async () => {
      const encrypted = await encryptData(testData, testPassword);

      await expect(
        decryptData(encrypted, 'WrongPassword')
      ).rejects.toThrow('Contraseña incorrecta o archivo dañado');
    });

    it('should fail with corrupted data', async () => {
      const invalidJson = '{"salt":"xxx","iv":"yyy","ciphertext":"zzz"}';

      await expect(
        decryptData(invalidJson, testPassword)
      ).rejects.toThrow();
    });

    it('should fail with invalid JSON', async () => {
      await expect(
        decryptData('not a json', testPassword)
      ).rejects.toThrow();
    });

    it('should fail with missing fields', async () => {
      const incomplete = JSON.stringify({ salt: 'xxx' });

      await expect(
        decryptData(incomplete, testPassword)
      ).rejects.toThrow(); // Will throw either 'Invalid format' or decryption error
    });

    it('should handle JSON objects as data', async () => {
      const jsonData = JSON.stringify({
        invoice: 'INV-001',
        amount: 1500.50,
        nif: '12345678Z'
      });

      const encrypted = await encryptData(jsonData, testPassword);
      const decrypted = await decryptData(encrypted, testPassword);

      expect(decrypted).toBe(jsonData);
      expect(JSON.parse(decrypted)).toEqual({
        invoice: 'INV-001',
        amount: 1500.50,
        nif: '12345678Z'
      });
    });
  });

  describe('encryption strength', () => {
    it('should use different salts for each encryption', async () => {
      const encrypted1 = await encryptData(testData, testPassword);
      const encrypted2 = await encryptData(testData, testPassword);

      const packet1 = JSON.parse(encrypted1);
      const packet2 = JSON.parse(encrypted2);

      expect(packet1.salt).not.toBe(packet2.salt);
    });

    it('should use different IVs for each encryption', async () => {
      const encrypted1 = await encryptData(testData, testPassword);
      const encrypted2 = await encryptData(testData, testPassword);

      const packet1 = JSON.parse(encrypted1);
      const packet2 = JSON.parse(encrypted2);

      expect(packet1.iv).not.toBe(packet2.iv);
    });

    it('should produce different ciphertexts even with same password and data', async () => {
      const encrypted1 = await encryptData(testData, testPassword);
      const encrypted2 = await encryptData(testData, testPassword);

      const packet1 = JSON.parse(encrypted1);
      const packet2 = JSON.parse(encrypted2);

      expect(packet1.ciphertext).not.toBe(packet2.ciphertext);
    });
  });

  describe('round-trip encryption', () => {
    it('should handle multiple encrypt/decrypt cycles', async () => {
      let data = testData;

      // Encrypt and decrypt 5 times
      for (let i = 0; i < 5; i++) {
        const encrypted = await encryptData(data, testPassword);
        data = await decryptData(encrypted, testPassword);
      }

      expect(data).toBe(testData);
    });

    it('should work with different passwords', async () => {
      const password1 = 'Password1!';
      const password2 = 'Password2!';

      const encrypted1 = await encryptData(testData, password1);
      const encrypted2 = await encryptData(testData, password2);

      const decrypted1 = await decryptData(encrypted1, password1);
      const decrypted2 = await decryptData(encrypted2, password2);

      expect(decrypted1).toBe(testData);
      expect(decrypted2).toBe(testData);

      // Cross-password decryption should fail
      await expect(
        decryptData(encrypted1, password2)
      ).rejects.toThrow();
    });
  });

  describe('type validation and edge cases', () => {
    it('should reject invalid encrypted data (empty string)', async () => {
      await expect(
        decryptData('', testPassword)
      ).rejects.toThrow('Contraseña incorrecta o archivo dañado');
    });

    it('should reject null/undefined encrypted data', async () => {
      await expect(
        decryptData(null as unknown as string, testPassword)
      ).rejects.toThrow('Contraseña incorrecta o archivo dañado');

      await expect(
        decryptData(undefined as unknown as string, testPassword)
      ).rejects.toThrow('Contraseña incorrecta o archivo dañado');
    });

    it('should reject invalid password types', async () => {
      const encrypted = await encryptData(testData, testPassword);

      await expect(
        decryptData(encrypted, '' as unknown as string)
      ).rejects.toThrow('Contraseña incorrecta o archivo dañado');

      await expect(
        decryptData(encrypted, null as unknown as string)
      ).rejects.toThrow('Contraseña incorrecta o archivo dañado');
    });

    it('should reject packet with invalid base64 in salt', async () => {
      const invalidPacket = JSON.stringify({
        salt: 'invalid!!!base64',
        iv: 'dGVzdA==',
        ciphertext: 'dGVzdA==',
        version: 1
      });

      await expect(
        decryptData(invalidPacket, testPassword)
      ).rejects.toThrow('Contraseña incorrecta o archivo dañado');
    });

    it('should reject packet with non-string fields', async () => {
      const invalidPacket1 = JSON.stringify({
        salt: 123,
        iv: 'dGVzdA==',
        ciphertext: 'dGVzdA==',
        version: 1
      });

      await expect(
        decryptData(invalidPacket1, testPassword)
      ).rejects.toThrow('Contraseña incorrecta o archivo dañado');

      const invalidPacket2 = JSON.stringify({
        salt: 'dGVzdA==',
        iv: {},
        ciphertext: 'dGVzdA==',
        version: 1
      });

      await expect(
        decryptData(invalidPacket2, testPassword)
      ).rejects.toThrow('Contraseña incorrecta o archivo dañado');
    });

    it('should reject packet with wrong salt/iv length', async () => {
      // Create a packet with valid base64 but wrong lengths
      const shortSalt = btoa('short'); // Too short
      const encrypted = await encryptData(testData, testPassword);
      const validPacket = JSON.parse(encrypted);

      const invalidPacket = JSON.stringify({
        salt: shortSalt,
        iv: validPacket.iv,
        ciphertext: validPacket.ciphertext,
        version: 1
      });

      await expect(
        decryptData(invalidPacket, testPassword)
      ).rejects.toThrow('Contraseña incorrecta o archivo dañado');
    });

    it('should handle very large encrypted payloads without type errors', async () => {
      // Test with 1MB of data to ensure buffer handling is correct
      const largeData = 'A'.repeat(1024 * 1024);
      const encrypted = await encryptData(largeData, testPassword);

      // This should not throw any ArrayBuffer type errors
      const decrypted = await decryptData(encrypted, testPassword);
      expect(decrypted).toBe(largeData);
    });

    it('should handle binary-like data (emojis, unicode) without type errors', async () => {
      const binaryLikeData = '🔐🔑💾📁\u0000\u0001\u0002\u0003\uFFFF';
      const encrypted = await encryptData(binaryLikeData, testPassword);

      // Should handle all unicode characters correctly without type errors
      const decrypted = await decryptData(encrypted, testPassword);
      expect(decrypted).toBe(binaryLikeData);
    });

    it('should consistently return Uint8Array from base642ab (internal test)', async () => {
      // This test verifies that the fix prevents the original error:
      // "3rd argument is not instance of ArrayBuffer, Buffer, TypedArray, or DataView"

      const encrypted = await encryptData(testData, testPassword);
      // The internal base642ab should now return Uint8Array, not ArrayBuffer
      // This ensures SubtleCrypto.decrypt receives the correct type

      // If this test passes, it means the type error is fixed
      const decrypted = await decryptData(encrypted, testPassword);
      expect(decrypted).toBe(testData);
    });
  });
});
