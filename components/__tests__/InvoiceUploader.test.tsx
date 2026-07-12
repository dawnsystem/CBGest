import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceUploader } from '../InvoiceUploader';

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
        settings={{} as never}
        apartments={[]}
      />
    );

    const input = screen.getByLabelText('Seleccionar Archivos') as HTMLInputElement;
    expect(input.disabled).toBe(true);

    fireEvent.change(input, { target: { files: [new File(['x'], 'factura.pdf', { type: 'application/pdf' })] } });

    expect(mockAddToQueue).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith('Ejercicio cerrado: no se pueden adjuntar documentos.', 'warning');
  });

  it('permite adjuntar archivos cuando el ejercicio está abierto', () => {
    mockUseIsReadOnly.mockReturnValue(false);

    render(
      <InvoiceUploader
        onInvoiceAdded={vi.fn()}
        onBankTransactionsAdded={vi.fn()}
        settings={{} as never}
        apartments={[]}
      />
    );

    const input = screen.getByLabelText('Seleccionar Archivos') as HTMLInputElement;
    const file = new File(['x'], 'factura.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(mockAddToQueue).toHaveBeenCalledWith([file], 'INVOICE');
  });
});
