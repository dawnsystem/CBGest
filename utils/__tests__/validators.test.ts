import { describe, it, expect } from 'vitest';
import { isValidNIF } from '../validators';

describe('validators', () => {
  describe('isValidNIF', () => {
    describe('DNI validation', () => {
      it('should validate correct DNI', () => {
        expect(isValidNIF('12345678Z')).toBe(true);
        expect(isValidNIF('00000000T')).toBe(true);
        expect(isValidNIF('99999999R')).toBe(true);
      });

      it('should accept DNI with spaces', () => {
        expect(isValidNIF('12345678 Z')).toBe(true);
        expect(isValidNIF('1234 5678 Z')).toBe(true);
      });

      it('should accept lowercase DNI', () => {
        expect(isValidNIF('12345678z')).toBe(true);
      });

      it('should reject DNI with wrong letter', () => {
        expect(isValidNIF('12345678A')).toBe(false);
        expect(isValidNIF('12345678X')).toBe(false);
      });

      it('should reject DNI with invalid format', () => {
        expect(isValidNIF('1234567Z')).toBe(false); // Too short
        expect(isValidNIF('123456789Z')).toBe(false); // Too long
        expect(isValidNIF('1234567AZ')).toBe(false); // Letter in number part
      });
    });

    describe('NIE validation', () => {
      it('should validate correct NIE', () => {
        // Valid NIEs with correct check letters
        expect(isValidNIF('X0000000T')).toBe(true);
        expect(isValidNIF('Y0000000Z')).toBe(true);
        expect(isValidNIF('Z1234567R')).toBe(true);
      });

      it('should accept NIE with spaces', () => {
        expect(isValidNIF('X1234567 L')).toBe(true);
      });

      it('should accept lowercase NIE', () => {
        expect(isValidNIF('x1234567l')).toBe(true);
      });

      it('should reject NIE with wrong letter', () => {
        expect(isValidNIF('X1234567A')).toBe(false);
      });

      it('should reject NIE with invalid prefix', () => {
        expect(isValidNIF('A1234567L')).toBe(false);
      });
    });

    describe('CIF validation', () => {
      it('should validate correct CIF with control digit', () => {
        expect(isValidNIF('A12345674')).toBe(true);
        expect(isValidNIF('B12345674')).toBe(true);
      });

      it('should validate correct CIF with control letter', () => {
        expect(isValidNIF('A12345674')).toBe(true);
      });

      it('should accept CIF with spaces', () => {
        expect(isValidNIF('A 12345674')).toBe(true);
      });

      it('should accept lowercase CIF', () => {
        expect(isValidNIF('a12345674')).toBe(true);
      });

      it('should reject CIF with invalid prefix', () => {
        expect(isValidNIF('I12345674')).toBe(false); // I is not valid
        expect(isValidNIF('O12345674')).toBe(false); // O is not valid
      });

      it('should reject CIF with wrong control', () => {
        expect(isValidNIF('A12345670')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should reject empty string', () => {
        expect(isValidNIF('')).toBe(false);
      });

      it('should reject null or undefined', () => {
        expect(isValidNIF(null as any)).toBe(false);
        expect(isValidNIF(undefined as any)).toBe(false);
      });

      it('should reject random strings', () => {
        expect(isValidNIF('ABCDEFGH')).toBe(false);
        expect(isValidNIF('12345678')).toBe(false);
        expect(isValidNIF('ZZZZZZZZ')).toBe(false);
      });

      it('should handle special characters', () => {
        expect(isValidNIF('12345678-Z')).toBe(false); // Hyphens not allowed after cleaning
        expect(isValidNIF('12.345.678-Z')).toBe(false);
      });
    });

    describe('real world examples', () => {
      // These are test NIFs from Spanish government test environments
      it('should validate common test DNIs', () => {
        expect(isValidNIF('12345678Z')).toBe(true);
        expect(isValidNIF('87654321X')).toBe(true);
      });

      it('should validate common test NIEs', () => {
        expect(isValidNIF('X0000000T')).toBe(true);
        expect(isValidNIF('Y0000000Z')).toBe(true);
      });
    });
  });
});
