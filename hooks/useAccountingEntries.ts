/**
 * @fileoverview Hook para gestión de asientos contables
 * @description Encapsula la lógica de estado y operaciones CRUD de asientos contables
 */

import { useState, useCallback, Dispatch, SetStateAction } from 'react';
import { AccountingEntry, AppSettings } from '../types';
import * as appwriteService from '../services/appwriteService';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';

interface UseAccountingEntriesOptions {
  settings: AppSettings;
  showError: (message: string, autoClearMs?: number) => void;
}

interface UseAccountingEntriesReturn {
  accountingEntries: AccountingEntry[];
  setAccountingEntries: Dispatch<SetStateAction<AccountingEntry[]>>;
  handleAddEntry: (entry: AccountingEntry) => Promise<void>;
  handleUpdateEntry: (entry: AccountingEntry) => Promise<void>;
  handleDeleteEntry: (id: string) => Promise<void>;
}

export function useAccountingEntries(options: UseAccountingEntriesOptions): UseAccountingEntriesReturn {
  const { settings, showError } = options;
  const { user } = useAuth();
  const { addNotification } = useNotifications();

  const [accountingEntries, setAccountingEntries] = useState<AccountingEntry[]>([]);

  const handleAddEntry = useCallback(async (entry: AccountingEntry) => {
    const entryWithAudit: AccountingEntry = {
      ...entry,
      createdBy: entry.createdBy || user?.$id,
      createdByName: entry.createdByName || user?.name,
      createdAt: entry.createdAt || new Date().toISOString()
    };

    setAccountingEntries(prev => [entryWithAudit, ...prev]);

    if (settings.dataConfig?.type === 'APPWRITE') {
      try {
        const saved = await appwriteService.createEntry(entryWithAudit);
        setAccountingEntries(prev => prev.map(e => e.id === entryWithAudit.id ? saved : e));
      } catch (error: unknown) {
        setAccountingEntries(prev => prev.filter(e => e.id !== entryWithAudit.id));
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al crear asiento: ${errorMessage}. Los cambios no se han guardado.`);
        console.error('Error creating entry in Appwrite:', error);
        return;
      }
    }

    if (user && !entry.id.startsWith('AUTO-')) {
      addNotification({
        type: 'ENTRY_CREATED',
        title: 'Nuevo asiento contable',
        message: `${entry.concept} - ${entry.debit > 0 ? entry.debit.toFixed(2) : entry.credit.toFixed(2)}€`,
        userId: user.$id,
        userName: user.name,
        relatedId: entry.id
      });
    }
  }, [user, settings, addNotification, showError]);

  const handleUpdateEntry = useCallback(async (entry: AccountingEntry) => {
    const oldEntry = accountingEntries.find(e => e.id === entry.id);

    setAccountingEntries(prev => prev.map(e => e.id === entry.id ? entry : e));

    if (settings.dataConfig?.type === 'APPWRITE') {
      try {
        await appwriteService.updateEntry(entry);
      } catch (error: unknown) {
        if (oldEntry) {
          setAccountingEntries(prev => prev.map(e => e.id === entry.id ? oldEntry : e));
        }
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al actualizar asiento: ${errorMessage}. Los cambios no se han guardado.`);
        console.error('Error updating entry in Appwrite:', error);
        return;
      }
    }

    if (user) {
      addNotification({
        type: 'ENTRY_UPDATED',
        title: 'Asiento actualizado',
        message: `${entry.concept}`,
        userId: user.$id,
        userName: user.name,
        relatedId: entry.id
      });
    }
  }, [accountingEntries, settings, user, addNotification, showError]);

  const handleDeleteEntry = useCallback(async (id: string) => {
    const entry = accountingEntries.find(e => e.id === id);

    setAccountingEntries(prev => prev.filter(e => e.id !== id));

    if (settings.dataConfig?.type === 'APPWRITE' && entry) {
      try {
        const docId = entry.appwriteId || entry.id;
        await appwriteService.deleteEntry(docId);
        console.warn('✅ Asiento eliminado de Appwrite:', docId);
      } catch (error: unknown) {
        setAccountingEntries(prev => [entry, ...prev]);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        showError(`Error al eliminar asiento: ${errorMessage}. El asiento no se ha eliminado.`);
        console.error('Error deleting entry from Appwrite:', error);
        return;
      }
    }

    if (user && entry) {
      addNotification({
        type: 'ENTRY_DELETED',
        title: 'Asiento eliminado',
        message: `${entry.concept}`,
        userId: user.$id,
        userName: user.name,
        relatedId: id
      });
    }
  }, [accountingEntries, settings, user, addNotification, showError]);

  return {
    accountingEntries,
    setAccountingEntries,
    handleAddEntry,
    handleUpdateEntry,
    handleDeleteEntry
  };
}
