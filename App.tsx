
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
import { CheckCircle2, Calendar, History, CreditCard, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { encryptData, decryptData } from './utils/crypto';

// Helper for Lazy Initialization from LocalStorage
const loadState = <T,>(key: string, fallback: T): T => {
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error(`Error parsing ${key}`, e);
    }
  }
  return fallback;
};

// Helper to rehydrate files from Base64
const base64ToFile = (dataurl: string, filename: string, mimeType: string): File => {
    try {
        const arr = dataurl.split(',');
        const bstr = atob(arr.length > 1 ? arr[1] : arr[0]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while(n--){
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, {type: mimeType});
    } catch (e) {
        console.error("Error reconstructing file:", e);
        return new File([""], filename, {type: mimeType});
    }
};

// Type for file picker
declare global {
    interface Window {
        showSaveFilePicker: (options?: any) => Promise<FileSystemFileHandle>;
        showOpenFilePicker: (options?: any) => Promise<FileSystemFileHandle[]>;
    }
}

const App: React.FC = () => {
  // --- STATE WITH PERSISTENCE ---
  
  // 1. Settings State
  const [settings, setSettings] = useState<AppSettings>(() => loadState('gestcb_settings', {
    cbName: 'Nueva Comunidad de Bienes',
    nif: '',
    fiscalRegime: 'ALQUILER_EXENTO',
    vatObligation: false,
    partners: [
      { id: '1', name: 'Socio Fundador', nif: '', participation: 100 }
    ],
    dataConfig: { type: 'LOCAL_STORAGE', autoBackup: false }
  }));

  // 2. Invoices State
  const [invoices, setInvoices] = useState<Invoice[]>(() => loadState('gestcb_invoices', []));
  
  // 3. Accounting Entries State
  const [accountingEntries, setAccountingEntries] = useState<AccountingEntry[]>(() => loadState('gestcb_entries', []));

  // 4. Bank Transactions State
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>(() => loadState('gestcb_bank_transactions', []));

  // UI States
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<string>>(new Set());
  const [viewingDoc, setViewingDoc] = useState<{file: File, title?: string} | null>(null);

  // --- FILE SYSTEM STATE ---
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [isLocalFileMode, setIsLocalFileMode] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // --- PERSISTENCE EFFECTS (LOCAL STORAGE - Fallback/Cache) ---
  useEffect(() => {
      if (!isLocalFileMode) {
        localStorage.setItem('gestcb_settings', JSON.stringify(settings));
        // For local storage, we don't need to do anything special with Base64 as it's already in the object if added
        localStorage.setItem('gestcb_invoices', JSON.stringify(invoices));
        localStorage.setItem('gestcb_entries', JSON.stringify(accountingEntries));
        localStorage.setItem('gestcb_bank_transactions', JSON.stringify(bankTransactions));
      }
  }, [settings, invoices, accountingEntries, bankTransactions, isLocalFileMode]);

  // --- PERSISTENCE EFFECTS (ENCRYPTED FILE SYSTEM) ---
  // Debounce save to disk to avoid thrashing
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
      if (isLocalFileMode && fileHandle && encryptionKey) {
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          
          saveTimeoutRef.current = setTimeout(async () => {
              try {
                  const fullData = JSON.stringify({
                      invoices,
                      entries: accountingEntries,
                      transactions: bankTransactions,
                      settings
                  });
                  
                  const encryptedBlob = await encryptData(fullData, encryptionKey);
                  const writable = await (fileHandle as any).createWritable();
                  await writable.write(encryptedBlob);
                  await writable.close();
                  setLastSaved(new Date());
                  console.log("💾 Encrypted data saved to disk successfully.");
              } catch (err) {
                  console.warn("Failed to save encrypted file:", err);
                  // Silent fail on auto-save in restricted envs to avoid spamming alerts
              }
          }, 1000); // 1 second debounce
      }
  }, [settings, invoices, accountingEntries, bankTransactions, isLocalFileMode, fileHandle, encryptionKey]);


  // --- FILE SYSTEM HANDLERS ---
  const handleCloneToFile = async (password: string) => {
      try {
          if (typeof window.showSaveFilePicker !== 'function') {
             throw new Error("Tu navegador no soporta la API de Sistema de Archivos (FileSystemAccess). Usa Chrome, Edge o un navegador de escritorio moderno.");
          }

          const handle = await window.showSaveFilePicker({
              suggestedName: `Contabilidad_GestCB_${new Date().toISOString().split('T')[0]}.gestcb`,
              types: [{
                  description: 'GestCB Secure Database',
                  accept: { 'application/json': ['.gestcb'] },
              }],
          });
          
          setFileHandle(handle);
          setEncryptionKey(password);
          setIsLocalFileMode(true);
          setLastSaved(new Date());
          
          // Trigger immediate save via effect
          setSettings(s => ({...s, dataConfig: { ...s.dataConfig, type: 'LOCAL_FILE', fileName: handle.name } as any}));
          alert("Archivo creado y encriptado exitosamente.\n\nA partir de ahora, todos los cambios se guardarán automáticamente en este archivo.");

      } catch (err: any) {
          // Use warn instead of error to avoid triggering system-level error reporting in previews
          console.warn("File creation cancelled or failed", err); 
          if (err.name === 'AbortError') return; // User cancelled
          
          let errorMsg = "Error al crear archivo.";
          if (err.message && (err.message.includes('Cross origin') || err.message.includes('SecurityError'))) {
              errorMsg = "⚠️ MODO PREVISUALIZACIÓN DETECTADO:\n\nEl navegador bloquea el acceso directo al disco duro dentro de esta ventana (iframe). \n\nPara usar el 'Modo Archivo Seguro', por favor abre la aplicación en una pestaña nueva (Open in New Tab) o usa la opción 'Descargar JSON'.";
          } else {
              errorMsg = err.message || errorMsg;
          }
          alert(errorMsg);
      }
  };

  const handleLoadFromFile = async (password: string) => {
      try {
          if (typeof window.showOpenFilePicker !== 'function') {
              throw new Error("Tu navegador no soporta la API de Sistema de Archivos.");
          }

          const [handle] = await window.showOpenFilePicker({
              types: [{
                  description: 'GestCB Secure Data',
                  accept: { 'application/json': ['.gestcb'] },
              }],
              multiple: false
          });

          const file = await handle.getFile();
          const encryptedContent = await file.text();
          
          const decryptedJson = await decryptData(encryptedContent, password);
          const data = JSON.parse(decryptedJson);

          // HYDRATE STATE & RECONSTRUCT FILES
          if (data.invoices) {
              // Re-create File objects from Base64 string
              const hydratedInvoices: Invoice[] = data.invoices.map((inv: Invoice) => ({
                  ...inv,
                  file: (inv.fileData && inv.fileType) ? base64ToFile(inv.fileData, `adjunto-${inv.number || 'doc'}.pdf`, inv.fileType) : undefined
              }));
              setInvoices(hydratedInvoices);
          }
          
          if (data.entries) {
              const hydratedEntries: AccountingEntry[] = data.entries.map((entry: AccountingEntry) => ({
                  ...entry,
                  referenceDoc: (entry.fileData && entry.fileType) ? base64ToFile(entry.fileData, `asiento-${entry.id}.pdf`, entry.fileType) : undefined
              }));
              setAccountingEntries(hydratedEntries);
          }
          
          if (data.transactions) setBankTransactions(data.transactions);
          if (data.settings) setSettings({ ...data.settings, dataConfig: { ...data.settings.dataConfig, type: 'LOCAL_FILE', fileName: handle.name } });

          setFileHandle(handle);
          setEncryptionKey(password);
          setIsLocalFileMode(true);
          setLastSaved(new Date());
          alert("Archivo desencriptado y cargado correctamente.");

      } catch (err: any) {
          console.warn("Load failed", err);
          if (err.name === 'AbortError') return;
          
          let errorMsg = "Error al abrir el archivo.";
          if (err.message && (err.message.includes('Cross origin') || err.message.includes('SecurityError'))) {
              errorMsg = "⚠️ MODO PREVISUALIZACIÓN DETECTADO:\n\nEl navegador bloquea el acceso directo al disco duro dentro de esta ventana (iframe). \n\nPara usar el 'Modo Archivo Seguro', por favor abre la aplicación en una pestaña nueva o usa la opción 'Restaurar JSON'.";
          } else if (err.message && err.message.includes('Contraseña incorrecta')) {
              errorMsg = "⛔ Contraseña incorrecta. No se pudo descifrar el archivo.";
          } else {
              errorMsg = err instanceof Error ? err.message : errorMsg;
          }
          alert(errorMsg);
      }
  };

  const handleDisconnectFile = () => {
      setIsLocalFileMode(false);
      setFileHandle(null);
      setEncryptionKey(null);
      setLastSaved(null);
      setSettings(s => ({...s, dataConfig: { ...s.dataConfig, type: 'LOCAL_STORAGE', fileName: undefined } as any}));
      alert("Desconectado del archivo seguro. Estás trabajando en modo navegador local.");
  };


  // --- LOGIC: Invoice -> Accounting Entry Sync ---
  const handleAddInvoice = (invoice: Invoice) => {
    setInvoices(prev => [invoice, ...prev]);
    
    if (invoice.status === 'PROCESSED' || invoice.status === 'PAID') {
        createEntryFromInvoice(invoice);
    }
  };

  const createEntryFromInvoice = (inv: Invoice) => {
    let accountCode = inv.type === 'EXPENSE' ? '600' : '700';
    let accountName = inv.type === 'EXPENSE' ? 'Compras' : 'Ventas';

    if (inv.category) {
        // Supports "CODE - NAME" format
        const parts = inv.category.split(' - ');
        if (parts.length > 1) {
            accountCode = parts[0];
            accountName = parts[1];
        } else {
             // Fallback if old format or just code
             accountCode = parts[0];
        }
    }

    const newEntry: AccountingEntry = {
        id: `AUTO-${inv.id}`,
        date: inv.date,
        concept: `Factura ${inv.number} - ${inv.issuerName}`,
        accountCode: accountCode,
        accountName: accountName,
        debit: inv.type === 'EXPENSE' ? inv.baseAmount : 0,
        credit: inv.type === 'INCOME' ? inv.baseAmount : 0,
        invoiceId: inv.id,
        referenceDoc: inv.file,
        fileData: inv.fileData, // Pass persistence data to entry too
        fileType: inv.fileType,
        reconciled: false
    };
    setAccountingEntries(prev => [newEntry, ...prev]);
  };

  const handleAddBankTransactions = (txs: BankTransaction[]) => {
      setBankTransactions(prev => [...prev, ...txs]);
  };

  // --- LOGIC: Ledger CRUD ---
  const handleAddEntry = (entry: AccountingEntry) => {
      setAccountingEntries(prev => [entry, ...prev]);
  };
  const handleUpdateEntry = (entry: AccountingEntry) => {
      setAccountingEntries(prev => prev.map(e => e.id === entry.id ? entry : e));
  };
  const handleDeleteEntry = (id: string) => {
      setAccountingEntries(prev => prev.filter(e => e.id !== id));
  };

  // --- LOGIC: Reconciliation ---
  const handleReconcile = (txId: string, entryId: string) => {
      // Mark both as matched/reconciled
      setBankTransactions(prev => prev.map(t => t.id === txId ? { ...t, status: 'MATCHED', reconciledWithEntryId: entryId } : t));
      setAccountingEntries(prev => prev.map(e => e.id === entryId ? { ...e, reconciled: true } : e));
  };

  const handleCreateEntryFromTransaction = (tx: BankTransaction) => {
      // Auto-create entry from bank movement
      const newEntry: AccountingEntry = {
          id: `BANK-${tx.id}`,
          date: tx.date,
          concept: tx.concept,
          accountCode: tx.amount < 0 ? '626' : '769', // Default guess: 626 bank services or 769 other income
          accountName: tx.amount < 0 ? 'Servicios Bancarios y Similares' : 'Otros Ingresos Financieros',
          debit: tx.amount < 0 ? Math.abs(tx.amount) : 0,
          credit: tx.amount > 0 ? tx.amount : 0,
          reconciled: true // Created from bank, so it is reconciled by definition
      };
      
      setAccountingEntries(prev => [newEntry, ...prev]);
      setBankTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, status: 'MATCHED', reconciledWithEntryId: newEntry.id } : t));
  };

  const togglePaymentStatus = (id: string) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id === id) {
        const newStatus = inv.status === 'PAID' ? 'PROCESSED' : 'PAID';
        return { ...inv, status: newStatus, history: [...inv.history, { date: new Date().toISOString(), action: `Status changed to ${newStatus}`, user: 'Admin' }] };
      }
      return inv;
    }));
  };

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedInvoiceIds);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setExpandedInvoiceIds(newSet);
  };

  return (
    <UploadQueueProvider>
      <HashRouter>
        <div className="min-h-screen bg-slate-50 flex font-sans">
          <Sidebar />
          
          <div className="flex-1 ml-0 md:ml-64 transition-all duration-200">
            <Header isLocalFileMode={isLocalFileMode} />
            
            <main className="min-h-[calc(100vh-4rem)] pb-24 md:pb-8 relative">
              <Routes>
                <Route path="/" element={<Dashboard invoices={invoices} settings={settings} />} />
                <Route path="/invoices" element={
                  <div className="p-4 md:p-8 animate-fade-in">
                    <div className="mb-8">
                      <h2 className="text-2xl font-bold text-slate-900">Gestión de Documentos</h2>
                      <p className="text-slate-500">Facturas y Extractos Bancarios.</p>
                    </div>
                    <InvoiceUploader 
                        onInvoiceAdded={handleAddInvoice} 
                        onBankTransactionsAdded={handleAddBankTransactions}
                        settings={settings} 
                    />
                    
                    <div className="mt-12">
                      <h3 className="text-lg font-semibold text-slate-900 mb-4">
                         {invoices.length > 0 ? 'Últimas Facturas' : 'No hay facturas registradas'}
                      </h3>
                      <div className="grid gap-4">
                        {invoices.map(inv => {
                          const isExpanded = expandedInvoiceIds.has(inv.id);
                          return (
                            <div key={inv.id} className="bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden">
                              <div className="p-4 flex justify-between items-center cursor-pointer" onClick={() => toggleExpand(inv.id)}>
                                <div className="flex items-center gap-3 md:gap-4">
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 ${inv.type === 'INCOME' ? 'bg-emerald-500' : 'bg-rose-500'}`}>{inv.type === 'INCOME' ? 'V' : 'G'}</div>
                                  <div className="overflow-hidden">
                                    <p className="font-medium text-slate-900 truncate">{inv.issuerName}</p>
                                    <div className="flex items-center gap-2 text-xs text-slate-500"><span>{inv.number}</span><span>•</span><span>{inv.date}</span></div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 md:gap-6">
                                  <div className="text-right">
                                    <p className="font-bold text-slate-900 text-sm md:text-base">{inv.totalAmount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                                    <span className={`text-[10px] md:text-xs px-2 py-0.5 rounded-full font-medium ${inv.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : inv.status === 'PROCESSED' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{inv.status === 'PAID' ? 'PAGADA' : inv.status === 'PROCESSED' ? 'CONTABIL' : 'PENDIENTE'}</span>
                                  </div>
                                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <button onClick={() => inv.file && setViewingDoc({file: inv.file, title: inv.number})} className="p-2 rounded-full text-slate-400 hover:text-blue-600"><Eye className="w-5 h-5" /></button>
                                    <button onClick={() => togglePaymentStatus(inv.id)} className={`p-2 rounded-full hidden md:block ${inv.status === 'PAID' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{inv.status === 'PAID' ? <CheckCircle2 className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}</button>
                                    <button onClick={() => toggleExpand(inv.id)} className="p-2 text-slate-400">{isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}</button>
                                  </div>
                                </div>
                              </div>
                              {isExpanded && (
                                <div className="bg-slate-50 px-4 py-3 border-t border-slate-100 animate-fade-in">
                                  <div className="flex items-center gap-2 mb-3 text-slate-500"><History className="w-4 h-4" /><h4 className="text-xs font-bold uppercase tracking-wide">Historial</h4></div>
                                  <div className="space-y-3 pl-1">
                                    {inv.history.slice().reverse().slice(0, 3).map((event, idx) => (
                                      <div key={idx} className="flex items-start gap-3 text-sm"><div className="min-w-[140px] flex items-center gap-1 text-slate-400 text-xs font-mono mt-0.5"><Calendar className="w-3 h-3" />{new Date(event.date).toLocaleString()}</div><div className="flex-1"><p className="text-slate-700 font-medium text-xs md:text-sm">{event.action}</p></div></div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                } />
                <Route path="/taxes" element={<TaxModels invoices={invoices} settings={settings} />} />
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
                        onReconcile={handleReconcile}
                        onCreateEntryFromTransaction={handleCreateEntryFromTransaction}
                    />
                } />
                <Route path="/settings" element={
                    <Settings 
                        settings={settings} 
                        onUpdateSettings={setSettings}
                        onCloneToFile={handleCloneToFile}
                        onLoadFromFile={handleLoadFromFile}
                        onDisconnectFile={handleDisconnectFile}
                        isLocalFileMode={isLocalFileMode}
                        currentFileName={fileHandle?.name}
                        lastSaved={lastSaved}
                    />
                } />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>

              <GlobalUploadWidget />
              
              <DocumentViewer 
                isOpen={!!viewingDoc} 
                onClose={() => setViewingDoc(null)} 
                file={viewingDoc?.file}
                title={viewingDoc?.title}
              />

            </main>
          </div>
          <MobileNavigation />
        </div>
      </HashRouter>
    </UploadQueueProvider>
  );
};

export default App;