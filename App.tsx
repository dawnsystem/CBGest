import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { MobileNavigation } from './components/MobileNavigation';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { InvoiceUploader } from './components/InvoiceUploader';
import { TaxModels } from './components/TaxModels';
import { AccountingBooks } from './components/AccountingBooks';
import { Settings } from './components/Settings';
import { GlobalUploadWidget } from './components/GlobalUploadWidget'; // Widget Import
import { UploadQueueProvider } from './context/UploadQueueContext'; // Provider Import
import { DocumentViewer } from './components/DocumentViewer'; // New Viewer Import
import { Invoice, AppSettings } from './types';
import { CheckCircle2, Clock, History, CreditCard, ChevronDown, ChevronUp, User, Calendar, Eye } from 'lucide-react';

const App: React.FC = () => {
  // Default settings for Rental CB scenario
  const [settings, setSettings] = useState<AppSettings>({
    cbName: 'CB Hermanos Turismo',
    nif: '',
    fiscalRegime: 'ALQUILER_EXENTO',
    vatObligation: false,
    partners: [
      { id: '1', name: 'Socio A (Tú)', nif: '', participation: 50 },
      { id: '2', name: 'Socio B (Hermano)', nif: '', participation: 50 }
    ]
  });

  // Global state for the demo
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<string>>(new Set());
  
  // Document Viewer State
  const [viewingDoc, setViewingDoc] = useState<Invoice | null>(null);

  // Load some mock data on init
  useEffect(() => {
    setInvoices([
      {
        id: '1',
        number: 'F2024-001',
        date: '2024-01-15',
        issuerName: 'Reformas Pepe SL',
        issuerNif: 'B12345678',
        baseAmount: 1000,
        vatRate: 21,
        vatAmount: 210,
        totalAmount: 1210,
        type: 'EXPENSE',
        status: 'PROCESSED',
        history: [
          { date: '2024-01-15T10:00:00Z', action: 'Created', user: 'System' },
          { date: '2024-01-15T10:05:00Z', action: 'Processed', user: 'Admin' }
        ]
      },
      {
        id: '2',
        number: 'ALQ-ENERO',
        date: '2024-01-20',
        issuerName: 'Inquilino Piso 1',
        issuerNif: 'A87654321',
        baseAmount: 2500,
        vatRate: 0,
        vatAmount: 0,
        totalAmount: 2500,
        type: 'INCOME',
        status: 'PAID',
        history: [
          { date: '2024-01-20T09:00:00Z', action: 'Created', user: 'System' },
          { date: '2024-01-21T14:30:00Z', action: 'Marked as PAID', user: 'Admin' }
        ]
      }
    ]);
  }, []);

  const handleAddInvoice = (invoice: Invoice) => {
    setInvoices(prev => [invoice, ...prev]);
  };

  const togglePaymentStatus = (id: string) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id === id) {
        const newStatus = inv.status === 'PAID' ? 'PROCESSED' : 'PAID';
        return {
          ...inv,
          status: newStatus,
          history: [
            ...inv.history,
            {
              date: new Date().toISOString(),
              action: `Status changed to ${newStatus}`,
              user: 'Admin Gestor'
            }
          ]
        };
      }
      return inv;
    }));
  };

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedInvoiceIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedInvoiceIds(newSet);
  };

  const handleViewDocument = (invoice: Invoice) => {
    if (invoice.file) {
        setViewingDoc(invoice);
    } else {
        alert("No hay documento digital adjunto para esta factura (es un dato simulado). Sube una factura nueva para probar el visor.");
    }
  };

  return (
    <UploadQueueProvider>
      <HashRouter>
        <div className="min-h-screen bg-slate-50 flex font-sans">
          <Sidebar />
          
          {/* Layout fix: ml-0 on mobile, ml-64 on desktop */}
          <div className="flex-1 ml-0 md:ml-64 transition-all duration-200">
            <Header />
            
            {/* Added pb-20 to prevent content from being hidden behind bottom nav */}
            <main className="min-h-[calc(100vh-4rem)] pb-24 md:pb-8 relative">
              <Routes>
                <Route path="/" element={<Dashboard invoices={invoices} settings={settings} />} />
                <Route path="/invoices" element={
                  <div className="p-4 md:p-8 animate-fade-in">
                    <div className="mb-8">
                      <h2 className="text-2xl font-bold text-slate-900">Gestión de Facturas</h2>
                      <p className="text-slate-500">Bandeja de entrada y procesamiento inteligente.</p>
                    </div>
                    <InvoiceUploader onInvoiceAdded={handleAddInvoice} settings={settings} />
                    
                    <div className="mt-12">
                      <h3 className="text-lg font-semibold text-slate-900 mb-4">Últimas Facturas Registradas</h3>
                      <div className="grid gap-4">
                        {invoices.map(inv => {
                          const isExpanded = expandedInvoiceIds.has(inv.id);
                          return (
                            <div key={inv.id} className="bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden">
                              <div className="p-4 flex justify-between items-center cursor-pointer" onClick={() => toggleExpand(inv.id)}>
                                <div className="flex items-center gap-3 md:gap-4">
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 ${inv.type === 'INCOME' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                                    {inv.type === 'INCOME' ? 'V' : 'G'}
                                  </div>
                                  <div className="overflow-hidden">
                                    <p className="font-medium text-slate-900 truncate">{inv.issuerName}</p>
                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                      <span>{inv.number}</span>
                                      <span className="hidden md:inline">•</span>
                                      <span className="hidden md:inline">{inv.date}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 md:gap-6">
                                  <div className="text-right">
                                    <p className="font-bold text-slate-900 text-sm md:text-base">{inv.totalAmount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                                    <span className={`text-[10px] md:text-xs px-2 py-0.5 rounded-full font-medium ${
                                      inv.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 
                                      inv.status === 'PROCESSED' ? 'bg-blue-100 text-blue-700' :
                                      'bg-orange-100 text-orange-700'
                                    }`}>
                                      {inv.status === 'PAID' ? 'PAGADA' : inv.status === 'PROCESSED' ? 'CONTABIL' : 'PENDIENTE'}
                                    </span>
                                  </div>
                                  
                                  <div className="flex items-center gap-1 md:gap-2" onClick={(e) => e.stopPropagation()}>
                                    {/* Document Viewer Button */}
                                    <button
                                      onClick={() => handleViewDocument(inv)}
                                      title="Ver documento adjunto"
                                      className="p-2 rounded-full text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                    >
                                        <Eye className="w-5 h-5" />
                                    </button>

                                    <button
                                      onClick={() => togglePaymentStatus(inv.id)}
                                      title={inv.status === 'PAID' ? "Marcar como no pagada" : "Marcar como pagada"}
                                      className={`p-2 rounded-full transition-colors hidden md:block ${
                                        inv.status === 'PAID' 
                                          ? 'bg-emerald-50 text-emerald-600 hover:bg-red-50 hover:text-red-600' 
                                          : 'bg-slate-100 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'
                                      }`}
                                    >
                                      {inv.status === 'PAID' ? <CheckCircle2 className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
                                    </button>
                                    <button 
                                      onClick={() => toggleExpand(inv.id)}
                                      className="p-1 md:p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                                    >
                                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Collapsible History Section */}
                              {isExpanded && (
                                <div className="bg-slate-50 px-4 py-3 border-t border-slate-100 animate-fade-in">
                                  {/* Mobile only action buttons */}
                                  <div className="md:hidden flex justify-end mb-3 pb-3 border-b border-slate-200">
                                     <button
                                      onClick={() => togglePaymentStatus(inv.id)}
                                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
                                        inv.status === 'PAID' 
                                          ? 'bg-red-100 text-red-700' 
                                          : 'bg-emerald-100 text-emerald-700'
                                      }`}
                                    >
                                       {inv.status === 'PAID' ? 'Marcar Pendiente' : 'Marcar Pagada'}
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-2 mb-3 text-slate-500">
                                    <History className="w-4 h-4" />
                                    <h4 className="text-xs font-bold uppercase tracking-wide">Historial de Actividad</h4>
                                  </div>
                                  <div className="space-y-3 pl-1">
                                    {inv.history.slice().reverse().slice(0, 3).map((event, idx) => (
                                      <div key={idx} className="flex items-start gap-3 text-sm">
                                        <div className="min-w-[140px] flex items-center gap-1 text-slate-400 text-xs font-mono mt-0.5">
                                          <Calendar className="w-3 h-3" />
                                          {new Date(event.date).toLocaleString()}
                                        </div>
                                        <div className="flex-1">
                                          <p className="text-slate-700 font-medium text-xs md:text-sm">{event.action}</p>
                                        </div>
                                      </div>
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
                    <AccountingBooks invoices={invoices} onViewDocument={handleViewDocument} />
                } />
                <Route path="/settings" element={<Settings settings={settings} onUpdateSettings={setSettings} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>

              <GlobalUploadWidget />
              
              {/* Universal Document Viewer Modal */}
              <DocumentViewer 
                isOpen={!!viewingDoc} 
                onClose={() => setViewingDoc(null)} 
                file={viewingDoc?.file}
                title={viewingDoc ? `${viewingDoc.number} - ${viewingDoc.issuerName}` : undefined}
              />

            </main>
          </div>
          
          {/* Mobile Navigation Component */}
          <MobileNavigation />
        </div>
      </HashRouter>
    </UploadQueueProvider>
  );
};

export default App;