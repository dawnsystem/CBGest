/**
 * @fileoverview Hook for managing invoice review state in InvoiceUploader — DEBT-008.
 * Extracted to separate logic from the UI layer (terrain for SEC-007 sanitization).
 *
 * Handles:
 *   - Review item and preview state
 *   - Field editing with amount recalculation
 *   - NIF validation and user override
 *   - Apartment assignment
 *   - Confirmation and cancellation
 */

import { useState } from 'react';
import { Invoice, QueueItem } from '../types';
import { isValidNIF } from '../utils/validators';
import { ACCOUNT_PLAN } from '../utils/accountingPlan';

export interface UseInvoiceReviewOptions {
  onInvoiceAdded: (invoice: Invoice) => void;
  removeFromQueue: (id: string) => void;
  showToast: (message: string, type: 'warning' | 'error' | 'success' | 'info') => void;
}

export function useInvoiceReview({
  onInvoiceAdded,
  removeFromQueue,
  showToast,
}: UseInvoiceReviewOptions) {
  const [reviewItem, setReviewItem] = useState<QueueItem | null>(null);
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [nifError, setNifError] = useState(false);
  const [forceAcceptNif, setForceAcceptNif] = useState(false);
  const [selectedApartmentId, setSelectedApartmentId] = useState<string | null>(null);

  const startInvoiceReview = (item: QueueItem) => {
    if (item.uploadType !== 'INVOICE' || !item.result) return;

    setReviewItem(item);

    // Auto-map suggested account code to "Code - Name" format
    let category = '';
    const suggestedCode = (item.result as unknown as Record<string, unknown>).suggestedAccountCode as string | undefined;
    if (suggestedCode) {
      const match = ACCOUNT_PLAN.find(a => a.code === suggestedCode);
      category = match
        ? `${match.code} - ${match.name}`
        : `${suggestedCode} - (Cuenta detectada)`;
    }

    const initialPreview = { ...item.result, category };
    setPreview(initialPreview);
    setNifError(initialPreview.issuerNif ? !isValidNIF(initialPreview.issuerNif) : false);
    setForceAcceptNif(false);
    setSelectedApartmentId(null);
  };

  const handleFieldChange = (field: keyof Invoice, value: string | number) => {
    if (!preview) return;

    const updated = { ...preview, [field]: value };

    if (field === 'baseAmount' || field === 'vatRate') {
      const base = field === 'baseAmount' ? Number(value) : updated.baseAmount;
      const rawRate = field === 'vatRate' ? Number(value) : updated.vatRate;
      // BUG-014: normalise vatRate — Gemini may return decimal (0.21) instead of percent (21)
      const rate = rawRate > 0 && rawRate <= 1 ? rawRate * 100 : rawRate;
      updated.vatAmount = base * (rate / 100);
      updated.totalAmount = base + updated.vatAmount;
    }

    setPreview(updated);

    if (field === 'issuerNif') {
      const isValid = isValidNIF(value as string);
      setNifError(!isValid);
      if (isValid) setForceAcceptNif(false);
    }
  };

  const confirmInvoice = (markAsProcessed: boolean) => {
    if (!preview || !reviewItem) return;

    if (nifError && !forceAcceptNif) {
      showToast(
        "El NIF del emisor es inválido. Por favor, corrígelo o marca la casilla 'Forzar aceptación' si estás seguro.",
        'warning'
      );
      return;
    }

    const finalInvoice: Invoice = {
      ...preview,
      apartmentId: selectedApartmentId || undefined,
      status: markAsProcessed ? 'PROCESSED' : 'PENDING',
      appwriteFileId: reviewItem.storageFileId,
      fileType: reviewItem.mimeType,
      history: [
        ...preview.history,
        {
          date: new Date().toISOString(),
          action: markAsProcessed
            ? 'Factura procesada y asiento contable creado'
            : 'Factura guardada como borrador (pendiente de revisión)',
          user: 'Admin Gestor',
        },
      ],
    };

    onInvoiceAdded(finalInvoice);
    removeFromQueue(reviewItem.id);
    setReviewItem(null);
    setPreview(null);
  };

  const cancelReview = () => {
    setReviewItem(null);
    setPreview(null);
  };

  return {
    reviewItem,
    preview,
    nifError,
    forceAcceptNif,
    setForceAcceptNif,
    selectedApartmentId,
    setSelectedApartmentId,
    startInvoiceReview,
    handleFieldChange,
    confirmInvoice,
    cancelReview,
  };
}
