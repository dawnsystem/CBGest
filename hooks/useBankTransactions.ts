/**
 * @fileoverview Hook para gestión de transacciones bancarias
 * @description Encapsula la lógica de estado y operaciones de transacciones bancarias
 */

import { useState, useCallback, Dispatch, SetStateAction } from 'react';
import { BankTransaction, AccountingEntry, AppSettings } from '../types';
import * as appwriteService from '../services/appwriteService';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';

interface UseBankTransactionsOptions {
  settings: AppSettings;
  showError: (message: string, autoClearMs?: number) => void;
  onAddEntry: (entry: AccountingEntry) => void;
  onUpdateEntry: (entry: AccountingEntry) => Promise<void>;
  getAccountingEntries: () => AccountingEntry[];
}

interface UseBankTransactionsReturn {
  bankTransactions: BankTransaction[];
  setBankTransactions: Dispatch<SetStateAction<BankTransaction[]>>;
  handleAddBankTransactions: (txs: BankTransaction[]) => Promise<void>;
  handleUpdateBankTransaction: (transaction: BankTransaction) => Promise<void>;
  handleCreateEntryFromTransaction: (tx: BankTransaction) => void;
  handleReconcileTransaction: (
    sourceId: string,
    matchedEntryId: string,
    sourceType: 'IMPORTED' | 'ACCOUNTING'
  ) => Promise<void>;
}

export function useBankTransactions(options: UseBankTransactionsOptions): UseBankTransactionsReturn {
  const { settings, showError, onAddEntry, onUpdateEntry, getAccountingEntries } = options;
  const { user } = useAuth();
  const { addNotification } = useNotifications();

  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);

  const handleAddBankTransactions = useCallback(async (txs: BankTransaction[]) => {
    const txsWithAudit: BankTransaction[] = txs.map(tx => ({
      ...tx,
      createdBy: user?.$id,
      createdByName: user?.name,
      createdAt: new Date().toISOString()
    }));
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
        console.log(`✅ ${savedTransactions.length} transacciones guardadas en Appwrite`);
      } catch (error: unknown) {
        setBankTransactions(prev => prev.filter(t => !txIds.includes(t.id)));
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al guardar transacciones bancarias: ${errorMessage}. Los cambios no se han guardado.`);
        console.error('Error saving transactions to Appwrite:', error);
      }
    }
  }, [user, settings, showError]);

  const handleUpdateBankTransaction = useCallback(async (transaction: BankTransaction) => {
    setBankTransactions(prev => prev.map(t => t.id === transaction.id ? transaction : t));

    if (settings.dataConfig?.type === 'APPWRITE') {
      try {
        const transactionToUpdate = {
          ...transaction,
          appwriteId: transaction.appwriteId || transaction.id
        };
        await appwriteService.databaseService.updateTransaction(transactionToUpdate);
        console.log('✅ Transacción actualizada en Appwrite:', transactionToUpdate.appwriteId);
      } catch (error) {
        console.error('Error updating transaction in Appwrite:', error);
      }
    }
  }, [settings]);

  const handleCreateEntryFromTransaction = useCallback((tx: BankTransaction) => {
    const accountCode = tx.amount < 0 ? '626' : '769';
    const accountName = tx.amount < 0 ? 'Servicios bancarios' : 'Ingresos financieros';
    const debit = tx.amount < 0 ? Math.abs(tx.amount) : 0;
    const credit = tx.amount > 0 ? tx.amount : 0;
    
    const newEntry: AccountingEntry = {
      id: `BANK-${tx.id}`,
      date: tx.date,
      concept: tx.concept,
      lines: [{ accountCode, accountName, debit, credit }],
      // Legacy fields for compatibility
      accountCode,
      accountName,
      debit,
      credit,
      reconciled: true
    };
    onAddEntry(newEntry);

    handleUpdateBankTransaction({
      ...tx,
      status: 'MATCHED',
      reconciledWithEntryId: newEntry.id
    });

    alert("Asiento creado. Ve a 'Libros Contables' para editar la cuenta si es necesario.");
  }, [onAddEntry, handleUpdateBankTransaction]);

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

      console.log('✅ Reconciliation completed (IMPORTED):', sourceId, '<->', matchedEntryId);
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

      console.log('✅ Reconciliation completed (ACCOUNTING):', sourceId, '<->', matchedEntryId);
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
