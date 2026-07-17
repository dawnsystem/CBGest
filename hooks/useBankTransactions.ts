/**
 * @fileoverview Hook para gestión de transacciones bancarias
 * @description Encapsula la lógica de estado y operaciones de transacciones bancarias
 */

import { useState, useCallback, Dispatch, SetStateAction } from 'react';
import { BankTransaction, AccountingEntry, AppSettings, BankStatementImport } from '../types';
import * as appwriteService from '../services/appwriteService';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { generateId } from '../utils/defaults';
import {
  collectExistingLineFingerprints,
  prepareBankImport,
  type BankImportMeta,
  type BankImportResult,
} from '../utils/bankStatementDedup';

interface UseBankTransactionsOptions {
  settings: AppSettings;
  showError: (message: string, autoClearMs?: number) => void;
  onAddEntry: (entry: AccountingEntry) => void;
  onUpdateEntry: (entry: AccountingEntry) => Promise<void>;
  getAccountingEntries: () => AccountingEntry[];
  activeFiscalYearId?: string;
}

interface UseBankTransactionsReturn {
  bankTransactions: BankTransaction[];
  setBankTransactions: Dispatch<SetStateAction<BankTransaction[]>>;
  handleAddBankTransactions: (
    txs: BankTransaction[],
    meta?: BankImportMeta
  ) => Promise<BankImportResult | void>;
  handleUpdateBankTransaction: (transaction: BankTransaction) => Promise<void>;
  handleCreateEntryFromTransaction: (tx: BankTransaction) => void;
  handleReconcileTransaction: (
    sourceId: string,
    matchedEntryId: string,
    sourceType: 'IMPORTED' | 'ACCOUNTING'
  ) => Promise<void>;
}

export function useBankTransactions(options: UseBankTransactionsOptions): UseBankTransactionsReturn {
  const { settings, showError, onAddEntry, onUpdateEntry, getAccountingEntries, activeFiscalYearId } = options;
  const { user } = useAuth();
  const { addNotification } = useNotifications();

  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);

  const handleAddBankTransactions = useCallback(async (
    txs: BankTransaction[],
    meta?: BankImportMeta
  ): Promise<BankImportResult<BankTransaction>> => {
    const importBatchId = generateId();
    const [existingLines, priorImports] = await Promise.all([
      collectExistingLineFingerprints(bankTransactions),
      appwriteService.getBankStatementImports(activeFiscalYearId).catch(() => []),
    ]);
    const existingStatements = new Set(
      priorImports
        .map((row: BankStatementImport) => row.contentFingerprint)
        .filter(Boolean)
    );

    if (meta?.fileSha256) {
      const byFile = await appwriteService.findImportByFileSha256(meta.fileSha256, activeFiscalYearId);
      if (byFile) {
        return {
          toImport: [],
          skippedDuplicates: txs.length,
          isDuplicateStatement: true,
          contentFingerprint: byFile.contentFingerprint,
          message: 'Este extracto ya fue importado (mismo archivo).',
        };
      }
    }

    const prepared = await prepareBankImport(
      txs,
      existingLines,
      existingStatements,
      importBatchId
    );

    if (prepared.isDuplicateStatement || prepared.toImport.length === 0) {
      return prepared;
    }

    const txsWithAudit: BankTransaction[] = prepared.toImport.map((tx) => {
      const source = tx as BankTransaction & { contentFingerprint: string };
      return {
        ...source,
        id: source.id || generateId(),
        status: source.status || 'PENDING',
        fiscalYearId: source.fiscalYearId || activeFiscalYearId,
        contentFingerprint: source.contentFingerprint,
        importBatchId,
        createdBy: user?.$id,
        createdByName: user?.name,
        createdAt: new Date().toISOString(),
      };
    });
    const txIds = txsWithAudit.map(tx => tx.id);

    setBankTransactions(prev => [...prev, ...txsWithAudit]);

    if (settings.dataConfig?.type === 'APPWRITE') {
      try {
        const savedTransactions = await Promise.all(
          txsWithAudit.map(tx => appwriteService.createTransaction(tx))
        );
        setBankTransactions(prev =>
          prev.map(t => {
            const saved = savedTransactions.find(s => s.id === t.id);
            return saved || t;
          })
        );
        await appwriteService.createBankStatementImport({
          id: importBatchId,
          fileSha256: meta?.fileSha256,
          contentFingerprint: prepared.contentFingerprint,
          fiscalYearId: activeFiscalYearId,
          fileName: meta?.fileName,
          transactionCount: txsWithAudit.length,
          importedAt: new Date().toISOString(),
        });
        console.warn(`✅ ${savedTransactions.length} transacciones guardadas en Appwrite`);
      } catch (error: unknown) {
        setBankTransactions(prev => prev.filter(t => !txIds.includes(t.id)));
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al guardar transacciones bancarias: ${errorMessage}. Los cambios no se han guardado.`);
        console.error('Error saving transactions to Appwrite:', error);
        return {
          ...prepared,
          toImport: [],
          message: `Error al guardar transacciones bancarias: ${errorMessage}`,
        };
      }
    } else {
      await appwriteService.createBankStatementImport({
        id: importBatchId,
        fileSha256: meta?.fileSha256,
        contentFingerprint: prepared.contentFingerprint,
        fiscalYearId: activeFiscalYearId,
        fileName: meta?.fileName,
        transactionCount: txsWithAudit.length,
        importedAt: new Date().toISOString(),
      }).catch(() => undefined);
    }

    return {
      ...prepared,
      toImport: txsWithAudit.map((tx) => ({
        ...tx,
        contentFingerprint: tx.contentFingerprint as string,
      })),
      importBatchId,
    };
  }, [user, settings, showError, bankTransactions, activeFiscalYearId]);

  const handleUpdateBankTransaction = useCallback(async (transaction: BankTransaction) => {
    setBankTransactions(prev => prev.map(t => t.id === transaction.id ? transaction : t));

    if (settings.dataConfig?.type === 'APPWRITE') {
      try {
        const transactionToUpdate = {
          ...transaction,
          appwriteId: transaction.appwriteId || transaction.id
        };
        await appwriteService.databaseService.updateTransaction(transactionToUpdate);
        console.warn('✅ Transacción actualizada en Appwrite:', transactionToUpdate.appwriteId);
      } catch (error) {
        console.error('Error updating transaction in Appwrite:', error);
      }
    }
  }, [settings]);

  const handleCreateEntryFromTransaction = useCallback((tx: BankTransaction) => {
    // BUG-008 fix: create a proper double-entry (two lines) instead of a single line
    // with hardcoded category accounts. The bank account (572) is always one leg;
    // the default counter-account (626 or 769) is the other — the user should review
    // and adjust the counter-account in "Libros Contables" as needed.
    const absAmount = Math.abs(tx.amount);
    const isExpense = tx.amount < 0;

    const bankLine = {
      accountCode: '572',
      accountName: 'Bancos e instituciones de crédito c/c',
      debit: isExpense ? 0 : absAmount,
      credit: isExpense ? absAmount : 0,
    };
    const counterLine = {
      accountCode: isExpense ? '626' : '769',
      accountName: isExpense ? 'Servicios bancarios y similares' : 'Otros ingresos financieros',
      debit: isExpense ? absAmount : 0,
      credit: isExpense ? 0 : absAmount,
    };

    // Legacy scalar fields use the counter-account for backward compatibility
    const newEntry: AccountingEntry = {
      id: `BANK-${tx.id}`,
      date: tx.date,
      concept: tx.concept,
      lines: [counterLine, bankLine],
      accountCode: counterLine.accountCode,
      accountName: counterLine.accountName,
      debit: counterLine.debit,
      credit: counterLine.credit,
      reconciled: true
    };
    onAddEntry(newEntry);

    handleUpdateBankTransaction({
      ...tx,
      status: 'MATCHED',
      reconciledWithEntryId: newEntry.id
    });

    showError("Asiento creado. Revisa y ajusta la cuenta de contrapartida en 'Libros Contables' si es necesario.");
  }, [onAddEntry, handleUpdateBankTransaction, showError]);

  const handleReconcileTransaction = useCallback(async (
    sourceId: string,
    matchedEntryId: string,
    sourceType: 'IMPORTED' | 'ACCOUNTING'
  ) => {
    const accountingEntries = getAccountingEntries();
    const matchedEntry = accountingEntries.find(e => e.id === matchedEntryId);
    if (!matchedEntry) {
      console.error('Matched entry not found for reconciliation');
      return;
    }

    if (sourceType === 'IMPORTED') {
      const transaction = bankTransactions.find(t => t.id === sourceId);
      if (!transaction) {
        console.error('Transaction not found for reconciliation');
        return;
      }

      const updatedTransaction: BankTransaction = {
        ...transaction,
        status: 'MATCHED',
        reconciledWithEntryId: matchedEntryId
      };
      await handleUpdateBankTransaction(updatedTransaction);

      const updatedEntry: AccountingEntry = {
        ...matchedEntry,
        reconciled: true
      };
      await onUpdateEntry(updatedEntry);

      if (user) {
        addNotification({
          type: 'ENTRY_UPDATED',
          title: 'Conciliación realizada',
          message: `Transacción "${transaction.concept}" conciliada con asiento "${matchedEntry.concept}"`,
          userId: user.$id,
          userName: user.name,
          relatedId: matchedEntryId
        });
      }

      console.warn('✅ Reconciliation completed (IMPORTED):', sourceId, '<->', matchedEntryId);
    } else {
      const bankEntry = accountingEntries.find(e => e.id === sourceId);
      if (!bankEntry) {
        console.error('Bank entry not found for reconciliation');
        return;
      }

      const updatedBankEntry: AccountingEntry = {
        ...bankEntry,
        reconciled: true
      };
      await onUpdateEntry(updatedBankEntry);

      const updatedMatchedEntry: AccountingEntry = {
        ...matchedEntry,
        reconciled: true
      };
      await onUpdateEntry(updatedMatchedEntry);

      if (user) {
        addNotification({
          type: 'ENTRY_UPDATED',
          title: 'Conciliación realizada',
          message: `Asiento bancario "${bankEntry.concept}" conciliado con "${matchedEntry.concept}"`,
          userId: user.$id,
          userName: user.name,
          relatedId: matchedEntryId
        });
      }

      console.warn('✅ Reconciliation completed (ACCOUNTING):', sourceId, '<->', matchedEntryId);
    }
  }, [bankTransactions, user, addNotification, getAccountingEntries, handleUpdateBankTransaction, onUpdateEntry]);

  return {
    bankTransactions,
    setBankTransactions,
    handleAddBankTransactions,
    handleUpdateBankTransaction,
    handleCreateEntryFromTransaction,
    handleReconcileTransaction
  };
}
