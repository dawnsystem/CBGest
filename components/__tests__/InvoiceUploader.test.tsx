import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceUploader } from '../InvoiceUploader';
import type { AppSettings } from '../../types';

const mockAddToQueue = vi.fn();
const mockRemoveFromQueue = vi.fn();
const mockShowToast = vi.fn();
const mockShowConfirm = vi.fn();
const mockUseIsReadOnly = vi.fn();

vi.mock('../../context/UploadQueueContext', () => ({
  useUploadQueue: () => ({
    queue: [],
    addToQueue: mockAddToQueue,
    removeFromQueue: mockRemoveFromQueue,
  }),
}));

vi.mock('../../hooks/useInvoiceReview', () => ({
  useInvoiceReview: () => ({
    reviewItem: null,
    preview: null,
    nifError: false,
    forceAcceptNif: false,
    setForceAcceptNif: vi.fn(),
    selectedApartmentId: null,
    setSelectedApartmentId: vi.fn(),
    startInvoiceReview: vi.fn(),
    handleFieldChange: vi.fn(),
    confirmInvoice: vi.fn(),
    cancelReview: vi.fn(),
  }),
}));

vi.mock('../../context/FiscalYearContext', () => ({
  useIsReadOnly: () => mockUseIsReadOnly(),
}));

vi.mock('../Toast', () => ({
  useToast: () => ({
    showToast: mockShowToast,
    showConfirm: mockShowConfirm,
  }),
}));

describe('InvoiceUploader', () => {
  const MOCK_FILE_CONTENT = 'mock-pdf-content';
  const settings: AppSettings = {
    cbName: 'CB Test',
    nif: 'B12345678',
    fiscalRegime: 'GENERAL',
    vatObligation: true,
    partners: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockShowConfirm.mockResolvedValue(true);
  });

  it('bloquea adjuntar archivos cuando el ejercicio está cerrado', () => {
    mockUseIsReadOnly.mockReturnValue(true);

    render(
      <InvoiceUploader
        onInvoiceAdded={vi.fn()}
        onBankTransactionsAdded={vi.fn()}
        settings={settings}
        apartments={[]}
      />
    );

    const input = screen.getByLabelText('Seleccionar Archivos') as HTMLInputElement;
    const file = new File([MOCK_FILE_CONTENT], 'factura.pdf', { type: 'application/pdf' });

    expect(input.disabled).toBe(true);
    expect(screen.getByRole('button', { name: /Facturas \/ Tickets/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Extracto Bancario/i })).toBeDisabled();

    input.disabled = false;
    fireEvent.change(input, { target: { files: [file] } });

    expect(mockAddToQueue).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith('Ejercicio cerrado: no se pueden adjuntar documentos.', 'warning');
  });

  it('permite adjuntar archivos cuando el ejercicio está abierto', () => {
    mockUseIsReadOnly.mockReturnValue(false);

    render(
      <InvoiceUploader
        onInvoiceAdded={vi.fn()}
        onBankTransactionsAdded={vi.fn()}
        settings={settings}
        apartments={[]}
      />
    );

    const input = screen.getByLabelText('Seleccionar Archivos') as HTMLInputElement;
    const file = new File([MOCK_FILE_CONTENT], 'factura.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(mockAddToQueue).toHaveBeenCalledWith([file], 'INVOICE');
  });
});
