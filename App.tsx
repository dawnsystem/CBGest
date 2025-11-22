
import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { MobileNavigation } from './components/MobileNavigation';
import { Header } from './components/Header';
import { GlobalUploadWidget } from './components/GlobalUploadWidget';
import { UploadQueueProvider } from './context/UploadQueueContext';
import { Invoice, AppSettings, AccountingEntry, BankTransaction, Supplier } from './types';
import { Eye, Trash } from 'lucide-react';
import { encryptData } from './utils/crypto';
import { detectNifType } from './utils/validators';
import * as appwriteService from './services/appwriteService';
import { APPWRITE_CONFIG } from './config/appwrite';

// AUTH Integration
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';

// NOTIFICATIONS Integration
import { NotificationProvider, useNotifications } from './context/NotificationContext';

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

  const [invoices, setInvoices] = useState<Invoice[]>(() => loadState('gestcb_invoices', []));
  const [accountingEntries, setAccountingEntries] = useState<AccountingEntry[]>(() => loadState('gestcb_entries', []));
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>(() => loadState('gestcb_bank_transactions', []));
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => loadState('gestcb_suppliers', []));

  // UI States
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<string>>(new Set());
  const [viewingDoc, setViewingDoc] = useState<{file: File, title?: string} | null>(null);

  // --- FILE SYSTEM STATE ---
  const [fileHandle, setFileHandle] = useState<any | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [isLocalFileMode, setIsLocalFileMode] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // --- SYNC SETTINGS FROM LOCALSTORAGE ---
  useEffect(() => {
      // Re-read settings from LS in case Login changed them
      const freshSettings = loadState<AppSettings>('gestcb_settings', settings);

      // Double check arrays exist in freshSettings
      if (!freshSettings.partners) freshSettings.partners = defaultSettings.partners;

      if(JSON.stringify(freshSettings.dataConfig) !== JSON.stringify(settings.dataConfig)) {
          setSettings(freshSettings);
      }
  }, [user]); // Re-sync when user changes

  // --- DATA LAYER INITIALIZATION & REALTIME ---
  useEffect(() => {
      if (!user) return;

      const initDataLayer = async () => {
          const freshSettings = loadState<AppSettings>('gestcb_settings', settings);

          if (freshSettings.dataConfig?.type === 'APPWRITE') {
              // USE HARDCODED APPWRITE CONFIG
              appwriteService.initializeAppwrite({
                  projectId: APPWRITE_CONFIG.projectId,
                  endpoint: APPWRITE_CONFIG.endpoint,
                  databaseId: APPWRITE_CONFIG.databaseId,
                  storageBucketId: APPWRITE_CONFIG.bucketId,
                  invoicesCollectionId: APPWRITE_CONFIG.collections.invoices,
                  entriesCollectionId: APPWRITE_CONFIG.collections.entries,
                  transactionsCollectionId: APPWRITE_CONFIG.collections.transactions,
                  settingsCollectionId: APPWRITE_CONFIG.collections.settings,
                  notificationsCollectionId: APPWRITE_CONFIG.collections.notifications,
                  uploadsCollectionId: APPWRITE_CONFIG.collections.uploads,
                  suppliersCollectionId: APPWRITE_CONFIG.collections.suppliers
              });
              
              // 1. Initial Fetch
              try {
                const remoteSettings = await appwriteService.syncSettings(freshSettings);
                if (remoteSettings) {
                    // Ensure merged correctly
                    setSettings({
                        ...remoteSettings,
                        partners: remoteSettings.partners || defaultSettings.partners
                    });
                }
                setInvoices(await appwriteService.fetchInvoices());
                setAccountingEntries(await appwriteService.fetchEntries());
                setBankTransactions(await appwriteService.fetchTransactions());
                // Load suppliers from Appwrite
                try {
                  const remoteSuppliers = await appwriteService.fetchSuppliers();
                  setSuppliers(remoteSuppliers);
                } catch (supplierError) {
                  console.warn("Failed to load suppliers:", supplierError);
                }
              } catch (e) {
                  console.warn("Initial sync failed (maybe first run):", e);
              }
              
              // 2. REALTIME SUBSCRIPTION
              const unsubscribe = appwriteService.subscribeToChanges((payload) => {
                  if (payload.events.some((e:string) => e.includes('.create') || e.includes('.update'))) {
                      appwriteService.fetchInvoices().then(setInvoices);
                      appwriteService.fetchEntries().then(setAccountingEntries);
                  }
              });

              return () => {
                  unsubscribe();
              };
          }
      };
      initDataLayer();
  }, [user]); // Depend on user to re-init on login

  // --- PERSISTENCE EFFECTS ---
  useEffect(() => {
      if (!isLocalFileMode) {
        // Only use localStorage if NOT using Appwrite
        // When Appwrite is active, everything is stored in Appwrite collections
        if (settings.dataConfig?.type !== 'APPWRITE') {
          // Save everything to localStorage for LOCAL_STORAGE mode
          localStorage.setItem('gestcb_settings', JSON.stringify(settings));
          localStorage.setItem('gestcb_invoices', JSON.stringify(invoices));
          localStorage.setItem('gestcb_entries', JSON.stringify(accountingEntries));
          localStorage.setItem('gestcb_bank_transactions', JSON.stringify(bankTransactions));
          localStorage.setItem('gestcb_suppliers', JSON.stringify(suppliers));
        }
        // If Appwrite is active, settings are auto-saved via syncSettings in initDataLayer
        // and data (invoices, entries, etc.) are saved via their respective service calls
      }
  }, [settings, invoices, accountingEntries, bankTransactions, suppliers, isLocalFileMode]);

  // Encrypted File Auto-Save
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
      if (isLocalFileMode && fileHandle && encryptionKey) {
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = setTimeout(async () => {
              const fullData = { invoices, entries: accountingEntries, transactions: bankTransactions, settings };
              try {
                  const encryptedBlob = await encryptData(JSON.stringify(fullData), encryptionKey);
                  const writable = await (fileHandle as any).createWritable();
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
  const handleUpdateSettings = (newSettings: AppSettings) => {
      setSettings(newSettings);
      // Settings are auto-saved to localStorage via useEffect
      // If using Appwrite, optionally sync to cloud (not required for basic operation)
  };

  const handleAddInvoice = async (invoice: Invoice) => {
      // Update state immediately for optimistic UI
      setInvoices(prev => [invoice, ...prev]);

      // IMPORTANT: Save original status BEFORE calling Appwrite
      // This ensures we use the correct status for creating accounting entries
      // even if Appwrite's response doesn't include the status field
      const originalStatus = invoice.status;
      const originalInvoice = { ...invoice };

      if (settings.dataConfig?.type === 'APPWRITE') {
          try {
              const savedInv = await appwriteService.createInvoice(invoice);
              // Update with real ID from server, but preserve original status if missing
              const mergedInvoice = {
                  ...savedInv,
                  status: savedInv.status || originalStatus
              };
              setInvoices(prev => prev.map(i => i.id === invoice.id ? mergedInvoice : i));
          } catch (error) {
              console.error('Error saving invoice to Appwrite:', error);
              // Invoice is already in local state, continue with entry creation
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
      setInvoices(prev => prev.map(i => i.id === invoice.id ? invoice : i));

      if (settings.dataConfig?.type === 'APPWRITE') {
          await appwriteService.updateInvoice(invoice);
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
      setInvoices(prev => prev.filter(i => i.id !== id));

      if (settings.dataConfig?.type === 'APPWRITE' && invoice?.appwriteId) {
          await appwriteService.deleteInvoice(invoice.appwriteId);
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
      setAccountingEntries(prev => [entry, ...prev]);
      if (settings.dataConfig?.type === 'APPWRITE') {
          const saved = await appwriteService.createEntry(entry);
          setAccountingEntries(prev => prev.map(e => e.id === entry.id ? saved : e));
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
      setAccountingEntries(prev => prev.map(e => e.id === entry.id ? entry : e));
      if (settings.dataConfig?.type === 'APPWRITE') {
          await appwriteService.updateEntry(entry);
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
      setAccountingEntries(prev => prev.filter(e => e.id !== id));

      if (settings.dataConfig?.type === 'APPWRITE' && entry?.appwriteId) {
          await appwriteService.deleteEntry(entry.appwriteId);
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
      setBankTransactions(prev => [...prev, ...txs]);
      if (settings.dataConfig?.type === 'APPWRITE') {
          txs.forEach(tx => appwriteService.createTransaction(tx));
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

    if (settings.dataConfig?.type === 'APPWRITE' && transaction.appwriteId) {
      try {
        await appwriteService.databaseService.updateTransaction(transaction);
      } catch (error) {
        console.error('Error updating transaction in Appwrite:', error);
      }
    }
  };

  // Supplier Handlers
  const handleAddSupplier = async (supplier: Supplier) => {
      setSuppliers(prev => [supplier, ...prev]);

      if (settings.dataConfig?.type === 'APPWRITE') {
          await appwriteService.createSupplier(supplier);
      }
  };

  const handleUpdateSupplier = async (supplier: Supplier) => {
      setSuppliers(prev => prev.map(s => s.id === supplier.id ? supplier : s));

      if (settings.dataConfig?.type === 'APPWRITE' && supplier.appwriteId) {
          await appwriteService.updateSupplier(supplier);
      }
  };

  const handleDeleteSupplier = async (id: string) => {
      const supplier = suppliers.find(s => s.id === id);
      setSuppliers(prev => prev.filter(s => s.id !== id));

      if (settings.dataConfig?.type === 'APPWRITE' && supplier?.appwriteId) {
          await appwriteService.deleteSupplier(supplier.appwriteId);
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

  // Determine connection status and health
  const connectionStatus: 'APPWRITE' | 'LOCAL' | 'OFFLINE' =
    settings.dataConfig?.type === 'APPWRITE' ? 'APPWRITE' :
    (isLocalFileMode || settings.dataConfig?.type === 'LOCAL_STORAGE') ? 'LOCAL' : 'OFFLINE';

  // Determine connection health
  const connectionHealth: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' = (() => {
    // For Appwrite: check if configured and user is logged in
    if (settings.dataConfig?.type === 'APPWRITE') {
      if (!settings.dataConfig.appwriteProjectId || !settings.dataConfig.appwriteDatabaseId || !settings.dataConfig.appwriteBucketId) {
        return 'DISCONNECTED'; // Not configured
      }
      return user ? 'CONNECTED' : 'DISCONNECTED'; // Connected if user session exists
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
