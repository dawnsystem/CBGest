
import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, X, Play, Trash2, BookPlus, Landmark, ShieldAlert, FileSpreadsheet } from 'lucide-react';
import { useUploadQueue } from '../context/UploadQueueContext';
import { Invoice, AppSettings, QueueItem, UploadType, BankTransaction, Apartment } from '../types';
import { generateId } from '../utils/defaults';
import { AccountSelector } from './AccountSelector';
import { ApartmentSelector } from './ApartmentSelector';
import { XlsxColumnMapper } from './XlsxColumnMapper';
import { useToast } from './Toast';
import { useInvoiceReview } from '../hooks/useInvoiceReview';
import { useIsReadOnly } from '../context/FiscalYearContext';

interface InvoiceUploaderProps {
  onInvoiceAdded: (invoice: Invoice) => void;
  onBankTransactionsAdded: (transactions: BankTransaction[]) => void;
  settings: AppSettings;
  apartments: Apartment[];
}

export const InvoiceUploader: React.FC<InvoiceUploaderProps> = ({ onInvoiceAdded, onBankTransactionsAdded, settings: _settings, apartments }) => {
  const { queue, addToQueue, removeFromQueue } = useUploadQueue();
  const isReadOnly = useIsReadOnly();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadType, setUploadType] = useState<UploadType>('INVOICE');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // XLSX Mapping State
  const [mappingItem, setMappingItem] = useState<QueueItem | null>(null);
  const { showToast, showConfirm } = useToast();

  // DEBT-008: Invoice review logic extracted to useInvoiceReview hook
  const {
    reviewItem,
    preview,
    nifError,
    forceAcceptNif,
    setForceAcceptNif,
    selectedApartmentId,
    setSelectedApartmentId,
    startInvoiceReview,
    handleFieldChange,
    confirmInvoice,
    cancelReview,
  } = useInvoiceReview({ onInvoiceAdded, removeFromQueue, showToast });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setIsDragging(true);
    else if (e.type === "dragleave") setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isReadOnly) {
      showToast('Ejercicio cerrado: no se pueden adjuntar documentos.', 'warning');
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addToQueue(Array.from(e.dataTransfer.files), uploadType);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) {
      showToast('Ejercicio cerrado: no se pueden adjuntar documentos.', 'warning');
      e.target.value = '';
      return;
    }
    if (e.target.files && e.target.files.length > 0) {
      addToQueue(Array.from(e.target.files), uploadType);
      // Reset input to allow selecting the same file again
      e.target.value = '';
    }
  };

  const startReview = async (item: QueueItem) => {
    if (isReadOnly) {
      showToast('Ejercicio cerrado: no se pueden importar documentos.', 'warning');
      return;
    }
    if (item.uploadType === 'INVOICE' && item.result) {
      startInvoiceReview(item);
    } else if (item.uploadType === 'BANK_STATEMENT') {
      // Check if XLSX needs mapping
      if (item.needsMapping && item.storageFileId) {
        setMappingItem(item);
      } else if (item.bankResult) {
        // PDF was processed by AI
        if (await showConfirm(`Se han detectado ${item.bankResult.length} movimientos bancarios. ¿Importar a Conciliacion?`)) {
          onBankTransactionsAdded(item.bankResult);
          removeFromQueue(item.id);
        }
      }
    }
  };

  // Handle XLSX mapping confirmation
  const handleMappingConfirm = async (transactions: { date: string; concept: string; amount: number }[]) => {
    if (!mappingItem) return;

    // Add IDs and status to transactions
    const enrichedTransactions: BankTransaction[] = transactions.map(t => ({
      id: generateId(),
      ...t,
      status: 'PENDING' as const
    }));

    // Confirm import
    if (await showConfirm(`Se han mapeado ${enrichedTransactions.length} movimientos bancarios. ¿Importar a Conciliacion?`)) {
      onBankTransactionsAdded(enrichedTransactions);
      removeFromQueue(mappingItem.id);
    }

    setMappingItem(null);
  };

  const handleMappingCancel = () => {
    setMappingItem(null);
  };

  const inboxItems = queue.filter(i => i.id !== reviewItem?.id);

  // --- REVIEW UI (Invoice) ---
  if (preview && reviewItem) {
      return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-lg animate-fade-in-up mx-auto max-w-3xl">
          <div className="bg-slate-50 px-4 md:px-6 py-3 md:py-4 border-b border-slate-100 flex justify-between items-center sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <h4 className="font-semibold text-slate-900 text-sm md:text-base">Revisión de Factura</h4>
            </div>
            <button onClick={cancelReview} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-h-[60vh] overflow-y-auto">
            <div>
              <label htmlFor="invoice-issuer-name-input" className="block text-xs text-slate-500 mb-1">Emisor</label>
              <input id="invoice-issuer-name-input" name="issuerName" type="text" value={preview.issuerName} onChange={(e) => handleFieldChange('issuerName', e.target.value)} className="w-full border-slate-200 rounded text-sm font-medium bg-white text-slate-900" autoComplete="organization" />
            </div>
            <div>
              <label htmlFor="invoice-issuer-nif-input" className="block text-xs text-slate-500 mb-1 flex items-center gap-1">
                  NIF/CIF
                  {nifError && <span className="text-red-600 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3"/> (Formato Incorrecto)</span>}
              </label>
              <input
                  id="invoice-issuer-nif-input"
                  name="issuerNif"
                  type="text"
                  value={preview.issuerNif}
                  onChange={(e) => handleFieldChange('issuerNif', e.target.value.toUpperCase())}
                  className={`w-full rounded text-sm font-mono bg-white text-slate-900 ${nifError ? 'border-2 border-red-500 focus:ring-red-200' : 'border-slate-200'}`}
                  autoComplete="off"
              />
              {nifError && (
                  <div className="mt-2 flex items-start gap-2 bg-red-50 p-2 rounded border border-red-100">
                      <ShieldAlert className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-red-700 leading-tight">
                            El NIF no cumple con el algoritmo oficial (DNI/NIE/CIF). Revisa los dígitos.
                        </p>
                        <label htmlFor="invoice-force-accept-nif-checkbox" className="flex items-center gap-2 mt-2 cursor-pointer">
                            <input
                                id="invoice-force-accept-nif-checkbox"
                                name="forceAcceptNif"
                                type="checkbox"
                                checked={forceAcceptNif}
                                onChange={e => setForceAcceptNif(e.target.checked)}
                                className="rounded text-red-600 focus:ring-red-500 bg-white"
                            />
                            <span className="text-xs font-bold text-red-800 underline">Forzar aceptación (Sé lo que hago)</span>
                        </label>
                      </div>
                  </div>
              )}
            </div>
            <div>
              <label htmlFor="invoice-date-input" className="block text-xs text-slate-500 mb-1">Fecha</label>
              <input id="invoice-date-input" name="date" type="date" value={preview.date} onChange={(e) => handleFieldChange('date', e.target.value)} className="w-full border-slate-200 rounded text-sm bg-white text-slate-900" autoComplete="off" />
            </div>

            {/* Domicilio Fiscal del Emisor */}
            <div className="col-span-1 md:col-span-2 bg-blue-50/50 p-4 rounded-lg border border-blue-100">
              <p className="text-xs font-medium text-blue-700 mb-3">Domicilio Fiscal del Emisor (para facturas válidas)</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label htmlFor="invoice-issuer-address-input" className="block text-xs text-slate-500 mb-1">Dirección</label>
                  <input
                    id="invoice-issuer-address-input"
                    name="issuerAddress"
                    type="text"
                    value={preview.issuerAddress || ''}
                    onChange={(e) => handleFieldChange('issuerAddress', e.target.value)}
                    className="w-full border-slate-200 rounded text-sm bg-white text-slate-900"
                    placeholder="Calle, número, piso..."
                    autoComplete="street-address"
                  />
                </div>
                <div>
                  <label htmlFor="invoice-issuer-postalcode-input" className="block text-xs text-slate-500 mb-1">Código Postal</label>
                  <input
                    id="invoice-issuer-postalcode-input"
                    name="issuerPostalCode"
                    type="text"
                    value={preview.issuerPostalCode || ''}
                    onChange={(e) => handleFieldChange('issuerPostalCode', e.target.value)}
                    className="w-full border-slate-200 rounded text-sm bg-white text-slate-900"
                    placeholder="08001"
                    autoComplete="postal-code"
                  />
                </div>
                <div>
                  <label htmlFor="invoice-issuer-city-input" className="block text-xs text-slate-500 mb-1">Ciudad</label>
                  <input
                    id="invoice-issuer-city-input"
                    name="issuerCity"
                    type="text"
                    value={preview.issuerCity || ''}
                    onChange={(e) => handleFieldChange('issuerCity', e.target.value)}
                    className="w-full border-slate-200 rounded text-sm bg-white text-slate-900"
                    placeholder="Barcelona"
                    autoComplete="address-level2"
                  />
                </div>
                <div>
                  <label htmlFor="invoice-issuer-country-input" className="block text-xs text-slate-500 mb-1">País</label>
                  <input
                    id="invoice-issuer-country-input"
                    name="issuerCountry"
                    type="text"
                    value={preview.issuerCountry || 'España'}
                    onChange={(e) => handleFieldChange('issuerCountry', e.target.value)}
                    className="w-full border-slate-200 rounded text-sm bg-white text-slate-900"
                    placeholder="España"
                    autoComplete="country-name"
                  />
                </div>
              </div>
            </div>

            {/* Smart Account Selector */}
            <div>
              <label className="block text-xs text-slate-500 mb-1 flex justify-between">
                 <span>Cuenta Contable</span>
                 <span className="text-[10px] text-blue-600 cursor-help" title="Sugerido por IA basado en PGC">
                    {preview.category ? '✨ Detectada' : ''}
                 </span>
              </label>
              <AccountSelector
                value={preview.category || ''}
                onChange={(val) => handleFieldChange('category', val)}
              />
            </div>

            {/* Apartment Selector */}
            <div>
              <ApartmentSelector
                apartments={apartments}
                selectedApartmentId={selectedApartmentId}
                onSelect={setSelectedApartmentId}
                includeCommon={true}
                label="Asignar a Apartamento"
                size="md"
              />
            </div>

            <div className="col-span-1 md:col-span-2 grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div><label htmlFor="invoice-base-amount-input" className="block text-xs text-slate-500 mb-1">Base</label><input id="invoice-base-amount-input" name="baseAmount" type="number" value={preview.baseAmount} onChange={(e) => handleFieldChange('baseAmount', parseFloat(e.target.value))} className="w-full border-slate-200 rounded text-sm bg-white text-slate-900" autoComplete="off" /></div>
              <div><label htmlFor="invoice-vat-rate-select" className="block text-xs text-slate-500 mb-1">IVA %</label><select id="invoice-vat-rate-select" name="vatRate" value={preview.vatRate} onChange={(e) => handleFieldChange('vatRate', parseFloat(e.target.value))} className="w-full border-slate-200 rounded text-sm bg-white text-slate-900"><option value={21}>21%</option><option value={10}>10%</option><option value={4}>4%</option><option value={0}>0%</option></select></div>
              <div><label htmlFor="invoice-total-amount-input" className="block text-xs text-slate-500 mb-1">Total</label><input id="invoice-total-amount-input" name="totalAmount" type="number" value={preview.totalAmount} onChange={(e) => handleFieldChange('totalAmount', parseFloat(e.target.value))} className="w-full border-slate-200 rounded text-sm font-bold bg-white text-slate-900" autoComplete="off" /></div>
            </div>
          </div>

          <div className="px-4 md:px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 sticky bottom-0">
             <button
                onClick={cancelReview}
                className="order-3 sm:order-1 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
             >
                Cancelar
             </button>
             <button
                onClick={() => confirmInvoice(false)}
               disabled={isReadOnly}
               className="order-2 bg-white border border-amber-500 text-amber-600 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-amber-50 flex items-center justify-center gap-2 transition-colors"
               title="Guardar como borrador sin crear asiento contable (requiere revisión posterior)"
             >
                <CheckCircle className="w-4 h-4" /> <span className="hidden xs:inline">Guardar</span> Borrador
             </button>
             <button
                onClick={() => confirmInvoice(true)}
                disabled={isReadOnly || (nifError && !forceAcceptNif)}
                className={`order-1 sm:order-3 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 shadow-md transition-all ${
                   isReadOnly || (nifError && !forceAcceptNif)
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'
                }`}
                title="Validar factura y crear asiento contable automáticamente"
             >
                <BookPlus className="w-4 h-4" /> Contabilizar
             </button>
          </div>
        </div>
      );
  }

  // --- UPLOAD UI ---
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Upload Type Switcher */}
      <div className="flex justify-center">
          <div className="bg-white border border-slate-200 rounded-lg p-1 flex gap-1 shadow-sm">
              <button 
                onClick={() => setUploadType('INVOICE')}
                disabled={isReadOnly}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${uploadType === 'INVOICE' ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                  <FileText className="w-4 h-4 inline mr-2" /> Facturas / Tickets
              </button>
              <button
                onClick={() => setUploadType('BANK_STATEMENT')}
                disabled={isReadOnly}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${uploadType === 'BANK_STATEMENT' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                  <Landmark className="w-4 h-4 inline mr-2" /> Extracto Bancario
              </button>
          </div>
      </div>

      <div 
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 bg-white'}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center gap-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${uploadType === 'INVOICE' ? 'bg-blue-100 text-blue-600' : 'bg-indigo-100 text-indigo-600'}`}>
            {uploadType === 'INVOICE' ? <Upload className="w-8 h-8" /> : <Landmark className="w-8 h-8" />}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
                {uploadType === 'INVOICE' ? 'Sube tus facturas' : 'Sube Extracto Bancario'}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
                {uploadType === 'INVOICE'
                  ? 'La IA extraerá los datos y asignará la cuenta contable (PGC).'
                  : 'Soporta PDF (análisis con IA) y Excel (.xlsx, .xls) para BBVA y similares.'}
            </p>
          </div>
          <input
            id="invoice-uploader-file-input"
            name="files"
            type="file"
            ref={fileInputRef}
            className="sr-only"
            multiple
            disabled={isReadOnly}
            accept={uploadType === 'INVOICE'
              ? "image/jpeg,image/png,image/gif,image/webp,application/pdf"
              : "application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"}
            onChange={handleFileInput}
            capture={undefined}
          />
          <label
            htmlFor="invoice-uploader-file-input"
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2 touch-manipulation select-none ${
              isReadOnly
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed pointer-events-none'
                : 'bg-slate-900 text-white hover:bg-slate-800 cursor-pointer active:scale-95'
            }`}
          >
            <Upload className="w-5 h-5" />
            Seleccionar Archivos
          </label>
        </div>
      </div>

      {inboxItems.length > 0 && (
        <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Bandeja de Entrada</h3>
            {inboxItems.map(item => (
                <div key={item.id} className="bg-white border border-slate-200 rounded-lg p-4 flex items-center gap-4 shadow-sm animate-fade-in">
                    <div className="shrink-0">
                         {item.status === 'QUEUED' && <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><Upload className="w-5 h-5" /></div>}
                         {item.status === 'ANALYZING' && (
                             <div className="relative w-10 h-10 flex items-center justify-center">
                                 <svg className="animate-spin w-10 h-10 text-blue-200" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                 <span className="absolute text-[10px] font-bold text-blue-600">{Math.round(item.progress)}%</span>
                             </div>
                         )}
                         {item.status === 'COMPLETED' && <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><CheckCircle className="w-6 h-6" /></div>}
                         {item.status === 'ERROR' && <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600"><AlertTriangle className="w-6 h-6" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 rounded border ${item.uploadType === 'INVOICE' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-indigo-200 bg-indigo-50 text-indigo-700'}`}>
                                {item.uploadType === 'INVOICE' ? 'FRA' : 'BNC'}
                            </span>
                            <p className="font-medium text-slate-900 truncate">{item.fileName}</p>
                        </div>
                        <p className="text-xs text-slate-500">
                            {item.status === 'ANALYZING' && (item.uploadType === 'INVOICE'
                              ? 'Analizando y asignando cuenta contable...'
                              : item.fileName.toLowerCase().match(/\.xlsx?$/)
                                ? 'Cargando Excel...'
                                : 'Analizando con IA...'
                            )}
                            {item.status === 'COMPLETED' && (
                              item.uploadType === 'INVOICE'
                                ? 'Listo para revision.'
                                : item.needsMapping
                                  ? 'Excel cargado. Mapea las columnas.'
                                  : 'Movimientos detectados.'
                            )}
                            {item.status === 'ERROR' && <span className="text-red-500">{item.error}</span>}
                        </p>
                        {item.status === 'ANALYZING' && <div className="w-full h-1 bg-slate-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${item.progress}%` }}></div></div>}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                        {item.status === 'COMPLETED' && (
                            <button
                              onClick={() => startReview(item)}
                              disabled={isReadOnly}
                              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                                item.needsMapping
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  : 'bg-blue-600 text-white hover:bg-blue-700'
                              }`}
                            >
                              {item.uploadType === 'INVOICE' ? (
                                <><Play className="w-4 h-4" /> Revisar</>
                              ) : item.needsMapping ? (
                                <><FileSpreadsheet className="w-4 h-4" /> Mapear Columnas</>
                              ) : (
                                <><Play className="w-4 h-4" /> Importar</>
                              )}
                            </button>
                        )}
                        <button onClick={() => removeFromQueue(item.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full"><Trash2 className="w-4 h-4" /></button>
                    </div>
                </div>
            ))}
        </div>
      )}

      {/* XLSX Column Mapper Modal */}
      {mappingItem && mappingItem.storageFileId && (
        <XlsxColumnMapper
          storageFileId={mappingItem.storageFileId}
          fileName={mappingItem.fileName}
          onConfirm={handleMappingConfirm}
          onCancel={handleMappingCancel}
        />
      )}
    </div>
  );
};
