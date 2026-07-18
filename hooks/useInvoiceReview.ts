/**
 * @fileoverview Hook for managing invoice review state in InvoiceUploader — DEBT-008.
 * Extracted to separate logic from the UI layer (terrain for SEC-007 sanitization).
 *
 * Handles:
 *   - Review item and preview state
 *   - Field editing with amount recalculation
 *   - NIF validation and user override
 *   - Duplicate detection override
 *   - Apartment assignment
 *   - Confirmation and cancellation
 */

import { useState } from 'react';
import { Invoice, QueueItem } from '../types';
import { isValidNIF } from '../utils/validators';
import { ACCOUNT_PLAN } from '../utils/accountingPlan';
import { createLogger } from '../services/logger';
import { storageService } from '../services/appwriteService';
import {
  buildContentFingerprint,
  computeFileSha256,
  formatDuplicateConfirmMessage,
} from '../utils/invoiceDedup';

const invoiceReviewLogger = createLogger('InvoiceReview');

export interface UseInvoiceReviewOptions {
  onInvoiceAdded: (invoice: Invoice) => void;
  removeFromQueue: (id: string) => void;
  showToast: (message: string, type: 'warning' | 'error' | 'success' | 'info') => void;
  showConfirm: (message: string) => Promise<boolean>;
}

/**
 * Normalises Gemini vatRate values: decimals like `0.21` become percent `21`.
 * Values already in percent (or 0) are returned unchanged.
 *
 * @param rawRate - Rate from Gemini or the UI (0, 0.21, 4, 10, 21, …)
 * @returns Percent form suitable for Invoice.vatRate (e.g. 21)
 * @example
 * normalizeVatRate(0.21); // 21
 * normalizeVatRate(21);   // 21
 */
export function normalizeVatRate(rawRate: number): number {
  const rate = Number(rawRate);
  if (!Number.isFinite(rate)) return 0;
  return rate > 0 && rate <= 1 ? rate * 100 : rate;
}

/**
 * Recalculates vatAmount and totalAmount from base and rate (percent).
 *
 * @param baseAmount - Taxable base
 * @param vatRatePercent - IVA in percent (e.g. 21)
 * @returns Partial invoice fields with vatAmount and totalAmount
 */
function recalcAmounts(baseAmount: number, vatRatePercent: number): Pick<Invoice, 'vatRate' | 'vatAmount' | 'totalAmount'> {
  const vatRate = normalizeVatRate(vatRatePercent);
  const vatAmount = baseAmount * (vatRate / 100);
  return {
    vatRate,
    vatAmount,
    totalAmount: baseAmount + vatAmount,
  };
}

/**
 * Invoice review state machine for InvoiceUploader.
 *
 * @param options - Callbacks for persist, queue removal and toasts
 * @returns Review state and handlers
 */
export function useInvoiceReview({
  onInvoiceAdded,
  removeFromQueue,
  showToast,
  showConfirm,
}: UseInvoiceReviewOptions) {
  const [reviewItem, setReviewItem] = useState<QueueItem | null>(null);
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [nifError, setNifError] = useState(false);
  const [forceAcceptNif, setForceAcceptNif] = useState(false);
  const [selectedApartmentId, setSelectedApartmentId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  /**
   * Opens the review UI for a completed INVOICE queue item.
   * Normalises vatRate immediately so the preview never shows Gemini decimals (BUG-AI-001).
   *
   * @param item - Queue item with Gemini result
   */
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

    const baseAmount = Number(item.result.baseAmount) || 0;
    const amounts = recalcAmounts(baseAmount, Number(item.result.vatRate));
    const initialPreview: Invoice = {
      ...item.result,
      category,
      baseAmount,
      ...amounts,
    };
    setPreview(initialPreview);
    setNifError(initialPreview.issuerNif ? !isValidNIF(initialPreview.issuerNif) : false);
    setForceAcceptNif(false);
    setSelectedApartmentId(null);
  };

  /**
   * Updates a preview field; recalculates amounts when base or vatRate changes.
   *
   * @param field - Invoice field key
   * @param value - New value
   */
  const handleFieldChange = (field: keyof Invoice, value: string | number) => {
    if (!preview) return;

    const updated: Invoice = { ...preview, [field]: value };

    if (field === 'baseAmount' || field === 'vatRate') {
      const base = field === 'baseAmount' ? Number(value) : updated.baseAmount;
      const amounts = recalcAmounts(base, field === 'vatRate' ? Number(value) : updated.vatRate);
      Object.assign(updated, amounts);
    }

    setPreview(updated);

    if (field === 'issuerNif') {
      const isValid = isValidNIF(value as string);
      setNifError(!isValid);
      if (isValid) setForceAcceptNif(false);
    }
  };

  /**
   * Persists the reviewed invoice. Re-normalises vatRate so a raw Gemini
   * decimal cannot slip through if the user never edited the field (BUG-AI-001).
   *
   * @param markAsProcessed - If true, status becomes PROCESSED; otherwise PENDING
   */
  const confirmInvoice = async (markAsProcessed: boolean) => {
    if (!preview || !reviewItem || isConfirming) return;

    if (nifError && !forceAcceptNif) {
      showToast(
        "El NIF del emisor es inválido. Por favor, corrígelo o marca la casilla 'Forzar aceptación' si estás seguro.",
        'warning'
      );
      return;
    }

    const amounts = recalcAmounts(Number(preview.baseAmount) || 0, Number(preview.vatRate));
    const historyEntries = [
      ...preview.history,
      {
        date: new Date().toISOString(),
        action: markAsProcessed
          ? 'Factura procesada y asiento contable creado'
          : 'Factura guardada como borrador (pendiente de revisión)',
        user: 'Admin Gestor',
      },
    ];

    // SEC-009: audit trail when NIF validation is forcibly bypassed
    if (nifError && forceAcceptNif) {
      const forcedNif = preview.issuerNif || '(vacío)';
      invoiceReviewLogger.warn(
        `SEC-009: NIF forzado sin validación — emisor="${preview.issuerName || '?'}" nif="${forcedNif}" file="${reviewItem.fileName}"`
      );
      historyEntries.push({
        date: new Date().toISOString(),
        action: `NIF inválido aceptado forzosamente: ${forcedNif}`,
        user: 'Admin Gestor',
      });
    }

    if (reviewItem.duplicateMatch) {
      const confirmed = await showConfirm(formatDuplicateConfirmMessage(reviewItem.duplicateMatch));
      if (!confirmed) return;

      const { summary, kind } = reviewItem.duplicateMatch;
      historyEntries.push({
        date: new Date().toISOString(),
        action: `Duplicado aceptado (${kind}): ${summary.issuerName} nº ${summary.number} (${summary.date})`,
        user: 'Admin Gestor',
      });
      invoiceReviewLogger.warn(
        `DEDUP-OVERRIDE: kind=${kind} existing=${reviewItem.duplicateMatch.existingInvoiceId} file="${reviewItem.fileName}"`
      );
    }

    setIsConfirming(true);
    try {
      let storageFileId = reviewItem.storageFileId;
      if (!storageFileId && reviewItem.localFile) {
        const shortTimestamp = Date.now().toString(36).slice(-8);
        const randomPart = Math.random().toString(36).substring(2, 10);
        const fileId = `inv_${shortTimestamp}_${randomPart}`;
        storageFileId = await storageService.uploadFile(reviewItem.localFile, fileId);
      }

      let fileHash = reviewItem.fileHash || preview.fileHash;
      if (!fileHash && reviewItem.localFile) {
        try {
          fileHash = await computeFileSha256(reviewItem.localFile);
        } catch (error) {
          invoiceReviewLogger.warn(
            `No se pudo calcular SHA-256 de ${reviewItem.fileName}:`,
            error
          );
        }
      }

      const contentFingerprint = buildContentFingerprint({
        issuerNif: preview.issuerNif,
        number: preview.number,
        date: preview.date,
        totalAmount: amounts.totalAmount,
      });

      const finalInvoice: Invoice = {
        ...preview,
        ...amounts,
        apartmentId: selectedApartmentId || undefined,
        status: markAsProcessed ? 'PROCESSED' : 'PENDING',
        appwriteFileId: storageFileId,
        fileType: reviewItem.mimeType,
        fileHash,
        contentFingerprint,
        history: historyEntries,
      };

      onInvoiceAdded(finalInvoice);
      removeFromQueue(reviewItem.id);
      setReviewItem(null);
      setPreview(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      showToast(`Error al guardar factura: ${message}`, 'error');
    } finally {
      setIsConfirming(false);
    }
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
    isConfirming,
    startInvoiceReview,
    handleFieldChange,
    confirmInvoice,
    cancelReview,
  };
}
