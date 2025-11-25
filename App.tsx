
import React, { useState, useEffect, useRef, Suspense, lazy, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { MobileNavigation } from './components/MobileNavigation';
import { Header } from './components/Header';
import { GlobalUploadWidget } from './components/GlobalUploadWidget';
import { UploadQueueProvider } from './context/UploadQueueContext';
import { Invoice, AppSettings, AccountingEntry, BankTransaction, Supplier } from './types';
import { Eye, Trash, AlertTriangle, RefreshCw, XCircle } from 'lucide-react';
import { encryptData } from './utils/crypto';
import { detectNifType } from './utils/validators';
import * as appwriteService from './services/appwriteService';
import { APPWRITE_CONFIG } from './config/appwrite';

// AUTH Integration
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';

// NOTIFICATIONS Integration
import { NotificationProvider, useNotifications } from './context/NotificationContext';

// CONNECTION STATUS
import { ConnectionBanner } from './components/ConnectionStatus';

// Lazy-loaded components for code splitting
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const InvoiceUploader = lazy(() => import('./components/InvoiceUploader').then(m => ({ default: m.InvoiceUploader })));
const TaxModels = lazy(() => import('./components/TaxModels').then(m => ({ default: m.TaxModels })));
const AccountingBooks = lazy(() => import('./components/AccountingBooks').then(m => ({ default: m.AccountingBooks })));
const BankReconciliation = lazy(() => import('./components/BankReconciliation').then(m => ({ default: m.BankReconciliation })));
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const Suppliers = lazy(() => import('./components/Suppliers').then(m => ({ default: m.Suppliers })));
const DocumentViewer = lazy(() => import('./components/DocumentViewer').then(m => ({ default: m.DocumentViewer })));

// Loading fallback component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
  </div>
);

// Helper for Lazy Initialization from LocalStorage with Safe Deep Merge
const loadState = <T,>(key: string, fallback: T): T => {
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // If it's an array, return it directly (assuming fallback is also array)
      if (Array.isArray(fallback)) return parsed;

      // If it's an object (like settings), do a DEEP merge to preserve nested defaults
      if (typeof fallback === 'object' && fallback !== null) {
          const result: any = { ...fallback };

          // Merge top-level properties
          for (const key in parsed) {
            if (Object.prototype.hasOwnProperty.call(parsed, key)) {
              // If both are objects (like dataConfig), merge them
              if (
                typeof parsed[key] === 'object' &&
                parsed[key] !== null &&
                !Array.isArray(parsed[key]) &&
                typeof result[key] === 'object' &&
                result[key] !== null &&
                !Array.isArray(result[key])
              ) {
                result[key] = { ...result[key], ...parsed[key] };
              } else {
                result[key] = parsed[key];
              }
            }
          }

          return result as T;
      }
      return parsed;
    } catch (e) {
      console.error(`Error parsing ${key}`, e);
    }
  }
  return fallback;
};

const MainLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const { addNotification } = useNotifications();
  // --- STATE ---
  
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

  // Initialize settings with Appwrite config PRE-FILLED to avoid setup loops
  const [settings, setSettings] = useState<AppSettings>(() => loadState('gestcb_settings', defaultSettings));

  // Initialize with empty arrays - data will be loaded from Appwrite or localStorage in useEffect
  // This prevents stale localStorage data from being shown when using Appwrite
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [accountingEntries, setAccountingEntries] = useState<AccountingEntry[]>([]);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // UI States
  const [viewingDoc, setViewingDoc] = useState<{file: File, title?: string} | null>(null);

  // --- FILE SYSTEM STATE ---
  const [fileHandle, setFileHandle] = useState<any | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [isLocalFileMode, setIsLocalFileMode] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // --- CONNECTION HEALTH STATE ---
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true); // Track if initial data load is complete

  // Helper to show error to user with auto-clear
  const showError = useCallback((message: string, autoClearMs = 10000) => {
    setConnectionError(message);
    if (autoClearMs > 0) {
      setTimeout(() => setConnectionError(null), autoClearMs);
    }
  }, []);

  // --- SETUP ERROR NOTIFICATION CALLBACKS ---
  useEffect(() => {
      // Configure error callbacks for Appwrite service
      appwriteService.setNotificationCallbacks(
          (error: string, operation: string) => {
              console.error(`🔴 Error en ${operation}:`, error);
              showError(`Error en ${operation}: ${error}`);
          },
          () => {
              // Success callback - clear any existing error
              setConnectionError(null);
          }
      );
  }, [showError]);

  // --- SYNC SETTINGS FROM LOCALSTORAGE ---
  // Use refs to access current values without adding them as dependencies
  const settingsRef = useRef(settings);
  const defaultSettingsRef = useRef(defaultSettings);

  // Keep refs in sync
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
      // Re-read settings from LS in case Login changed them
      const freshSettings = loadState<AppSettings>('gestcb_settings', settingsRef.current);

      // Double check arrays exist in freshSettings
      if (!freshSettings.partners) freshSettings.partners = defaultSettingsRef.current.partners;

      if(JSON.stringify(freshSettings.dataConfig) !== JSON.stringify(settingsRef.current.dataConfig)) {
          setSettings(freshSettings);
      }
  }, [user]); // Re-sync when user changes

  // --- DATA LAYER INITIALIZATION & REALTIME ---
  // NOTE: This effect intentionally only depends on `user` to avoid infinite loops.
  // It uses refs (settingsRef, defaultSettingsRef) to access current settings without
  // triggering re-runs when settings change. The effect reads fresh settings from
  // localStorage via loadState() instead of relying on React state.
  useEffect(() => {
      if (!user) {
          setIsDataLoading(false);
          return;
      }

      const initDataLayer = async () => {
          // Use ref to get current settings as fallback, avoiding dependency issues
          const freshSettings = loadState<AppSettings>('gestcb_settings', settingsRef.current);
          setIsDataLoading(true);

          if (freshSettings.dataConfig?.type === 'APPWRITE') {
              // NOTE: Appwrite is already initialized in AuthContext.tsx
              // No need to call initializeAppwrite again here - it's a singleton pattern
              // This prevents the "double initialization" anti-pattern

              // PERFORM HEALTH CHECK FIRST
              console.log('🔍 Verificando conexión con Appwrite...');
              setIsReconnecting(true);
              try {
                  const healthResult = await appwriteService.performHealthCheck();
                  setConnectionChecked(true);
                  setIsReconnecting(false);

                  if (!healthResult.connected) {
                      setConnectionError('No se puede conectar con el servidor. Verifica tu conexión a internet.');
                      console.error('❌ Health check failed:', healthResult.errors);
                      setIsDataLoading(false);
                      return;
                  }

                  if (!healthResult.authenticated) {
                      setConnectionError('Sesión no válida. Por favor, inicia sesión de nuevo.');
                      console.error('❌ Not authenticated:', healthResult.errors);
                      setIsDataLoading(false);
                      return;
                  }

                  if (!healthResult.collectionsReady) {
                      setConnectionError(`Configuración incompleta: ${healthResult.errors.join(', ')}`);
                      console.error('❌ Collections not ready:', healthResult.errors);
                      // Continue anyway - might be first run
                  }

                  console.log('✅ Conexión verificada correctamente');
                  setConnectionError(null);
              } catch (healthError: any) {
                  console.error('❌ Health check error:', healthError);
                  setConnectionError(`Error de conexión: ${healthError.message}`);
                  setIsReconnecting(false);
                  // Continue anyway to try loading data
              }

              // 1. Initial Fetch - Load ALL data from Appwrite
              try {
                console.log('📥 Cargando datos desde Appwrite...');

                // Sync settings first
                const remoteSettings = await appwriteService.syncSettings(freshSettings);
                if (remoteSettings) {
                    const mergedSettings = {
                        ...remoteSettings,
                        // Use ref to access default partners, avoiding dependency issues
                        partners: remoteSettings.partners || defaultSettingsRef.current.partners,
                        dataConfig: freshSettings.dataConfig // Keep local dataConfig
                    };
                    setSettings(mergedSettings);
                    // Also update localStorage with merged settings
                    localStorage.setItem('gestcb_settings', JSON.stringify(mergedSettings));
                }

                // Load all data in parallel for better performance
                const [remoteInvoices, remoteEntries, remoteTransactions, remoteSuppliers] = await Promise.all([
                    appwriteService.fetchInvoices(),
                    appwriteService.fetchEntries(),
                    appwriteService.fetchTransactions(),
                    appwriteService.fetchSuppliers().catch(() => []) // Don't fail if suppliers fail
                ]);

                // Update state with remote data
                setInvoices(remoteInvoices);
                setAccountingEntries(remoteEntries);
                setBankTransactions(remoteTransactions);
                setSuppliers(remoteSuppliers);

                console.log(`✅ Datos cargados: ${remoteInvoices.length} facturas, ${remoteEntries.length} asientos, ${remoteTransactions.length} transacciones, ${remoteSuppliers.length} proveedores`);
                setConnectionError(null);
              } catch (e: any) {
                  console.warn("Initial sync failed:", e);
                  setConnectionError(`Error al cargar datos: ${e.message || 'Error desconocido'}`);
              } finally {
                  setIsDataLoading(false);
              }

              // 2. REALTIME SUBSCRIPTION - OPTIMIZED
              // Instead of fetching all data on every change (which causes rate limiting),
              // we invalidate the cache and let the next user action trigger a fresh fetch
              const unsubscribe = appwriteService.subscribeToChanges((payload) => {
                  if (payload.events.some((e:string) => e.includes('.create') || e.includes('.update') || e.includes('.delete'))) {
                      // Import cache dynamically to avoid circular deps
                      import('./lib/appwrite/cache').then(({ cache }) => {
                          console.log('[Realtime] Change detected, invalidating cache...');
                          // Invalidate relevant collections based on event
                          if (payload.events.some((e:string) => e.includes('invoices'))) {
                              cache.invalidateCollection('invoices');
                          }
                          if (payload.events.some((e:string) => e.includes('entries'))) {
                              cache.invalidateCollection('entries');
                          }
                          if (payload.events.some((e:string) => e.includes('transactions'))) {
                              cache.invalidateCollection('transactions');
                          }
                          if (payload.events.some((e:string) => e.includes('suppliers'))) {
                              cache.invalidateCollection('suppliers');
                          }
                      });
                  }
              });

              return () => {
                  unsubscribe();
              };
          } else {
              // Mode is not APPWRITE - this should not happen in normal usage
              // The app requires Appwrite to function
              console.error('❌ La aplicación requiere configuración de Appwrite');
              setConnectionError('La aplicación requiere conexión a Appwrite. Configura tu proyecto de Appwrite en Ajustes.');
              setIsDataLoading(false);
          }
      };
      initDataLayer();
  }, [user]); // Depend on user to re-init on login

  // --- PERSISTENCE EFFECTS ---
  // Settings are saved to localStorage for initial load detection
  // All data is stored in Appwrite - no local storage of invoices, entries, etc.
  useEffect(() => {
      if (!isLocalFileMode) {
        // Only save settings to localStorage (for mode detection on reload)
        localStorage.setItem('gestcb_settings', JSON.stringify(settings));
      }
  }, [settings, isLocalFileMode]);

  // Encrypted File Auto-Save
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Store fileHandle and encryptionKey in refs to avoid adding them as dependencies
  const fileHandleRef = useRef(fileHandle);
  const encryptionKeyRef = useRef(encryptionKey);

  // Keep refs in sync
  useEffect(() => {
    fileHandleRef.current = fileHandle;
  }, [fileHandle]);

  useEffect(() => {
    encryptionKeyRef.current = encryptionKey;
  }, [encryptionKey]);

  useEffect(() => {
      if (isLocalFileMode && fileHandleRef.current && encryptionKeyRef.current) {
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = setTimeout(async () => {
              const fullData = { invoices, entries: accountingEntries, transactions: bankTransactions, settings };
              try {
                  const encryptedBlob = await encryptData(JSON.stringify(fullData), encryptionKeyRef.current!);
                  const writable = await (fileHandleRef.current as any).createWritable();
                  await writable.write(encryptedBlob);
                  await writable.close();
                  setLastSaved(new Date());
              } catch (err) {
                  console.warn("Failed to save encrypted file:", err);
              }
          }, 2000);
      }
  }, [settings, invoices, accountingEntries, bankTransactions, isLocalFileMode]);


  // --- HANDLERS ---
  const handleUpdateSettings = async (newSettings: AppSettings) => {
      setSettings(newSettings);
      // Always save settings to localStorage (for mode detection on reload)
      localStorage.setItem('gestcb_settings', JSON.stringify(newSettings));

      // If using Appwrite, sync settings to cloud
      if (newSettings.dataConfig?.type === 'APPWRITE') {
          try {
              await appwriteService.saveSettings(newSettings);
              console.log('✅ Settings sincronizados con Appwrite');
          } catch (error) {
              console.error('Error syncing settings to Appwrite:', error);
          }
      }
  };

  const handleAddInvoice = async (invoice: Invoice) => {
      // IMPORTANT: Save original status BEFORE calling Appwrite
      // This ensures we use the correct status for creating accounting entries
      const originalStatus = invoice.status;
      const originalInvoice = { ...invoice };

      // Update state immediately for optimistic UI
      setInvoices(prev => [invoice, ...prev]);

      if (settings.dataConfig?.type === 'APPWRITE') {
          try {
              const savedInv = await appwriteService.createInvoice(invoice);
              // Update with real ID from server, but preserve original status if missing
              const mergedInvoice = {
                  ...savedInv,
                  status: savedInv.status || originalStatus
              };
              setInvoices(prev => prev.map(i => i.id === invoice.id ? mergedInvoice : i));
          } catch (error: unknown) {
              // ROLLBACK: Remove the invoice from local state since it wasn't saved
              setInvoices(prev => prev.filter(i => i.id !== invoice.id));

              // Show error to user
              const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
              showError(`Error al guardar factura: ${errorMessage}. Los cambios no se han guardado.`);
              console.error('Error saving invoice to Appwrite:', error);

              // Don't continue with entry creation since invoice wasn't saved
              return;
          }
      }

      // Create notification
      if (user) {
        addNotification({
          type: 'INVOICE_CREATED',
          title: 'Nueva factura creada',
          message: `${invoice.type === 'INCOME' ? 'Ingreso' : 'Gasto'} de ${invoice.issuerName} por ${invoice.totalAmount.toFixed(2)}€`,
          userId: user.$id,
          userName: user.name,
          relatedId: invoice.id
        });
      }

      // AUTO-CREATE SUPPLIER if invoice is being processed and supplier doesn't exist
      if ((originalStatus === 'PROCESSED' || originalStatus === 'PAID') && invoice.issuerNif && invoice.issuerName) {
          // Check if supplier already exists by NIF
          const existingSupplier = suppliers.find(s =>
              s.nif.toUpperCase().replace(/\s/g, '') === invoice.issuerNif.toUpperCase().replace(/\s/g, '')
          );

          if (!existingSupplier) {
              const now = new Date().toISOString();
              const newSupplier: Supplier = {
                  id: `SUP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  name: invoice.issuerName,
                  nif: invoice.issuerNif.toUpperCase(),
                  nifType: detectNifType(invoice.issuerNif),
                  address: invoice.issuerAddress,
                  city: invoice.issuerCity,
                  postalCode: invoice.issuerPostalCode,
                  createdAt: now,
                  updatedAt: now
              };

              console.log("Auto-creating supplier from invoice:", newSupplier.name, newSupplier.nif);
              handleAddSupplier(newSupplier);

              // Update invoice with supplier reference
              const updatedInvoice = { ...originalInvoice, supplierId: newSupplier.id };
              setInvoices(prev => prev.map(i => i.id === invoice.id ? updatedInvoice : i));
          } else if (!invoice.supplierId) {
              // Link invoice to existing supplier if not already linked
              const updatedInvoice = { ...originalInvoice, supplierId: existingSupplier.id };
              setInvoices(prev => prev.map(i => i.id === invoice.id ? updatedInvoice : i));
              console.log("Linked invoice to existing supplier:", existingSupplier.name);
          }
      }

      // Solo crear asiento si la factura está PROCESADA o PAGADA (no PENDIENTE)
      // Use ORIGINAL status to ensure entry is created even if Appwrite response is incomplete
      if (originalStatus === 'PROCESSED' || originalStatus === 'PAID') {
          console.log("Auto-creating entry for invoice:", originalInvoice.id, "Status:", originalStatus);
          createEntryFromInvoice(originalInvoice);
      } else {
          console.log("Invoice saved as PENDING - no accounting entry created yet:", originalInvoice.id);
      }
  };

  const createEntryFromInvoice = async (inv: Invoice) => {
    let accountCode = inv.type === 'EXPENSE' ? '600' : '700';
    let accountName = inv.type === 'EXPENSE' ? 'Compras' : 'Ventas';
    
    // Parse Category "CODE - NAME"
    if (inv.category) {
        const parts = inv.category.split(' - ');
        if (parts.length > 1) { 
            accountCode = parts[0].trim(); 
            accountName = parts.slice(1).join(' - ').trim(); 
        } else { 
            accountCode = parts[0].trim(); 
        }
    }

    const newEntry: AccountingEntry = {
        id: `AUTO-${inv.id}`,
        date: inv.date,
        concept: `Factura ${inv.number || 'S/N'} - ${inv.issuerName}`,
        accountCode: accountCode,
        accountName: accountName,
        debit: inv.type === 'EXPENSE' ? inv.totalAmount : 0, // NOTE: Total amount for simple accounting if exempt
        credit: inv.type === 'INCOME' ? inv.totalAmount : 0,
        invoiceId: inv.id,
        // Pass file references carefully
        referenceDoc: inv.file,
        fileData: inv.fileData,
        fileType: inv.fileType,
        appwriteFileId: inv.appwriteFileId, // Important for Cloud
        reconciled: false
    };

    handleAddEntry(newEntry);
  };
  
  const handleUpdateInvoice = async (invoice: Invoice) => {
      const oldInvoice = invoices.find(i => i.id === invoice.id);

      // Optimistic update
      setInvoices(prev => prev.map(i => i.id === invoice.id ? invoice : i));

      if (settings.dataConfig?.type === 'APPWRITE') {
          try {
              await appwriteService.updateInvoice(invoice);
          } catch (error: unknown) {
              // ROLLBACK: Restore the original invoice
              if (oldInvoice) {
                  setInvoices(prev => prev.map(i => i.id === invoice.id ? oldInvoice : i));
              }
              const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
              showError(`Error al actualizar factura: ${errorMessage}. Los cambios no se han guardado.`);
              console.error('Error updating invoice in Appwrite:', error);
              return;
          }
      }

      // Create notification
      if (user) {
        addNotification({
          type: 'INVOICE_UPDATED',
          title: 'Factura actualizada',
          message: `${invoice.issuerName} - Estado: ${invoice.status}`,
          userId: user.$id,
          userName: user.name,
          relatedId: invoice.id
        });
      }

      // If status changed from PENDING to PROCESSED/PAID, create accounting entry
      // But first check if entry doesn't already exist (avoid duplicates)
      if (oldInvoice?.status === 'PENDING' && (invoice.status === 'PROCESSED' || invoice.status === 'PAID')) {
          const existingEntry = accountingEntries.find(e => e.invoiceId === invoice.id);
          if (!existingEntry) {
              console.log("Invoice status changed to PROCESSED/PAID - creating accounting entry:", invoice.id);
              createEntryFromInvoice(invoice);
          } else {
              console.log("Accounting entry already exists for invoice:", invoice.id);
          }
      }
  };

  const handleDeleteInvoice = async (id: string) => {
      const invoice = invoices.find(i => i.id === id);

      // Optimistic delete
      setInvoices(prev => prev.filter(i => i.id !== id));

      // Use id directly - in Appwrite mode, id comes from $id
      if (settings.dataConfig?.type === 'APPWRITE' && invoice) {
          try {
              const docId = invoice.appwriteId || invoice.id;
              await appwriteService.deleteInvoice(docId);
              console.log('✅ Factura eliminada de Appwrite:', docId);
          } catch (error: unknown) {
              // ROLLBACK: Restore the deleted invoice
              setInvoices(prev => [invoice, ...prev]);
              const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
              showError(`Error al eliminar factura: ${errorMessage}. La factura no se ha eliminado.`);
              console.error('Error deleting invoice from Appwrite:', error);
              return;
          }
      }

      // Create notification
      if (user && invoice) {
        addNotification({
          type: 'INVOICE_DELETED',
          title: 'Factura eliminada',
          message: `${invoice.issuerName} - ${invoice.totalAmount.toFixed(2)}€`,
          userId: user.$id,
          userName: user.name,
          relatedId: id
        });
      }

      // Also delete related accounting entry if it exists
      const relatedEntry = accountingEntries.find(e => e.invoiceId === id);
      if (relatedEntry) {
          handleDeleteEntry(relatedEntry.id);
      }
  };

  const handleAddEntry = async (entry: AccountingEntry) => {
      // Optimistic add
      setAccountingEntries(prev => [entry, ...prev]);

      if (settings.dataConfig?.type === 'APPWRITE') {
          try {
              const saved = await appwriteService.createEntry(entry);
              setAccountingEntries(prev => prev.map(e => e.id === entry.id ? saved : e));
          } catch (error: unknown) {
              // ROLLBACK: Remove the entry from local state
              setAccountingEntries(prev => prev.filter(e => e.id !== entry.id));
              const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
              showError(`Error al crear asiento: ${errorMessage}. Los cambios no se han guardado.`);
              console.error('Error creating entry in Appwrite:', error);
              return;
          }
      }

      // Create notification (only for manual entries, not auto-generated from invoices)
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
  };

  const handleUpdateEntry = async (entry: AccountingEntry) => {
      const oldEntry = accountingEntries.find(e => e.id === entry.id);

      // Optimistic update
      setAccountingEntries(prev => prev.map(e => e.id === entry.id ? entry : e));

      if (settings.dataConfig?.type === 'APPWRITE') {
          try {
              await appwriteService.updateEntry(entry);
          } catch (error: unknown) {
              // ROLLBACK: Restore the original entry
              if (oldEntry) {
                  setAccountingEntries(prev => prev.map(e => e.id === entry.id ? oldEntry : e));
              }
              const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
              showError(`Error al actualizar asiento: ${errorMessage}. Los cambios no se han guardado.`);
              console.error('Error updating entry in Appwrite:', error);
              return;
          }
      }

      // Create notification
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
  };

  const handleDeleteEntry = async (id: string) => {
      const entry = accountingEntries.find(e => e.id === id);

      // Optimistic delete
      setAccountingEntries(prev => prev.filter(e => e.id !== id));

      // Use id directly - in Appwrite mode, id comes from $id
      if (settings.dataConfig?.type === 'APPWRITE' && entry) {
          try {
              const docId = entry.appwriteId || entry.id;
              await appwriteService.deleteEntry(docId);
              console.log('✅ Asiento eliminado de Appwrite:', docId);
          } catch (error: unknown) {
              // ROLLBACK: Restore the deleted entry
              setAccountingEntries(prev => [entry, ...prev]);
              const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
              showError(`Error al eliminar asiento: ${errorMessage}. El asiento no se ha eliminado.`);
              console.error('Error deleting entry from Appwrite:', error);
              return;
          }
      }

      // Create notification
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
  };

  const handleAddBankTransactions = async (txs: BankTransaction[]) => {
      const txIds = txs.map(tx => tx.id);

      // Optimistic add
      setBankTransactions(prev => [...prev, ...txs]);

      if (settings.dataConfig?.type === 'APPWRITE') {
          try {
              // Save all transactions to Appwrite with proper await
              const savedTransactions = await Promise.all(
                  txs.map(tx => appwriteService.createTransaction(tx))
              );
              // Update state with saved transactions (includes appwriteId)
              setBankTransactions(prev =>
                  prev.map(t => {
                      const saved = savedTransactions.find(s => s.id === t.id);
                      return saved || t;
                  })
              );
              console.log(`✅ ${savedTransactions.length} transacciones guardadas en Appwrite`);
          } catch (error: unknown) {
              // ROLLBACK: Remove the transactions from local state
              setBankTransactions(prev => prev.filter(t => !txIds.includes(t.id)));
              const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
              showError(`Error al guardar transacciones bancarias: ${errorMessage}. Los cambios no se han guardado.`);
              console.error('Error saving transactions to Appwrite:', error);
          }
      }
  };

  // NEW: Create Accounting Entry from Bank Transaction
  const handleCreateEntryFromTransaction = (tx: BankTransaction) => {
     const newEntry: AccountingEntry = {
        id: `BANK-${tx.id}`,
        date: tx.date,
        concept: tx.concept,
        accountCode: tx.amount < 0 ? '626' : '769', // Default guess: Bank Services or Financial Income
        accountName: tx.amount < 0 ? 'Servicios bancarios' : 'Ingresos financieros',
        debit: tx.amount < 0 ? Math.abs(tx.amount) : 0,
        credit: tx.amount > 0 ? tx.amount : 0,
        reconciled: true // It comes from bank, so it matches!
     };
     handleAddEntry(newEntry);

     // Mark transaction as matched
     handleUpdateBankTransaction({
       ...tx,
       status: 'MATCHED',
       reconciledWithEntryId: newEntry.id
     });

     alert("Asiento creado. Ve a 'Libros Contables' para editar la cuenta si es necesario.");
  };

  // NEW: Reconcile a bank transaction with an accounting entry
  const handleReconcileTransaction = async (transactionId: string, entryId: string) => {
    // Find the transaction and entry
    const transaction = bankTransactions.find(t => t.id === transactionId);
    const entry = accountingEntries.find(e => e.id === entryId);

    if (!transaction || !entry) {
      console.error('Transaction or entry not found for reconciliation');
      return;
    }

    // Update the bank transaction
    const updatedTransaction: BankTransaction = {
      ...transaction,
      status: 'MATCHED',
      reconciledWithEntryId: entryId
    };
    await handleUpdateBankTransaction(updatedTransaction);

    // Update the accounting entry
    const updatedEntry: AccountingEntry = {
      ...entry,
      reconciled: true
    };
    await handleUpdateEntry(updatedEntry);

    // Create notification
    if (user) {
      addNotification({
        type: 'ENTRY_UPDATED',
        title: 'Conciliación realizada',
        message: `Transacción "${transaction.concept}" conciliada con asiento "${entry.concept}"`,
        userId: user.$id,
        userName: user.name,
        relatedId: entryId
      });
    }

    console.log('✅ Reconciliation completed:', transactionId, '<->', entryId);
  };

  // NEW: Update Bank Transaction
  const handleUpdateBankTransaction = async (transaction: BankTransaction) => {
    setBankTransactions(prev => prev.map(t => t.id === transaction.id ? transaction : t));

    // Use id directly - in Appwrite mode, id comes from $id
    if (settings.dataConfig?.type === 'APPWRITE') {
      try {
        // Ensure we have the document ID for Appwrite
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
  };

  // Supplier Handlers
  const handleAddSupplier = async (supplier: Supplier) => {
      // Optimistic add
      setSuppliers(prev => [supplier, ...prev]);

      if (settings.dataConfig?.type === 'APPWRITE') {
          try {
              const savedSupplier = await appwriteService.createSupplier(supplier);
              // Update with Appwrite ID
              setSuppliers(prev => prev.map(s => s.id === supplier.id ? savedSupplier : s));
              console.log('✅ Proveedor guardado en Appwrite:', savedSupplier.id);
          } catch (error: unknown) {
              // ROLLBACK: Remove the supplier from local state
              setSuppliers(prev => prev.filter(s => s.id !== supplier.id));
              const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
              showError(`Error al crear proveedor: ${errorMessage}. Los cambios no se han guardado.`);
              console.error('Error saving supplier to Appwrite:', error);
          }
      }
  };

  const handleUpdateSupplier = async (supplier: Supplier) => {
      const oldSupplier = suppliers.find(s => s.id === supplier.id);

      // Optimistic update
      setSuppliers(prev => prev.map(s => s.id === supplier.id ? supplier : s));

      // Use id directly - in Appwrite mode, id comes from $id
      if (settings.dataConfig?.type === 'APPWRITE') {
          try {
              // Ensure we have the document ID for Appwrite
              const supplierToUpdate = {
                  ...supplier,
                  appwriteId: supplier.appwriteId || supplier.id
              };
              await appwriteService.updateSupplier(supplierToUpdate);
              console.log('✅ Proveedor actualizado en Appwrite:', supplierToUpdate.appwriteId);
          } catch (error: unknown) {
              // ROLLBACK: Restore the original supplier
              if (oldSupplier) {
                  setSuppliers(prev => prev.map(s => s.id === supplier.id ? oldSupplier : s));
              }
              const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
              showError(`Error al actualizar proveedor: ${errorMessage}. Los cambios no se han guardado.`);
              console.error('Error updating supplier in Appwrite:', error);
          }
      }
  };

  const handleDeleteSupplier = async (id: string) => {
      const supplier = suppliers.find(s => s.id === id);

      // Optimistic delete
      setSuppliers(prev => prev.filter(s => s.id !== id));

      // Use id directly - in Appwrite mode, id comes from $id
      if (settings.dataConfig?.type === 'APPWRITE' && supplier) {
          try {
              const docId = supplier.appwriteId || supplier.id;
              await appwriteService.deleteSupplier(docId);
              console.log('✅ Proveedor eliminado de Appwrite:', docId);
          } catch (error: unknown) {
              // ROLLBACK: Restore the deleted supplier
              setSuppliers(prev => [supplier, ...prev]);
              const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
              showError(`Error al eliminar proveedor: ${errorMessage}. El proveedor no se ha eliminado.`);
              console.error('Error deleting supplier from Appwrite:', error);
          }
      }
  };

  // Legacy File Handlers
  const handleCloneToFile = async (password: string) => {
      try {
          const handle = await (window as any).showSaveFilePicker({
              suggestedName: `Contabilidad_CBGest_${new Date().toISOString().split('T')[0]}.gestcb`,
              types: [{ description: 'CBGest Secure File', accept: { 'application/gestcb': ['.gestcb'] } }],
          });
          setFileHandle(handle);
          setEncryptionKey(password);
          setIsLocalFileMode(true);
      } catch (error: any) {
          if (error.name === 'SecurityError' || error.name === 'NotAllowedError') {
             console.warn("File access denied in iframe");
             alert("Tu navegador o este entorno de previsualización bloquea el acceso al disco. Usa la opción 'Descargar JSON' en la pestaña Datos.");
          }
      }
  };
  
  const handleLoadFromFile = async (password: string) => {
       try {
          const [handle] = await (window as any).showOpenFilePicker({
              types: [{ description: 'CBGest Secure File', accept: { 'application/gestcb': ['.gestcb'] } }],
          });
          // Logic to read file would go here if we implemented the full reader...
          // For now, we just set mode
          setFileHandle(handle);
          setEncryptionKey(password);
          setIsLocalFileMode(true);
      } catch (error: any) {
           console.warn("File access denied in iframe");
           alert("Acceso denegado al sistema de archivos. Prueba en una ventana nueva.");
      }
  };
  const handleDisconnectFile = () => { setIsLocalFileMode(false); setFileHandle(null); setEncryptionKey(null); };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>;
  }

  if (!user && settings.dataConfig?.type === 'APPWRITE') {
      return <Login />;
  }

  // Show loading state while fetching data from Appwrite
  if (isDataLoading && settings.dataConfig?.type === 'APPWRITE') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full"></div>
        <p className="text-slate-600">Cargando datos desde Appwrite...</p>
      </div>
    );
  }

  // Determine connection status and health
  const connectionStatus: 'APPWRITE' | 'LOCAL' | 'OFFLINE' =
    settings.dataConfig?.type === 'APPWRITE' ? 'APPWRITE' :
    (isLocalFileMode || settings.dataConfig?.type === 'LOCAL_STORAGE') ? 'LOCAL' : 'OFFLINE';

  // Determine connection health
  const connectionHealth: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' = (() => {
    // For Appwrite: check real connection health
    if (settings.dataConfig?.type === 'APPWRITE') {
      // If currently reconnecting, show that state
      if (isReconnecting) {
        return 'RECONNECTING';
      }

      // If there's a connection error, show disconnected
      if (connectionError) {
        return 'DISCONNECTED';
      }

      // If we haven't checked yet and user exists, show reconnecting
      if (!connectionChecked && user) {
        return 'RECONNECTING';
      }

      // Check if properly configured
      if (!settings.dataConfig.appwriteProjectId || !settings.dataConfig.appwriteDatabaseId || !settings.dataConfig.appwriteBucketId) {
        return 'DISCONNECTED'; // Not configured
      }

      // Use the real connection health from appwriteService
      return user && appwriteService.getConnectionHealth() ? 'CONNECTED' : 'DISCONNECTED';
    }

    // For Local File Mode: always connected if file is loaded
    if (isLocalFileMode) {
      return fileHandle ? 'CONNECTED' : 'DISCONNECTED';
    }

    // For Local Storage: always connected (no server needed)
    if (settings.dataConfig?.type === 'LOCAL_STORAGE') {
      return 'CONNECTED';
    }

    return 'DISCONNECTED'; // Default fallback
  })();

  return (
    <UploadQueueProvider suppliers={suppliers}>
      <HashRouter>
        <div className="min-h-screen bg-slate-50 flex font-sans">
          <Sidebar
            connectionStatus={connectionStatus}
            connectionHealth={connectionHealth}
            isLocalFileMode={isLocalFileMode}
          />
          <div className="flex-1 ml-0 md:ml-64 transition-all duration-200">
            <Header isLocalFileMode={isLocalFileMode} />
            {/* Offline/Sync Status Banner */}
            <ConnectionBanner />
            {/* Connection Error Banner */}
            {connectionError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 mx-4 mt-4 rounded-r-lg animate-fade-in">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-red-800">Problema de conexión</h4>
                    <p className="text-red-700 text-sm mt-1">{connectionError}</p>
                    <p className="text-red-600 text-xs mt-2">
                      La aplicación requiere conexión a Appwrite para funcionar. Verifica tu conexión e inténtalo de nuevo.
                    </p>
                  </div>
                  <button
                    onClick={() => setConnectionError(null)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
            {/* Reconnecting Indicator */}
            {isReconnecting && (
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mx-4 mt-4 rounded-r-lg animate-fade-in">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                  <span className="text-blue-700">Verificando conexión con Appwrite...</span>
                </div>
              </div>
            )}
            <main className="min-h-[calc(100vh-4rem)] pb-24 md:pb-8 relative">
              <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Dashboard invoices={invoices} settings={settings} onUpdateSettings={setSettings} />} />
                <Route path="/invoices" element={
                  <div className="p-4 md:p-8 animate-fade-in">
                    <InvoiceUploader
                        onInvoiceAdded={handleAddInvoice}
                        onBankTransactionsAdded={handleAddBankTransactions}
                        settings={settings}
                    />
                    <div className="mt-12">
                      <h3 className="text-lg font-semibold text-slate-900 mb-4">Últimas Facturas</h3>
                      <div className="hidden md:block bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                            <tr>
                              <th className="px-6 py-4">Fecha</th>
                              <th className="px-6 py-4">Emisor</th>
                              <th className="px-6 py-4">Número</th>
                              <th className="px-6 py-4 text-right">Importe</th>
                              <th className="px-6 py-4">Tipo</th>
                              <th className="px-6 py-4">Estado</th>
                              <th className="px-6 py-4 text-center">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {invoices.map(inv => {
                              const statusColor = inv.status === 'PROCESSED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                                  inv.status === 'PAID' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                                  'bg-amber-100 text-amber-700 border-amber-200';
                              const statusText = inv.status === 'PROCESSED' ? 'PROCESADA' :
                                                 inv.status === 'PAID' ? 'PAGADA' :
                                                 'PENDIENTE';
                              return (
                                <tr key={inv.id} className="hover:bg-slate-50">
                                  <td className="px-6 py-4 text-sm text-slate-600">{inv.date}</td>
                                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{inv.issuerName}</td>
                                  <td className="px-6 py-4 text-sm text-slate-600">{inv.number || 'S/N'}</td>
                                  <td className="px-6 py-4 text-sm font-mono text-right text-slate-900">{inv.totalAmount.toFixed(2)}€</td>
                                  <td className="px-6 py-4 text-sm">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${inv.type === 'INCOME' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                      {inv.type === 'INCOME' ? 'INGRESO' : 'GASTO'}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4">
                                    <select
                                      value={inv.status}
                                      onChange={(e) => handleUpdateInvoice({...inv, status: e.target.value as Invoice['status']})}
                                      className={`text-xs px-2 py-1 rounded border font-medium ${statusColor}`}
                                    >
                                      <option value="PENDING">PENDIENTE</option>
                                      <option value="PROCESSED">PROCESADA</option>
                                      <option value="PAID">PAGADA</option>
                                    </select>
                                  </td>
                                  <td className="px-6 py-4 flex justify-center gap-2">
                                    <button
                                      onClick={() => inv.file && setViewingDoc({file: inv.file})}
                                      className="p-1 text-slate-400 hover:text-blue-600"
                                      title="Ver documento"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (window.confirm('¿Eliminar esta factura?')) {
                                          handleDeleteInvoice(inv.id);
                                        }
                                      }}
                                      className="p-1 text-slate-400 hover:text-red-600"
                                      title="Eliminar factura"
                                    >
                                      <Trash className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile View */}
                      <div className="md:hidden space-y-4">
                        {invoices.map(inv => {
                          const statusColor = inv.status === 'PROCESSED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                              inv.status === 'PAID' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                              'bg-amber-100 text-amber-700 border-amber-200';
                          return (
                            <div key={inv.id} className="bg-white p-4 rounded-lg shadow-sm border border-slate-100">
                              <div className="flex justify-between mb-2">
                                <span className="text-xs text-slate-500">{inv.date}</span>
                                <span className={`px-2 py-1 rounded text-xs font-medium ${inv.type === 'INCOME' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {inv.type === 'INCOME' ? 'INGRESO' : 'GASTO'}
                                </span>
                              </div>
                              <p className="font-semibold text-slate-900 mb-2">{inv.issuerName}</p>
                              <div className="flex justify-between items-center mb-3">
                                <span className="text-lg font-bold text-slate-900">{inv.totalAmount.toFixed(2)}€</span>
                                <select
                                  value={inv.status}
                                  onChange={(e) => handleUpdateInvoice({...inv, status: e.target.value as Invoice['status']})}
                                  className={`text-xs px-2 py-1 rounded border font-medium ${statusColor}`}
                                >
                                  <option value="PENDING">PENDIENTE</option>
                                  <option value="PROCESSED">PROCESADA</option>
                                  <option value="PAID">PAGADA</option>
                                </select>
                              </div>
                              <div className="flex gap-3 pt-3 border-t border-slate-100">
                                <button
                                  onClick={() => inv.file && setViewingDoc({file: inv.file})}
                                  className="flex-1 text-blue-600 text-xs font-medium uppercase"
                                >
                                  Ver PDF
                                </button>
                                <button
                                  onClick={() => {
                                    if (window.confirm('¿Eliminar esta factura?')) {
                                      handleDeleteInvoice(inv.id);
                                    }
                                  }}
                                  className="flex-1 text-red-500 text-xs font-medium uppercase"
                                >
                                  Borrar
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                } />
                <Route path="/suppliers" element={
                    <Suppliers
                        suppliers={suppliers}
                        onAddSupplier={handleAddSupplier}
                        onUpdateSupplier={handleUpdateSupplier}
                        onDeleteSupplier={handleDeleteSupplier}
                    />
                } />
                <Route path="/books" element={
                    <AccountingBooks
                        entries={accountingEntries}
                        onAddEntry={handleAddEntry}
                        onUpdateEntry={handleUpdateEntry}
                        onDeleteEntry={handleDeleteEntry}
                        onViewDocument={(file) => setViewingDoc({file})}
                    />
                } />
                <Route path="/reconciliation" element={
                    <BankReconciliation
                        transactions={bankTransactions}
                        entries={accountingEntries}
                        onReconcile={handleReconcileTransaction}
                        onCreateEntryFromTransaction={handleCreateEntryFromTransaction}
                    />
                } />
                <Route path="/taxes" element={
                    <TaxModels invoices={invoices} settings={settings} />
                } />
                <Route path="/settings" element={
                    <Settings 
                        settings={settings} 
                        onUpdateSettings={handleUpdateSettings}
                        onCloneToFile={handleCloneToFile}
                        onLoadFromFile={handleLoadFromFile}
                        onDisconnectFile={handleDisconnectFile}
                        isLocalFileMode={isLocalFileMode}
                        lastSaved={lastSaved}
                        currentFileName={fileHandle?.name}
                    />
                } />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </Suspense>
              <GlobalUploadWidget />
              <Suspense fallback={null}>
                <DocumentViewer isOpen={!!viewingDoc} onClose={() => setViewingDoc(null)} file={viewingDoc?.file} />
              </Suspense>
            </main>
          </div>
          <MobileNavigation />
        </div>
      </HashRouter>
    </UploadQueueProvider>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <NotificationProvider>
        <MainLayout />
      </NotificationProvider>
    </AuthProvider>
  );
};

export default App;
