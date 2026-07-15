/**
 * @fileoverview Tests SEC-016 — generación y validación de contraseñas temporales.
 */

import { describe, it, expect } from 'vitest';
import {
  generateTemporaryPassword,
  isAcceptableTemporaryPassword,
  MIN_TEMP_PASSWORD_LENGTH,
  TEMP_PASSWORD_ENTROPY_BYTES,
} from '../temporaryPassword';

describe('temporaryPassword (SEC-016)', () => {
  describe('generateTemporaryPassword', () => {
    it('generates a password at least MIN_TEMP_PASSWORD_LENGTH chars', () => {
      const password = generateTemporaryPassword();
      expect(password.length).toBeGreaterThanOrEqual(MIN_TEMP_PASSWORD_LENGTH);
    });

    it('uses base64url alphabet (no +, /, or padding)', () => {
      const password = generateTemporaryPassword();
      expect(password).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(password).not.toMatch(/[+/=]/);
    });

    it('produces distinct values across calls (non-deterministic)', () => {
      const samples = new Set(
        Array.from({ length: 20 }, () => generateTemporaryPassword())
      );
      // Con 128 bits de entropía, 20 colisiones serían astronómicamente improbables.
      expect(samples.size).toBe(20);
    });

    it('does not match the legacy cambiarNNN pattern', () => {
      for (let i = 0; i < 10; i += 1) {
        expect(generateTemporaryPassword()).not.toMatch(/^cambiar\d+$/i);
      }
    });

    it('honors a larger entropy request', () => {
      const password = generateTemporaryPassword(TEMP_PASSWORD_ENTROPY_BYTES * 2);
      // 32 bytes → ~43 chars base64url
      expect(password.length).toBeGreaterThanOrEqual(40);
    });
  });

  describe('isAcceptableTemporaryPassword', () => {
    it('rejects empty, short, and legacy predictable passwords', () => {
      expect(isAcceptableTemporaryPassword('')).toBe(false);
      expect(isAcceptableTemporaryPassword('short')).toBe(false);
      expect(isAcceptableTemporaryPassword('cambiar100')).toBe(false);
      expect(isAcceptableTemporaryPassword('cambiar999')).toBe(false);
      expect(isAcceptableTemporaryPassword('Cambiar123')).toBe(false);
    });

    it('accepts generated temporary passwords', () => {
      expect(isAcceptableTemporaryPassword(generateTemporaryPassword())).toBe(true);
    });

    it('accepts a long custom secret that is not the legacy pattern', () => {
      expect(isAcceptableTemporaryPassword('una-clave-temporal-muy-larga-y-unica')).toBe(true);
    });
  });
});
