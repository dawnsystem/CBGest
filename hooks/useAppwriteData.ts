/**
 * @fileoverview Hook principal para gestión de datos con Appwrite
 * @description Integra todas las operaciones de datos con Appwrite,
 *              incluyendo Realtime para sincronización automática.
 *
 * APPWRITE FEATURES USED:
 * - Database: CRUD operations with retry logic
 * - Storage: File uploads for invoices
 * - Realtime: Live updates via subscriptions
 * - Rate limiting: Via protectedDatabase layer
 */

import { useState, useEffect, useCallback, useRef, Dispatch, SetStateAction } from 'react';
import {
  Invoice, AccountingEntry, BankTransaction, Supplier,
  Apartment, RecurringExpense, Reservation, AppSettings
} from '../types';
import * as appwriteService from '../services/appwriteService';
import { useAuth, useSessionReady } from '../context/AuthContext';
import { APPWRITE_CONFIG } from '../config/appwrite';
import { dataLogger } from '../services/logger';

interface UseAppwriteDataOptions {
  onError: (message: string) => void;
  onConnectionChange?: (healthy: boolean) => void;
}

interface DataState {
  invoices: Invoice[];
  entries: AccountingEntry[];
  transactions: BankTransaction[];
  suppliers: Supplier[];
  apartments: Apartment[];
  recurringExpenses: RecurringExpense[];
  reservations: Reservation[];
  settings: AppSettings;
}

interface UseAppwriteDataReturn extends DataState {
  isLoading: boolean;
  isConnected: boolean;
  refreshData: () => Promise<void>;
  setInvoices: Dispatch<SetStateAction<Invoice[]>>;
  setEntries: Dispatch<SetStateAction<AccountingEntry[]>>;
  setTransactions: Dispatch<SetStateAction<BankTransaction[]>>;
  setSuppliers: Dispatch<SetStateAction<Supplier[]>>;
  setApartments: Dispatch<SetStateAction<Apartment[]>>;
  setRecurringExpenses: Dispatch<SetStateAction<RecurringExpense[]>>;
  setReservations: Dispatch<SetStateAction<Reservation[]>>;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
}

const defaultSettings: AppSettings = {
  cbName: 'Nueva Comunidad de Bienes',
  nif: '',
  fiscalRegime: 'ALQUILER_EXENTO',
  vatObligation: false,
  partners: [{ id: '1', name: 'Socio Fundador', nif: '', participation: 100 }],
  dataConfig: {
    type: 'APPWRITE',
    autoBackup: false,
    appwriteProjectId: APPWRITE_CONFIG.projectId,
    appwriteDatabaseId: APPWRITE_CONFIG.databaseId,
    appwriteBucketId: APPWRITE_CONFIG.bucketId,
    appwriteEndpoint: APPWRITE_CONFIG.endpoint
  }
};

/**
 * Hook that manages all data operations with Appwrite
 * Includes real-time synchronization and offline support
 */
export function useAppwriteData(options: UseAppwriteDataOptions): UseAppwriteDataReturn {
  const { onError, onConnectionChange } = options;
  const { user } = useAuth();
  const sessionReady = useSessionReady();

  // Data state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('gestcb_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...defaultSettings, ...parsed };
      } catch {
        return defaultSettings;
      }
    }
    return defaultSettings;
  });

  // Connection state
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  // Ref to track if data has been loaded
  const dataLoadedRef = useRef(false);

  // Load all data from Appwrite
  const loadData = useCallback(async () => {
    if (!user || !sessionReady) return;

    setIsLoading(true);
    try {
      dataLogger.loading('Loading data from Appwrite...');

      // Perform health check first
      const health = await appwriteService.performHealthCheck();
      setIsConnected(health.connected && health.authenticated);
      onConnectionChange?.(health.connected && health.authenticated);

      if (!health.connected) {
        onError('No se puede conectar con el servidor');
        return;
      }

      // Load all data in parallel
      const [
        remoteInvoices,
        remoteEntries,
        remoteTransactions,
        remoteSuppliers,
        remoteApartments,
        remoteRecurring,
        remoteReservations,
        remoteSettings
      ] = await Promise.all([
        appwriteService.fetchInvoices().catch(() => []),
        appwriteService.fetchEntries().catch(() => []),
        appwriteService.fetchTransactions().catch(() => []),
        appwriteService.fetchSuppliers().catch(() => []),
        appwriteService.fetchApartments().catch(() => []),
        appwriteService.fetchRecurringExpenses().catch(() => []),
        appwriteService.fetchReservations().catch(() => []),
        appwriteService.syncSettings(settings)
      ]);

      // Update state
      setInvoices(remoteInvoices);
      setEntries(remoteEntries);
      setTransactions(remoteTransactions);
      setSuppliers(remoteSuppliers);
      setApartments(remoteApartments);
      setRecurringExpenses(remoteRecurring);
      setReservations(remoteReservations);

      if (remoteSettings) {
        const mergedSettings = {
          ...remoteSettings,
          partners: remoteSettings.partners || defaultSettings.partners,
          dataConfig: settings.dataConfig
        };
        setSettings(mergedSettings);
        localStorage.setItem('gestcb_settings', JSON.stringify(mergedSettings));
      }

      dataLoadedRef.current = true;
      dataLogger.success(`Data loaded: ${remoteInvoices.length} invoices, ${remoteEntries.length} entries`);
    } catch (error) {
      dataLogger.error('Error loading data:', error);
      onError('Error al cargar datos desde Appwrite');
    } finally {
      setIsLoading(false);
    }
  }, [user, sessionReady, settings, onError, onConnectionChange]);

  // Initial data load
  useEffect(() => {
    if (user && sessionReady && !dataLoadedRef.current) {
      loadData();
    }
  }, [user, sessionReady, loadData]);

  // Realtime subscriptions for live updates
  useEffect(() => {
    if (!user || !sessionReady || !dataLoadedRef.current) return;

    dataLogger.ready('Setting up Appwrite Realtime subscriptions...');

    // Subscribe to all data changes
    // Note: payload.payload has $id from Appwrite but our types use id
    type AppwriteDocument = { $id: string; [key: string]: unknown };

    const unsubscribe = appwriteService.subscribeToChanges((payload) => {
      const events = payload.events as string[];
      const doc = payload.payload as AppwriteDocument;
      const docId = doc.$id;

      // Determine which collection changed
      if (events.some(e => e.includes('invoices'))) {
        if (events.some(e => e.includes('.create'))) {
          setInvoices(prev => {
            if (prev.some(i => i.id === docId)) return prev;
            return [{ ...doc, id: docId, appwriteId: docId } as unknown as Invoice, ...prev];
          });
        } else if (events.some(e => e.includes('.update'))) {
          setInvoices(prev => prev.map(i =>
            i.id === docId ? { ...doc, id: docId, appwriteId: docId } as unknown as Invoice : i
          ));
        } else if (events.some(e => e.includes('.delete'))) {
          setInvoices(prev => prev.filter(i => i.id !== docId));
        }
      }

      if (events.some(e => e.includes('entries'))) {
        if (events.some(e => e.includes('.create'))) {
          setEntries(prev => {
            if (prev.some(e => e.id === docId)) return prev;
            return [{ ...doc, id: docId, appwriteId: docId } as unknown as AccountingEntry, ...prev];
          });
        } else if (events.some(e => e.includes('.update'))) {
          setEntries(prev => prev.map(e =>
            e.id === docId ? { ...doc, id: docId, appwriteId: docId } as unknown as AccountingEntry : e
          ));
        } else if (events.some(e => e.includes('.delete'))) {
          setEntries(prev => prev.filter(e => e.id !== docId));
        }
      }

      if (events.some(e => e.includes('transactions'))) {
        if (events.some(e => e.includes('.create'))) {
          setTransactions(prev => {
            if (prev.some(t => t.id === docId)) return prev;
            return [...prev, { ...doc, id: docId, appwriteId: docId } as unknown as BankTransaction];
          });
        } else if (events.some(e => e.includes('.update'))) {
          setTransactions(prev => prev.map(t =>
            t.id === docId ? { ...doc, id: docId, appwriteId: docId } as unknown as BankTransaction : t
          ));
        } else if (events.some(e => e.includes('.delete'))) {
          setTransactions(prev => prev.filter(t => t.id !== docId));
        }
      }

      if (events.some(e => e.includes('suppliers'))) {
        // Refresh suppliers on any change
        appwriteService.fetchSuppliers().then(setSuppliers).catch(err => dataLogger.error('Error fetching suppliers:', err));
      }
    });

    return () => {
      dataLogger.debug('Cleaning up Realtime subscriptions');
      unsubscribe();
    };
  }, [user, sessionReady]);

  // Persist settings to localStorage
  useEffect(() => {
    localStorage.setItem('gestcb_settings', JSON.stringify(settings));
  }, [settings]);

  return {
    // Data
    invoices,
    entries,
    transactions,
    suppliers,
    apartments,
    recurringExpenses,
    reservations,
    settings,
    // Setters for optimistic updates
    setInvoices,
    setEntries,
    setTransactions,
    setSuppliers,
    setApartments,
    setRecurringExpenses,
    setReservations,
    setSettings,
    // State
    isLoading,
    isConnected,
    // Actions
    refreshData: loadData
  };
}
