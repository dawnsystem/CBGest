
import React, { useState, useEffect, useRef, Suspense, lazy, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { MobileNavigation } from './components/MobileNavigation';
import { Header } from './components/Header';
import { GlobalUploadWidget } from './components/GlobalUploadWidget';
import { UploadQueueProvider } from './context/UploadQueueContext';
import { FiscalYearProvider, useFiscalYear } from './context/FiscalYearContext';
import { FiscalYearManager } from './components/FiscalYearManager';
import { Invoice, AppSettings, AccountingEntry, BankTransaction, Supplier, Apartment, RecurringExpense, Reservation } from './types';
import { Eye, Trash, AlertTriangle, RefreshCw, XCircle, Check, Lock } from 'lucide-react';
import { encryptData } from './utils/crypto';
import { loadPersistedState } from './utils/stateStorage';
import * as appwriteService from './services/appwriteService';
import { useAppSettings, useDataHandlers } from './hooks';

import { ToastProvider, useToast } from './components/Toast';

// AUTH Integration
import { AuthProvider, useAuth, useSessionReady } from './context/AuthContext';
import { Login } from './components/Login';
import { ForcePasswordChange } from './components/ForcePasswordChange';

// NOTIFICATIONS Integration
import { NotificationProvider } from './context/NotificationContext';

// CONNECTION STATUS
import { ConnectionBanner } from './components/ConnectionStatus';

// Lazy-loaded components for code splitting
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const InvoiceUploader = lazy(() => import('./components/InvoiceUploader').then(m => ({ default: m.InvoiceUploader })));
const TaxModels = lazy(() => import('./components/TaxModels').then(m => ({ default: m.TaxModels })));
const AccountingBooks = lazy(() => import('./components/AccountingBooks').then(m => ({ default: m.AccountingBooks })));
const AccountLedger = lazy(() => import('./components/AccountLedger').then(m => ({ default: m.AccountLedger })));
const TrialBalance = lazy(() => import('./components/TrialBalance').then(m => ({ default: m.TrialBalance })));
const BankReconciliation = lazy(() => import('./components/BankReconciliation').then(m => ({ default: m.BankReconciliation })));
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const Suppliers = lazy(() => import('./components/Suppliers').then(m => ({ default: m.Suppliers })));
const ApartmentManager = lazy(() => import('./components/ApartmentManager').then(m => ({ default: m.ApartmentManager })));
const RecurringExpenseManager = lazy(() => import('./components/RecurringExpenseManager').then(m => ({ default: m.RecurringExpenseManager })));
const ReservationManager = lazy(() => import('./components/ReservationManager').then(m => ({ default: m.ReservationManager })));
const DocumentViewer = lazy(() => import('./components/DocumentViewer').then(m => ({ default: m.DocumentViewer })));
const SearchResults = lazy(() => import('./components/SearchResults').then(m => ({ default: m.SearchResults })));

// Loading fallback component with skeleton for better LCP
const PageLoader = () => (
  <div className="p-4 md:p-8 animate-pulse">
    {/* Title skeleton */}
    <div className="h-8 w-48 bg-slate-200 rounded-md mb-6"></div>
    
    {/* Cards skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <div className="h-4 w-24 bg-slate-200 rounded mb-4"></div>
          <div className="h-8 w-32 bg-slate-100 rounded"></div>
        </div>
      ))}
    </div>
    
    {/* Content skeleton */}
    <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
      <div className="h-6 w-40 bg-slate-200 rounded mb-4"></div>
      <div className="h-64 bg-slate-100 rounded"></div>
    </div>
  </div>
);

type WritableFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type FilePickerWindow = typeof globalThis & {
  showSaveFilePicker: (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<WritableFileHandle>;
  showOpenFilePicker: (options: {
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<WritableFileHandle[]>;
};

const MainLayout: React.FC = () => {
  const { user, loading, mustChangePassword } = useAuth();
  const sessionReady = useSessionReady();
  const { showToast, showConfirm } = useToast();
  const { activeFiscalYear, isReadOnly } = useFiscalYear();
  // --- STATE ---

  // Initialize with empty arrays - data will be loaded from Appwrite or localStorage in useEffect
  // This prevents stale localStorage data from being shown when using Appwrite
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [accountingEntries, setAccountingEntries] = useState<AccountingEntry[]>([]);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  // UI States
  const [viewingDoc, setViewingDoc] = useState<{
    file?: File; 
    appwriteFileId?: string; 
    mimeType?: string;
    title?: string
  } | null>(null);

  // --- FILE SYSTEM STATE ---
  const [fileHandle, setFileHandle] = useState<WritableFileHandle | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [isLocalFileMode, setIsLocalFileMode] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Settings, persistence and Appwrite sync are managed by useAppSettings.
  const { settings, setSettings, handleUpdateSettings, settingsRef, defaultSettingsRef } = useAppSettings(user, isLocalFileMode);

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

  // State para mensajes de éxito
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Helper to show success message to user with auto-clear
  const showSuccess = useCallback((message: string, autoClearMs = 5000) => {
    setSuccessMessage(message);
    if (autoClearMs > 0) {
      setTimeout(() => setSuccessMessage(null), autoClearMs);
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
  // Refs are now managed by useAppSettings.
  // Ref to prevent double initialization in React Strict Mode
  const dataLayerInitializedRef = useRef(false);
  const [isDataLayerInitialized, setIsDataLayerInitialized] = useState(false);

  // --- DATA LAYER INITIALIZATION & REALTIME ---
  // NOTE: This effect depends on `user` AND `sessionReady` to ensure:
  // 1. User is authenticated
  // 2. Session has stabilized after login (avoids 401 race conditions)
  // It uses refs (settingsRef, defaultSettingsRef) to access current settings without
  // triggering re-runs when settings change.
  useEffect(() => {
      if (!user) {
          setIsDataLoading(false);
          // Reset initialization flag on logout so we can re-initialize on next login
          dataLayerInitializedRef.current = false;
          setIsDataLayerInitialized(false);
          return;
      }

      // CRITICAL: Wait for session to be ready before making any Appwrite calls
      // This prevents 401 errors that occur when trying to access the API
      // before the session cookie/localStorage is fully synchronized
      if (!sessionReady) {
          console.warn('[App] Waiting for session to be ready...');
          return;
      }

      // Prevent double initialization in React Strict Mode
      if (dataLayerInitializedRef.current) {
          console.warn('[App] Data layer already initialized, skipping...');
          return;
      }
      dataLayerInitializedRef.current = true;
      // NOTE: setIsDataLayerInitialized(true) is called INSIDE initDataLayer() after the
      // initial data fetch completes, NOT here.  Moving it here (before the async work)
      // caused a race condition (BUG-023): the year-change effect could start its
      // filtered fetch while the unfiltered initial fetch was still in flight, and
      // whichever resolved last would win — showing data from the wrong fiscal year.

      const initDataLayer = async () => {
          // Use ref to get current settings as fallback, avoiding dependency issues
          const freshSettings = loadPersistedState<AppSettings>('gestcb_settings', settingsRef.current);
          setIsDataLoading(true);

          if (freshSettings.dataConfig?.type === 'APPWRITE') {
              // NOTE: Appwrite client is already initialized via lib/appwrite/client.ts
              // Authentication is handled by AuthContext and authService

              // PERFORM HEALTH CHECK - Now safe because sessionReady is true
              // NOTE: If sessionReady is true, it means authService.login() already verified
              // the session successfully. We skip the authentication check here to avoid
              // race conditions where the SDK session isn't fully synced yet.
              console.warn('[App] Session ready, performing health check...');
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

                  // NOTE: We trust the session verification from authService.login()
                  // If we have a user and sessionReady is true, the login was successful.
                  // The health check authentication might fail due to SDK timing issues,
                  // but we should not block data loading if login was verified.
                  if (!healthResult.authenticated) {
                      // Only log warning, don't block - login already verified the session
                      console.warn('[App] Health check auth failed, but login was successful - continuing');
                  }

                  if (!healthResult.collectionsReady) {
                      // Show warning but don't block - some collections might have permission issues
                      console.warn('⚠️ Algunas colecciones no están listas:', healthResult.errors);
                      // Only set error if ALL collections failed, otherwise just warn
                      const criticalErrors = healthResult.errors.filter(e =>
                        !e.includes('permisos') // Permission errors are non-critical
                      );
                      if (criticalErrors.length > 0) {
                        setConnectionError(`Configuración incompleta: ${criticalErrors.join(', ')}`);
                        console.error('❌ Critical collection errors:', criticalErrors);
                      } else {
                        // Only permission issues - log but continue
                        console.warn('✅ Conexión verificada (algunas colecciones con permisos limitados)');
                        setConnectionError(null);
                      }
                  } else {
                      console.warn('✅ Conexión verificada correctamente');
                      setConnectionError(null);
                  }
              } catch (healthError: unknown) {
                  console.error('❌ Health check error:', healthError);
                  // Don't block on health check errors - the login was already successful
                  console.warn('[App] Health check failed, but proceeding with data load');
                  setIsReconnecting(false);
              }

              // 1. Initial Fetch - Load ALL data from Appwrite
              try {
                console.warn('📥 Cargando datos desde Appwrite...');

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
                // Each fetch has its own catch handler to prevent partial failures from breaking the entire load
                // Note: initial load is unfiltered — the fiscal-year-change effect will re-fetch filtered data
                // once FiscalYearContext has loaded the active fiscal year from Appwrite.
                const [remoteInvoices, remoteEntries, remoteTransactions, remoteSuppliers, remoteApartments, remoteRecurringExpenses, remoteReservations] = await Promise.all([
                    appwriteService.fetchInvoices().catch((e) => { console.warn('Failed to fetch invoices:', e); return []; }),
                    appwriteService.fetchEntries().catch((e) => { console.warn('Failed to fetch entries:', e); return []; }),
                    appwriteService.fetchTransactions().catch((e) => { console.warn('Failed to fetch transactions:', e); return []; }),
                    appwriteService.fetchSuppliers().catch((e) => { console.warn('Failed to fetch suppliers:', e); return []; }),
                    appwriteService.fetchApartments().catch((e) => { console.warn('Failed to fetch apartments:', e); return []; }),
                    appwriteService.fetchRecurringExpenses().catch((e) => { console.warn('Failed to fetch recurring expenses:', e); return []; }),
                    appwriteService.fetchReservations().catch((e) => { console.warn('Failed to fetch reservations:', e); return []; })
                ]);

                // Update state with remote data
                setInvoices(remoteInvoices);
                setAccountingEntries(remoteEntries);
                setBankTransactions(remoteTransactions);
                setSuppliers(remoteSuppliers);
                setApartments(remoteApartments);
                setRecurringExpenses(remoteRecurringExpenses);
                setReservations(remoteReservations);

                console.warn(`✅ Datos cargados: ${remoteInvoices.length} facturas, ${remoteEntries.length} asientos, ${remoteTransactions.length} transacciones, ${remoteSuppliers.length} proveedores, ${remoteApartments.length} apartamentos, ${remoteRecurringExpenses.length} gastos recurrentes, ${remoteReservations.length} reservas`);
                setConnectionError(null);
              } catch (e: unknown) {
                  console.warn("Initial sync failed:", e);
                 setConnectionError(`Error al cargar datos: ${e instanceof Error ? e.message : 'Error desconocido'}`);
              } finally {
                  setIsDataLoading(false);
                  // BUG-023 FIX: Signal that initial setup is done only AFTER the data fetch
                  // completes (or fails).  The year-change effect guards on this flag, so
                  // marking it true here ensures the two fetches are sequential rather than
                  // concurrent, preventing unfiltered data from overwriting filtered data.
                  setIsDataLayerInitialized(true);
              }

              // 2. REALTIME SUBSCRIPTION - OPTIMIZED
              // Instead of fetching all data on every change (which causes rate limiting),
              // we invalidate the cache and let the next user action trigger a fresh fetch
              const unsubscribe = appwriteService.subscribeToChanges((payload) => {
                  if (payload.events.some((e:string) => e.includes('.create') || e.includes('.update') || e.includes('.delete'))) {
                      // Import cache dynamically to avoid circular deps
                      import('./lib/appwrite/cache').then(({ cache }) => {
                          console.warn('[Realtime] Change detected, invalidating cache...');
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
      initDataLayer().finally(() => {
          setIsDataLayerInitialized(true);
      });
      // Refs (defaultSettingsRef, settingsRef) and setState dispatcher (setSettings) are
      // stable across renders — including them would cause unnecessary re-inits.
      // Re-run only when the authenticated user or session readiness changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReady, user]); // Only re-init on login/logout — fiscal year changes handled below

  // --- RELOAD DATA WHEN ACTIVE FISCAL YEAR CHANGES ---
  // Separate from the heavy initDataLayer so health checks are not repeated.
  // Runs only AFTER the initial data layer is initialized (guard via ref).
  //
  // BUG-021 FIX: Race condition guard.
  // Without the cleanup function, if the user switches exercises rapidly (or if
  // a new exercise is created and they immediately switch back), two concurrent
  // fetches can be in flight at the same time.  Whichever resolves last wins and
  // overwrites the state, so the user can end up seeing data from the WRONG
  // exercise (e.g. 2027 apartments shown while 2026 is selected in the header).
  // The `cancelled` flag ensures that only the fetch belonging to the CURRENT
  // render cycle can commit its results to state.
  useEffect(() => {
    if (!user || !sessionReady || !isDataLayerInitialized) return;

    let cancelled = false;

    const fetchForYear = async () => {
      const fyId = activeFiscalYear?.appwriteId || activeFiscalYear?.id;
      setIsDataLoading(true);
      try {
        const [remoteInvoices, remoteEntries, remoteTransactions, remoteSuppliers, remoteApartments, remoteRecurringExpenses, remoteReservations] = await Promise.all([
          appwriteService.fetchInvoices(fyId).catch((e) => { console.warn('Failed to fetch invoices on year change:', e); return []; }),
          appwriteService.fetchEntries(fyId).catch((e) => { console.warn('Failed to fetch entries on year change:', e); return []; }),
          appwriteService.fetchTransactions(fyId).catch((e) => { console.warn('Failed to fetch transactions on year change:', e); return []; }),
          appwriteService.fetchSuppliers(fyId).catch((e) => { console.warn('Failed to fetch suppliers on year change:', e); return []; }),
          appwriteService.fetchApartments(fyId).catch((e) => { console.warn('Failed to fetch apartments on year change:', e); return []; }),
          appwriteService.fetchRecurringExpenses().catch((e) => { console.warn('Failed to fetch recurring expenses on year change:', e); return []; }),
          appwriteService.fetchReservations(fyId).catch((e) => { console.warn('Failed to fetch reservations on year change:', e); return []; }),
        ]);

        // Discard results if the exercise changed again while this fetch was in flight.
        if (cancelled) return;

        setInvoices(remoteInvoices);
        setAccountingEntries(remoteEntries);
        setBankTransactions(remoteTransactions);
        setSuppliers(remoteSuppliers);
        setApartments(remoteApartments);
        setRecurringExpenses(remoteRecurringExpenses);
        setReservations(remoteReservations);
        console.warn(`[App] Data reloaded for fiscal year: ${activeFiscalYear?.year ?? 'all'}`);
      } catch (e: unknown) {
        if (!cancelled) {
          console.warn('[App] Failed to reload data for fiscal year:', e);
        }
      } finally {
        if (!cancelled) {
          setIsDataLoading(false);
        }
      }
    };

    fetchForYear();

    // Cleanup: mark this effect's fetch as stale when the exercise changes again.
    return () => {
      cancelled = true;
    };
  }, [activeFiscalYear, user, sessionReady, isDataLayerInitialized]); // Lightweight reload on year switch

  // --- HEALTH CHECK PERIÓDICO (cada 5 min) ---
  // Verifica conexión con Appwrite cuando hay usuario autenticado
  useEffect(() => {
    if (!user || !sessionReady || settings.dataConfig?.type !== 'APPWRITE') {
      return;
    }

    const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutos

    const performPeriodicHealthCheck = async () => {
      console.warn('[App] Ejecutando health check periódico...');
      try {
        const healthResult = await appwriteService.performHealthCheck();

        if (!healthResult.connected) {
          console.warn('[App] Health check: conexión perdida');
          setConnectionError('Se ha perdido la conexión con el servidor.');
        } else if (!healthResult.authenticated) {
          console.warn('[App] Health check: sesión no válida');
          // El AuthContext manejará esto via el global 401 handler
        } else {
          // Conexión OK - limpiar errores si los había
          if (connectionError) {
            console.warn('[App] Health check: conexión recuperada');
            setConnectionError(null);
          }
        }
      } catch (error) {
        console.error('[App] Health check periódico error:', error);
        // No mostrar error por un fallo puntual del health check
      }
    };

    const healthCheckInterval = setInterval(performPeriodicHealthCheck, HEALTH_CHECK_INTERVAL);

    return () => {
      clearInterval(healthCheckInterval);
    };
  }, [user, sessionReady, settings.dataConfig?.type, connectionError]);

  // --- PERSISTENCE EFFECTS ---
  // Settings persistence is handled by useAppSettings.

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
                  const writable = await fileHandleRef.current.createWritable();
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
  const {
    handleAddInvoice,
    handleUpdateInvoice,
    handleDeleteInvoice,
    handleAddEntry,
    handleUpdateEntry,
    handleDeleteEntry,
    handleAddBankTransactions,
    handleCreateEntryFromTransaction,
    handleReconcileTransaction,
    handleAddSupplier,
    handleUpdateSupplier,
    handleDeleteSupplier,
    handleAddApartment,
    handleUpdateApartment,
    handleDeleteApartment,
    handleAddRecurringExpense,
    handleUpdateRecurringExpense,
    handleDeleteRecurringExpense,
    handleAddReservations,
    handleUpdateReservation,
    handleDeleteReservation,
    handleLinkApartmentToReservation
  } = useDataHandlers({
    data: {
      invoices,
      entries: accountingEntries,
      transactions: bankTransactions,
      suppliers,
      apartments,
      recurringExpenses,
      reservations,
      settings
    },
    setters: {
      setInvoices,
      setEntries: setAccountingEntries,
      setTransactions: setBankTransactions,
      setSuppliers,
      setApartments,
      setRecurringExpenses,
      setReservations,
      setSettings
    },
    showError,
    showSuccess,
    isReadOnly,
    showToast,
    activeFiscalYearId: activeFiscalYear?.appwriteId || activeFiscalYear?.id
  });

  // Legacy File Handlers
  const handleCloneToFile = async (password: string) => {
      try {
          const handle = await (window as unknown as FilePickerWindow).showSaveFilePicker({
              suggestedName: `Contabilidad_CBGest_${new Date().toISOString().split('T')[0]}.gestcb`,
              types: [{ description: 'CBGest Secure File', accept: { 'application/gestcb': ['.gestcb'] } }],
          });
          setFileHandle(handle);
          setEncryptionKey(password);
          setIsLocalFileMode(true);
     } catch (error: unknown) {
         if (error instanceof Error && (error.name === 'SecurityError' || error.name === 'NotAllowedError')) {
             console.warn("File access denied in iframe");
             showToast("Tu navegador o este entorno de previsualización bloquea el acceso al disco. Usa la opción 'Descargar JSON' en la pestaña Datos.", 'warning');
          }
      }
  };
  
  const handleLoadFromFile = async (password: string) => {
       try {
          const [handle] = await (window as unknown as FilePickerWindow).showOpenFilePicker({
              types: [{ description: 'CBGest Secure File', accept: { 'application/gestcb': ['.gestcb'] } }],
          });
          // Logic to read file would go here if we implemented the full reader...
          // For now, we just set mode
          setFileHandle(handle);
          setEncryptionKey(password);
          setIsLocalFileMode(true);
      } catch {
           console.warn("File access denied in iframe");
           showToast("Acceso denegado al sistema de archivos. Prueba en una ventana nueva.", 'warning');
      }
  };
  const handleDisconnectFile = () => { setIsLocalFileMode(false); setFileHandle(null); setEncryptionKey(null); };

  if (loading) {
    // Show skeleton during auth check for better LCP
    return (
      <div className="min-h-screen bg-slate-50 flex">
        {/* Sidebar skeleton - hidden on mobile */}
        <div className="hidden md:flex w-64 flex-col p-6" style={{background: 'linear-gradient(180deg, #1e3a5f 0%, #0f172a 100%)'}}>
          <div className="w-12 h-15 bg-white/10 rounded-lg mb-8 animate-pulse"></div>
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-10 bg-white/5 rounded-lg mb-2 animate-pulse"></div>
          ))}
        </div>
        {/* Main content skeleton */}
        <div className="flex-1 flex flex-col">
          <div className="h-16 bg-white border-b border-slate-200 flex items-center px-6">
            <div className="w-72 h-10 bg-slate-100 rounded-lg animate-pulse"></div>
          </div>
          <div className="flex-1 p-8">
            <div className="h-8 w-48 bg-slate-200 rounded-md mb-6 animate-pulse"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1,2,3].map(i => (
                <div key={i} className="bg-white p-6 rounded-xl border border-slate-100 animate-pulse">
                  <div className="h-4 w-24 bg-slate-200 rounded mb-4"></div>
                  <div className="h-8 w-32 bg-slate-100 rounded"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user && settings.dataConfig?.type === 'APPWRITE') {
      return <Login />;
  }

  // Bloquea el acceso a la app hasta que el usuario cambie su contraseña
  // temporal (asignada por un administrador) por una definitiva.
  if (user && mustChangePassword && settings.dataConfig?.type === 'APPWRITE') {
      return <ForcePasswordChange />;
  }

  // Show loading state while fetching data from Appwrite - with skeleton
  if (isDataLoading && settings.dataConfig?.type === 'APPWRITE') {
    return (
      <div className="min-h-screen bg-slate-50 flex">
        {/* Sidebar skeleton */}
        <div className="hidden md:flex w-64 flex-col p-6" style={{background: 'linear-gradient(180deg, #1e3a5f 0%, #0f172a 100%)'}}>
          <div className="w-12 h-15 bg-white/10 rounded-lg mb-8 animate-pulse"></div>
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-10 bg-white/5 rounded-lg mb-2 animate-pulse"></div>
          ))}
        </div>
        {/* Main content with loading indicator */}
        <div className="flex-1 flex flex-col">
          <div className="h-16 bg-white border-b border-slate-200 flex items-center px-6">
            <div className="w-72 h-10 bg-slate-100 rounded-lg animate-pulse"></div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full"></div>
            <p className="text-slate-600">Cargando datos...</p>
          </div>
        </div>
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
      if (!settings.dataConfig?.appwriteProjectId || !settings.dataConfig?.appwriteDatabaseId || !settings.dataConfig?.appwriteBucketId) {
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
            {/* Success Message Banner */}
            {successMessage && (
              <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 mx-4 mt-4 rounded-r-lg animate-fade-in">
                <div className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  <p className="text-emerald-700 flex-1">{successMessage}</p>
                  <button
                    onClick={() => setSuccessMessage(null)}
                    className="text-emerald-400 hover:text-emerald-600"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
            {/* Read-Only Banner */}
            {isReadOnly && activeFiscalYear && (
              <div className="bg-amber-50 border-l-4 border-amber-500 p-3 mx-4 mt-4 rounded-r-lg flex items-center gap-3">
                <Lock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="text-amber-800 text-sm font-medium">
                  Ejercicio {activeFiscalYear.year} cerrado — <strong>Solo consulta</strong>. No se pueden añadir, editar ni eliminar datos.
                </span>
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
            <main className="main-content min-h-[calc(100vh-4rem)] relative">
              <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Dashboard invoices={invoices} settings={settings} apartments={apartments} recurringExpenses={recurringExpenses} reservations={reservations} onUpdateSettings={handleUpdateSettings} />} />
                <Route path="/invoices" element={
                  <div className="p-4 md:p-8 animate-fade-in">
                    <InvoiceUploader
                        onInvoiceAdded={handleAddInvoice}
                        onBankTransactionsAdded={handleAddBankTransactions}
                        settings={settings}
                        apartments={apartments}
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
                                      onClick={() => {
                                        if (inv.appwriteFileId) {
                                          setViewingDoc({ appwriteFileId: inv.appwriteFileId, mimeType: inv.fileType, title: inv.number });
                                        } else if (inv.file) {
                                          setViewingDoc({ file: inv.file, title: inv.number });
                                        }
                                      }}
                                      disabled={!inv.appwriteFileId && !inv.file}
                                      className={`p-1 ${inv.appwriteFileId || inv.file ? 'text-slate-400 hover:text-blue-600' : 'text-slate-200 cursor-not-allowed'}`}
                                      title={inv.appwriteFileId || inv.file ? 'Ver documento' : 'Sin documento adjunto'}
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={async () => {
                                        if (await showConfirm('¿Eliminar esta factura?')) {
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
                                  onClick={() => {
                                    if (inv.appwriteFileId) {
                                      setViewingDoc({ appwriteFileId: inv.appwriteFileId, mimeType: inv.fileType, title: inv.number });
                                    } else if (inv.file) {
                                      setViewingDoc({ file: inv.file, title: inv.number });
                                    }
                                  }}
                                  disabled={!inv.appwriteFileId && !inv.file}
                                  className={`flex-1 text-xs font-medium uppercase ${inv.appwriteFileId || inv.file ? 'text-blue-600' : 'text-slate-300 cursor-not-allowed'}`}
                                >
                                  Ver PDF
                                </button>
                                <button
                                  onClick={async () => {
                                    if (await showConfirm('¿Eliminar esta factura?')) {
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
                <Route path="/apartments" element={
                    <ApartmentManager
                        apartments={apartments}
                        onAddApartment={handleAddApartment}
                        onUpdateApartment={handleUpdateApartment}
                        onDeleteApartment={handleDeleteApartment}
                    />
                } />
                <Route path="/recurring" element={
                    <RecurringExpenseManager
                        expenses={recurringExpenses}
                        apartments={apartments}
                        suppliers={suppliers}
                        onAddExpense={handleAddRecurringExpense}
                        onUpdateExpense={handleUpdateRecurringExpense}
                        onDeleteExpense={handleDeleteRecurringExpense}
                    />
                } />
                <Route path="/reservations" element={
                    <ReservationManager
                        reservations={reservations}
                        apartments={apartments}
                        onAddReservations={handleAddReservations}
                        onUpdateReservation={handleUpdateReservation}
                        onDeleteReservation={handleDeleteReservation}
                        onLinkApartment={handleLinkApartmentToReservation}
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
                <Route path="/ledger" element={
                    <AccountLedger entries={accountingEntries} />
                } />
                <Route path="/trial-balance" element={
                    <TrialBalance entries={accountingEntries} />
                } />
                <Route path="/reconciliation" element={
                    <BankReconciliation
                        transactions={bankTransactions}
                        entries={accountingEntries}
                        invoices={invoices}
                        suppliers={suppliers}
                        recurringExpenses={recurringExpenses}
                        onReconcile={handleReconcileTransaction}
                        onCreateEntryFromTransaction={handleCreateEntryFromTransaction}
                    />
                } />
                <Route
                    path="/taxes"
                    element={
                        <TaxModels
                            invoices={invoices}
                            settings={settings}
                            reservations={reservations}
                            apartments={apartments}
                            onUpdateReservation={handleUpdateReservation}
                        />
                    }
                />
                <Route path="/search" element={
                    <SearchResults
                        invoices={invoices}
                        accountingEntries={accountingEntries}
                        suppliers={suppliers}
                        apartments={apartments}
                        reservations={reservations}
                    />
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
                <Route path="/fiscal-years" element={<FiscalYearManager />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </Suspense>
              <GlobalUploadWidget />
              <Suspense fallback={null}>
                <DocumentViewer 
                  isOpen={!!viewingDoc} 
                  onClose={() => setViewingDoc(null)} 
                  file={viewingDoc?.file} 
                  appwriteFileId={viewingDoc?.appwriteFileId}
                  mimeType={viewingDoc?.mimeType}
                  title={viewingDoc?.title}
                />
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
      <ToastProvider>
        <NotificationProvider>
          <FiscalYearProvider>
            <MainLayout />
          </FiscalYearProvider>
        </NotificationProvider>
      </ToastProvider>
    </AuthProvider>
  );
};

export default App;
