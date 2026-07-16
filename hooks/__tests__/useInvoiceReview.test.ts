import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { normalizeVatRate, useInvoiceReview } from '../useInvoiceReview';
import type { Invoice, QueueItem } from '../../types';

const baseInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  number: 'F-001',
  date: '2026-07-01',
  issuerName: 'Proveedor SA',
  issuerNif: 'B12345678',
  baseAmount: 100,
  vatRate: 21,
  vatAmount: 21,
  totalAmount: 121,
  type: 'EXPENSE',
  status: 'PENDING',
  history: [],
  ...overrides,
});

const makeQueueItem = (result: Invoice): QueueItem => ({
  id: 'q-1',
  fileName: 'factura.pdf',
  mimeType: 'application/pdf',
  fileSize: 1024,
  uploadType: 'INVOICE',
  status: 'COMPLETED',
  progress: 100,
  timestamp: Date.now(),
  result,
  storageFileId: 'file-1',
});

describe('normalizeVatRate', () => {
  it('converts Gemini decimal rates to percent', () => {
    expect(normalizeVatRate(0.21)).toBe(21);
    expect(normalizeVatRate(0.1)).toBe(10);
    expect(normalizeVatRate(0.04)).toBe(4);
  });

  it('leaves percent rates and zero unchanged', () => {
    expect(normalizeVatRate(21)).toBe(21);
    expect(normalizeVatRate(10)).toBe(10);
    expect(normalizeVatRate(0)).toBe(0);
  });
});

describe('useInvoiceReview — BUG-AI-001 vatRate', () => {
  const opts = () => ({
    onInvoiceAdded: vi.fn(),
    removeFromQueue: vi.fn(),
    showToast: vi.fn(),
  });

  it('normalises decimal vatRate when starting review', () => {
    const { result } = renderHook(() => useInvoiceReview(opts()));

    act(() => {
      result.current.startInvoiceReview(
        makeQueueItem(baseInvoice({
          issuerNif: '',
          vatRate: 0.21,
          vatAmount: 0.21,
          totalAmount: 100.21,
        }))
      );
    });

    expect(result.current.preview?.vatRate).toBe(21);
    expect(result.current.preview?.vatAmount).toBe(21);
    expect(result.current.preview?.totalAmount).toBe(121);
  });

  it('normalises decimal vatRate on confirm even if the user never edits the field', () => {
    const onInvoiceAdded = vi.fn();
    const removeFromQueue = vi.fn();

    const { result } = renderHook(() =>
      useInvoiceReview({
        onInvoiceAdded,
        removeFromQueue,
        showToast: vi.fn(),
      })
    );

    act(() => {
      result.current.startInvoiceReview(
        makeQueueItem(baseInvoice({
          issuerNif: '',
          vatRate: 0.21,
          vatAmount: 0.21,
          totalAmount: 100.21,
        }))
      );
    });

    act(() => {
      result.current.confirmInvoice(false);
    });

    expect(onInvoiceAdded).toHaveBeenCalledTimes(1);
    const persisted = onInvoiceAdded.mock.calls[0][0] as Invoice;
    expect(persisted.vatRate).toBe(21);
    expect(persisted.vatAmount).toBe(21);
    expect(persisted.totalAmount).toBe(121);
    expect(persisted.status).toBe('PENDING');
    expect(removeFromQueue).toHaveBeenCalledWith('q-1');
  });

  it('recalculates amounts when editing vatRate as percent', () => {
    const { result } = renderHook(() => useInvoiceReview(opts()));

    act(() => {
      result.current.startInvoiceReview(makeQueueItem(baseInvoice({ issuerNif: '' })));
    });

    act(() => {
      result.current.handleFieldChange('vatRate', 10);
    });

    expect(result.current.preview?.vatRate).toBe(10);
    expect(result.current.preview?.vatAmount).toBe(10);
    expect(result.current.preview?.totalAmount).toBe(110);
  });
});
