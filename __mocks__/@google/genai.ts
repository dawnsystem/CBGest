import { vi } from 'vitest';

// Mock Type enum
export const Type = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  OBJECT: 'object',
  ARRAY: 'array',
  INTEGER: 'integer',
};

// Mock response for invoice analysis
const mockInvoiceResponse = {
  number: 'INV-2024-001',
  date: '2024-01-15',
  issuerName: 'Test Supplier S.L.',
  issuerNif: 'B12345678',
  issuerNifType: 'CIF',
  matchedSupplierId: null,
  baseAmount: 1000.00,
  vatRate: 21,
  vatAmount: 210.00,
  totalAmount: 1210.00,
  type: 'EXPENSE',
  suggestedAccountCode: '628',
};

// Mock response for bank statement
const mockBankStatementResponse = [
  {
    date: '2024-01-15',
    concept: 'RECIBO LUZ',
    amount: -150.50,
  },
  {
    date: '2024-01-16',
    concept: 'TRANSF. INQUILINO',
    amount: 800.00,
  },
];

// Mock model with generateContent method
class MockModel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generateContent = vi.fn().mockImplementation(async (config: any) => {
    // Determine response based on schema type
    const isArray = config.config?.responseSchema?.type === Type.ARRAY;
    const responseData = isArray ? mockBankStatementResponse : mockInvoiceResponse;

    return {
      text: JSON.stringify(responseData),
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify(responseData),
                },
              ],
            },
          },
        ],
      },
    };
  });
}

// Mock models object
class MockModels {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generateContent = vi.fn().mockImplementation(async (config: any) => {
    const model = new MockModel();
    return model.generateContent(config);
  });
}

// Mock GoogleGenAI class
export class GoogleGenAI {
  apiKey: string;
  models: MockModels;

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey;
    this.models = new MockModels();
  }
}

// Helper to set custom mock responses
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const __setMockInvoiceResponse = (response: any) => {
  Object.assign(mockInvoiceResponse, response);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const __setMockBankStatementResponse = (response: any[]) => {
  mockBankStatementResponse.length = 0;
  mockBankStatementResponse.push(...response);
};

export const __resetMocks = () => {
  Object.assign(mockInvoiceResponse, {
    number: 'INV-2024-001',
    date: '2024-01-15',
    issuerName: 'Test Supplier S.L.',
    issuerNif: 'B12345678',
    issuerNifType: 'CIF',
    matchedSupplierId: null,
    baseAmount: 1000.00,
    vatRate: 21,
    vatAmount: 210.00,
    totalAmount: 1210.00,
    type: 'EXPENSE',
    suggestedAccountCode: '628',
  });

  mockBankStatementResponse.length = 0;
  mockBankStatementResponse.push(
    {
      date: '2024-01-15',
      concept: 'RECIBO LUZ',
      amount: -150.50,
    },
    {
      date: '2024-01-16',
      concept: 'TRANSF. INQUILINO',
      amount: 800.00,
    }
  );
};

export default {
  GoogleGenAI,
  Type,
};
