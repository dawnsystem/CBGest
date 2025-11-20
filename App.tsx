
import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { MobileNavigation } from './components/MobileNavigation';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { InvoiceUploader } from './components/InvoiceUploader';
import { TaxModels } from './components/TaxModels';
import { AccountingBooks } from './components/AccountingBooks';
import { BankReconciliation } from './components/BankReconciliation'; 
import { Settings } from './components/Settings';
import { GlobalUploadWidget } from './components/GlobalUploadWidget';
import { UploadQueueProvider } from './context/UploadQueueContext';
import { DocumentViewer } from './components/DocumentViewer';
import { Invoice, AppSettings, AccountingEntry, BankTransaction } from './types';
import { Eye } from 'lucide-react';
import { encryptData } from './utils/crypto';
import * as appwriteService from './services/appwriteService';

// AUTH Integration
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';

// Helper for Lazy Initialization from LocalStorage with Safe Merge
const loadState = <T,>(key: string, fallback: T): T => {
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // If it's an array, return it directly (assuming fallback is also array)
      if (Array.isArray(fallback)) return parsed;
      
      // If it's an object (like settings), merge with fallback to ensure new fields exist
      if (typeof fallback === 'object' && fallback !== null) {
          return { ...fallback, ...parsed };
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
        appwriteProjectId: 'cbgest',
        appwriteDatabaseId: 'GestCB_DB',
        appwriteBucketId: 'gestcb-data',
        appwriteEndpoint: 'https://fra.cloud.appwrite.io/v1'
    }
  };

  // Initialize settings with Appwrite config PRE-FILLED to avoid setup loops
  const [settings, setSettings] = useState<AppSettings>(() => loadState('gestcb_settings', defaultSettings));

  const [invoices, setInvoices] = useState<Invoice[]>(() => loadState('gestcb_invoices', []));
  const [accountingEntries, setAccountingEntries] = useState<AccountingEntry[]>(() => loadState('gestcb_entries', []));
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>(() => loadState('gestcb_bank_transactions', []));

  // UI States
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<string>>(new Set());
  const [viewingDoc, setViewingDoc] = useState<{file: File, title?: string} | null>(null);

  // --- FILE SYSTEM STATE ---
  const [fileHandle, setFileHandle] = useState<any | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [isLocalFileMode, setIsLocalFileMode] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // --- DATA LAYER INITIALIZATION & REALTIME ---
  useEffect(() => {
      // Re-read settings from LS in case Login changed them
      const freshSettings = loadState<AppSettings>('gestcb_settings', settings);
      
      // Double check arrays exist in freshSettings
      if (!freshSettings.partners) freshSettings.partners = defaultSettings.partners;

      if(JSON.stringify(freshSettings.dataConfig) !== JSON.stringify(settings.dataConfig)) {
          setSettings(freshSettings);
      }

      if (!user) return; 
      
      const initDataLayer = async () => {
          if (freshSettings.dataConfig?.type === 'APPWRITE' && freshSettings.dataConfig.appwriteProjectId) {
              
              // USE DYNAMIC ENDPOINT FROM SETTINGS
              const endpoint = freshSettings.dataConfig.appwriteEndpoint || 'https://cloud.appwrite.io/v1';
              
              appwriteService.initAppwrite(
                  freshSettings.dataConfig.appwriteProjectId,
                  freshSettings.dataConfig.appwriteBucketId || '',
                  freshSettings.dataConfig.appwriteDatabaseId || '',
                  endpoint
              );
              
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
      if (!isLocalFileMode && settings.dataConfig?.type !== 'APPWRITE') {
        localStorage.setItem('gestcb_settings', JSON.stringify(settings));
        localStorage.setItem('gestcb_invoices', JSON.stringify(invoices));
        localStorage.setItem('gestcb_entries', JSON.stringify(accountingEntries));
        localStorage.setItem('gestcb_bank_transactions', JSON.stringify(bankTransactions));
      }
  }, [settings, invoices, accountingEntries, bankTransactions, isLocalFileMode]);

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
      if (newSettings.dataConfig?.type === 'APPWRITE') {
          appwriteService.updateSettings(newSettings);
      }
  };

  const handleAddInvoice = async (invoice: Invoice) => {
      // Update state immediately for optimistic UI
      setInvoices(prev => [invoice, ...prev]);
      
      let processedInvoice = invoice;

      if (settings.dataConfig?.type === 'APPWRITE') {
          const savedInv = await appwriteService.createInvoice(invoice);
          // Update with real ID from server
          setInvoices(prev => prev.map(i => i.id === invoice.id ? savedInv : i));
          processedInvoice = savedInv;
      } 
      
      // Logic to create accounting entry automatically
      if (processedInvoice.status === 'PROCESSED' || processedInvoice.status === 'PAID') {
          console.log("Auto-creating entry for invoice:", processedInvoice.id);
          createEntryFromInvoice(processedInvoice);
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
  
  const handleAddEntry = async (entry: AccountingEntry) => {
      setAccountingEntries(prev => [entry, ...prev]);
      if (settings.dataConfig?.type === 'APPWRITE') {
          const saved = await appwriteService.createEntry(entry);
          setAccountingEntries(prev => prev.map(e => e.id === entry.id ? saved : e));
      }
  };

  const handleUpdateEntry = async (entry: AccountingEntry) => {
      setAccountingEntries(prev => prev.map(e => e.id === entry.id ? entry : e));
      if (settings.dataConfig?.type === 'APPWRITE') {
          await appwriteService.updateEntry(entry);
      }
  };

  const handleDeleteEntry = async (id: string) => {
      setAccountingEntries(prev => prev.filter(e => e.id !== id));
      const entry = accountingEntries.find(e => e.id === id);
      if (settings.dataConfig?.type === 'APPWRITE' && entry?.appwriteId) {
          await appwriteService.deleteEntry(entry.appwriteId);
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
     
     alert("Asiento creado. Ve a 'Libros Contables' para editar la cuenta si es necesario.");
  };

  // Legacy File Handlers
  const handleCloneToFile = async (password: string) => {
      try {
          const handle = await (window as any).showSaveFilePicker({
              suggestedName: `Contabilidad_GestCB_${new Date().toISOString().split('T')[0]}.gestcb`,
              types: [{ description: 'GestCB Secure File', accept: { 'application/gestcb': ['.gestcb'] } }],
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
              types: [{ description: 'GestCB Secure File', accept: { 'application/gestcb': ['.gestcb'] } }],
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

  return (
    <UploadQueueProvider>
      <HashRouter>
        <div className="min-h-screen bg-slate-50 flex font-sans">
          <Sidebar />
          <div className="flex-1 ml-0 md:ml-64 transition-all duration-200">
            <Header isLocalFileMode={isLocalFileMode} />
            <main className="min-h-[calc(100vh-4rem)] pb-24 md:pb-8 relative">
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
                      <div className="grid gap-4">
                        {invoices.map(inv => (
                            <div key={inv.id} className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 flex justify-between items-center">
                                <span className="font-medium">{inv.issuerName}</span>
                                <button onClick={() => inv.file && setViewingDoc({file: inv.file})}><Eye className="w-5 h-5 text-blue-600" /></button>
                            </div>
                        ))}
                      </div>
                    </div>
                  </div>
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
                        onReconcile={() => {}}
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
              <GlobalUploadWidget />
              <DocumentViewer isOpen={!!viewingDoc} onClose={() => setViewingDoc(null)} file={viewingDoc?.file} />
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
      <MainLayout />
    </AuthProvider>
  );
};

export default App;
