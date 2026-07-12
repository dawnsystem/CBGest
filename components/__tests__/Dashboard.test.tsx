import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from '../Dashboard';
import { ToastProvider } from '../Toast';
import type { ReactNode } from 'react';
import type { AppSettings, Invoice } from '../../types';

const pdfMocks = vi.hoisted(() => ({
  generatePartnerCertificate: vi.fn(() => new Blob(['pdf'])),
  downloadPDF: vi.fn(),
}));

vi.mock('../../services/pdfService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/pdfService')>();
  return {
    ...actual,
    generatePartnerCertificate: pdfMocks.generatePartnerCertificate,
    downloadPDF: pdfMocks.downloadPDF,
  };
});

vi.mock('../../context/FiscalYearContext', () => ({
  useFiscalYear: () => ({
    activeFiscalYear: {
      id: 'local-fy-2026',
      appwriteId: 'fy-2026',
      year: 2026,
      status: 'OPEN',
    },
    isReadOnly: false,
  }),
}));

vi.mock('../ChartWrapper', () => ({
  ChartWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('recharts', () => ({
  BarChart: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Bar: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
}));

vi.mock('../ExpensesByApartment', () => ({
  ExpensesByApartment: () => <div />,
}));

vi.mock('../ExpenseProjections', () => ({
  ExpenseProjections: () => <div />,
}));

vi.mock('../ProfitabilityByApartment', () => ({
  ProfitabilityByApartment: () => <div />,
}));

vi.mock('../PartnerTaxForm', () => ({
  PartnerTaxForm: () => <div />,
}));

const settings: AppSettings = {
  cbName: 'CB Test',
  nif: 'B12345678',
  fiscalRegime: 'GENERAL',
  vatObligation: true,
  partners: [
    {
      id: 'partner-1',
      name: 'Ana',
      nif: '12345678Z',
      participation: 100,
      taxInfo: {
        birthYear: 1980,
        disabilityLevel: 'NONE',
        otherWorkIncome: 0,
        otherActivitiesIncome: 0,
        numberOfPayers: 1,
        secondPayerAmount: 0,
        taxResidency: 'CATALUÑA',
        maritalStatus: 'SINGLE',
        jointDeclaration: false,
        childrenUnder3: 0,
        childrenFrom3To25: 0,
        childrenWithDisability: 0,
        ascendantsOver65: 0,
        ascendantsOver75: 0,
        ascendantsWithDisability: 0,
        deductibleExpenses: 0,
        pensionContributions: 0,
      },
    },
  ],
  dataConfig: {
    type: 'APPWRITE',
    autoBackup: false,
    appwriteProjectId: 'cbgest',
    appwriteDatabaseId: 'db',
    appwriteBucketId: 'bucket',
    appwriteEndpoint: 'https://example.test',
  },
};

const invoices: Invoice[] = [
  {
    id: 'income-2026',
    number: 'F-2026-001',
    date: '2026-01-15',
    issuerName: 'Cliente',
    issuerNif: 'B11111111',
    baseAmount: 1000,
    vatRate: 21,
    vatAmount: 210,
    totalAmount: 1210,
    type: 'INCOME',
    status: 'PROCESSED',
    fiscalYearId: 'fy-2026',
    history: [],
  },
  {
    id: 'expense-2026',
    number: 'F-2026-002',
    date: '2026-02-15',
    issuerName: 'Proveedor',
    issuerNif: 'B22222222',
    baseAmount: 200,
    vatRate: 21,
    vatAmount: 42,
    totalAmount: 242,
    type: 'EXPENSE',
    status: 'PROCESSED',
    fiscalYearId: 'fy-2026',
    history: [],
  },
  {
    id: 'outside-period',
    number: 'F-2025-999',
    date: '2025-12-31',
    issuerName: 'Cliente fuera de periodo',
    issuerNif: 'B33333333',
    baseAmount: 10000,
    vatRate: 21,
    vatAmount: 2100,
    totalAmount: 12100,
    type: 'INCOME',
    status: 'PROCESSED',
    fiscalYearId: 'fy-2026',
    history: [],
  },
];

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the active fiscal period tax result for partner PDF drafts', () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <Dashboard
            invoices={invoices}
            settings={settings}
            apartments={[]}
            recurringExpenses={[]}
          />
        </ToastProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Borrador PDF/i }));

    expect(pdfMocks.generatePartnerCertificate).toHaveBeenCalledWith(
      settings.partners[0],
      settings,
      800,
      2026
    );
    expect(pdfMocks.downloadPDF).toHaveBeenCalledTimes(1);
  });
});
