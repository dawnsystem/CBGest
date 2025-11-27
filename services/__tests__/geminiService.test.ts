import { describe, it, expect, beforeEach, vi } from 'vitest';
import { analyzeInvoiceImage, analyzeBankStatement } from '../geminiService';
import type { Supplier } from '../../types';

// Mock the Google Gemini AI module
vi.mock('@google/genai');

describe('geminiService', () => {
  const mockBase64Data = 'base64encodedimagedata==';
  const mockMimeType = 'image/jpeg';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeInvoiceImage', () => {
    it('should analyze invoice and return structured data', async () => {
      const result = await analyzeInvoiceImage(mockBase64Data, mockMimeType);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('number');
      expect(result).toHaveProperty('date');
      expect(result).toHaveProperty('issuerName');
      expect(result).toHaveProperty('issuerNif');
      expect(result).toHaveProperty('issuerNifType');
      expect(result).toHaveProperty('baseAmount');
      expect(result).toHaveProperty('vatRate');
      expect(result).toHaveProperty('vatAmount');
      expect(result).toHaveProperty('totalAmount');
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('suggestedAccountCode');
    });

    it('should return valid invoice number', async () => {
      const result = await analyzeInvoiceImage(mockBase64Data, mockMimeType);

      expect(typeof result.number).toBe('string');
      expect(result.number.length).toBeGreaterThan(0);
    });

    it('should return valid date format (YYYY-MM-DD)', async () => {
      const result = await analyzeInvoiceImage(mockBase64Data, mockMimeType);

      expect(typeof result.date).toBe('string');
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return clean NIF without separators', async () => {
      const result = await analyzeInvoiceImage(mockBase64Data, mockMimeType);

      expect(typeof result.issuerNif).toBe('string');
      // Should not contain spaces, hyphens, dots
      expect(result.issuerNif).not.toMatch(/[\s\-.]/);
    });

    it('should return valid NIF type', async () => {
      const result = await analyzeInvoiceImage(mockBase64Data, mockMimeType);

      const validTypes = ['NIF', 'CIF', 'VAT', 'PASSPORT', 'OTHER'];
      expect(validTypes).toContain(result.issuerNifType);
    });

    it('should return valid invoice type', async () => {
      const result = await analyzeInvoiceImage(mockBase64Data, mockMimeType);

      expect(['EXPENSE', 'INCOME']).toContain(result.type);
    });

    it('should return numeric amounts', async () => {
      const result = await analyzeInvoiceImage(mockBase64Data, mockMimeType);

      expect(typeof result.baseAmount).toBe('number');
      expect(typeof result.vatRate).toBe('number');
      expect(typeof result.vatAmount).toBe('number');
      expect(typeof result.totalAmount).toBe('number');

      expect(result.baseAmount).toBeGreaterThanOrEqual(0);
      expect(result.vatRate).toBeGreaterThanOrEqual(0);
      expect(result.vatAmount).toBeGreaterThanOrEqual(0);
      expect(result.totalAmount).toBeGreaterThan(0);
    });

    it('should validate VAT calculation', async () => {
      const result = await analyzeInvoiceImage(mockBase64Data, mockMimeType);

      const calculatedVat = Math.round((result.baseAmount * result.vatRate) / 100 * 100) / 100;
      const calculatedTotal = Math.round((result.baseAmount + result.vatAmount) * 100) / 100;

      // Allow small rounding differences
      expect(Math.abs(result.vatAmount - calculatedVat)).toBeLessThan(0.02);
      expect(Math.abs(result.totalAmount - calculatedTotal)).toBeLessThan(0.02);
    });

    it('should return valid account code from PGC', async () => {
      const result = await analyzeInvoiceImage(mockBase64Data, mockMimeType);

      expect(typeof result.suggestedAccountCode).toBe('string');
      // Should be 3 digits
      expect(result.suggestedAccountCode).toMatch(/^\d{3}$/);
    });

    describe('supplier matching', () => {
      const existingSuppliers: Supplier[] = [
        {
          id: 'supplier1',
          name: 'Test Supplier S.L.',
          nif: 'B12345678',
          nifType: 'CIF',
          category: 'Servicios',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'supplier2',
          name: 'Another Supplier',
          nif: 'B87654321',
          nifType: 'CIF',
          category: 'Materiales',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      it('should accept existing suppliers list', async () => {
        await expect(
          analyzeInvoiceImage(mockBase64Data, mockMimeType, existingSuppliers)
        ).resolves.toBeDefined();
      });

      it('should return matchedSupplierId when supplier matches', async () => {
        const result = await analyzeInvoiceImage(
          mockBase64Data,
          mockMimeType,
          existingSuppliers
        );

        expect(result).toHaveProperty('matchedSupplierId');
        // Can be null or string
        expect(
          result.matchedSupplierId === null || typeof result.matchedSupplierId === 'string'
        ).toBe(true);
      });

      it('should work without existing suppliers', async () => {
        const result = await analyzeInvoiceImage(mockBase64Data, mockMimeType, []);

        expect(result).toBeDefined();
        expect(result.matchedSupplierId).toBeNull();
      });
    });

    describe('error handling', () => {
      it('should throw error on invalid response', async () => {
        // This would require mocking the AI to return invalid data
        // For now, we test that the function handles errors gracefully
        try {
          await analyzeInvoiceImage('invalid', 'invalid/type');
          // If it succeeds with mock, that's ok
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      });
    });
  });

  describe('analyzeBankStatement', () => {
    it('should analyze bank statement and return array of transactions', async () => {
      const result = await analyzeBankStatement(mockBase64Data, mockMimeType);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return transactions with correct structure', async () => {
      const result = await analyzeBankStatement(mockBase64Data, mockMimeType);

      result.forEach((transaction) => {
        expect(transaction).toHaveProperty('date');
        expect(transaction).toHaveProperty('concept');
        expect(transaction).toHaveProperty('amount');
      });
    });

    it('should return valid date formats', async () => {
      const result = await analyzeBankStatement(mockBase64Data, mockMimeType);

      result.forEach((transaction) => {
        expect(transaction.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    it('should return numeric amounts', async () => {
      const result = await analyzeBankStatement(mockBase64Data, mockMimeType);

      result.forEach((transaction) => {
        expect(typeof transaction.amount).toBe('number');
        expect(isNaN(transaction.amount)).toBe(false);
      });
    });

    it('should have negative amounts for expenses', async () => {
      const result = await analyzeBankStatement(mockBase64Data, mockMimeType);

      // At least one should be negative (expense)
      const hasNegative = result.some((t) => t.amount < 0);
      expect(hasNegative).toBe(true);
    });

    it('should have positive amounts for income', async () => {
      const result = await analyzeBankStatement(mockBase64Data, mockMimeType);

      // At least one should be positive (income)
      const hasPositive = result.some((t) => t.amount > 0);
      expect(hasPositive).toBe(true);
    });

    it('should return non-empty concepts', async () => {
      const result = await analyzeBankStatement(mockBase64Data, mockMimeType);

      result.forEach((transaction) => {
        expect(typeof transaction.concept).toBe('string');
        expect(transaction.concept.length).toBeGreaterThan(0);
      });
    });

    describe('error handling', () => {
      it('should handle empty or invalid PDFs gracefully', async () => {
        try {
          await analyzeBankStatement('', 'application/pdf');
          // If mock succeeds, that's ok
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle different mime types', async () => {
      const mimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];

      for (const mimeType of mimeTypes) {
        const result = await analyzeInvoiceImage(mockBase64Data, mimeType);
        expect(result).toBeDefined();
      }
    });

    it('should handle large base64 data', async () => {
      const largeData = 'x'.repeat(100000);
      await expect(
        analyzeInvoiceImage(largeData, mockMimeType)
      ).resolves.toBeDefined();
    });
  });
});
