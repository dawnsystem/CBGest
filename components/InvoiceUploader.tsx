import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, X, Play, Trash2, BookPlus } from 'lucide-react';
import { useUploadQueue } from '../context/UploadQueueContext';
import { Invoice, AppSettings, QueueItem } from '../types';
import { isValidNIF } from '../utils/validators';

interface InvoiceUploaderProps {
  onInvoiceAdded: (invoice: Invoice) => void;
  settings: AppSettings;
}

export const InvoiceUploader: React.FC<InvoiceUploaderProps> = ({ onInvoiceAdded, settings }) => {
  const { queue, addToQueue, removeFromQueue, retryItem } = useUploadQueue();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Local state for reviewing an item
  const [reviewItem, setReviewItem] = useState<QueueItem | null>(null);
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [nifError, setNifError] = useState<boolean>(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addToQueue(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addToQueue(Array.from(e.target.files));
    }
  };

  const startReview = (item: QueueItem) => {
    if (item.result) {
        setReviewItem(item);
        setPreview(item.result);
        setNifError(item.result.issuerNif ? !isValidNIF(item.result.issuerNif) : false);
    }
  };

  const handleFieldChange = (field: keyof Invoice, value: string | number) => {
    if (preview) {
      const updated = { ...preview, [field]: value };
      // Recalculate totals
      if (field === 'baseAmount' || field === 'vatRate') {
         const base = field === 'baseAmount' ? Number(value) : updated.baseAmount;
         const rate = field === 'vatRate' ? Number(value) : updated.vatRate;
         updated.vatAmount = base * (rate / 100);
         updated.totalAmount = base + updated.vatAmount;
      }
      setPreview(updated);
      
      if (field === 'issuerNif') {
        setNifError(!isValidNIF(value as string));
      }
    }
  };

  const confirmInvoice = (generateEntry: boolean) => {
    if (preview && reviewItem) {
      if (nifError) {
        alert("El NIF detectado no es válido. Por favor corrígelo antes de guardar.");
        return;
      }

      const finalInvoice: Invoice = {
        ...preview,
        status: generateEntry ? 'PROCESSED' : 'PENDING',
        // CRITICAL: Attach the original file from the queue item
        file: reviewItem.file, 
        history: [
          ...preview.history,
          {
            date: new Date().toISOString(),
            action: generateEntry ? 'Confirmed and Accounting Entry Generated' : 'Invoice Confirmed',
            user: 'Admin Gestor'
          }
        ]
      };

      onInvoiceAdded(finalInvoice);
      removeFromQueue(reviewItem.id); // Remove from queue after processing
      setReviewItem(null);
      setPreview(null);
    }
  };

  // Filter items to show in the "Inbox" list (exclude those being reviewed right now)
  const inboxItems = queue.filter(i => i.id !== reviewItem?.id);

  if (preview && reviewItem) {
      // --- REVIEW MODE ---
      return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-lg animate-fade-in-up">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <h4 className="font-semibold text-slate-900">Revisión de Factura: {reviewItem.file.name}</h4>
            </div>
            <button onClick={() => { setReviewItem(null); setPreview(null); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Fields (Same as previous implementation) */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Emisor</label>
              <input type="text" value={preview.issuerName} onChange={(e) => handleFieldChange('issuerName', e.target.value)} className="w-full border-slate-200 rounded text-sm font-medium" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">NIF/CIF {nifError && <span className="text-red-500 font-bold">(Inválido)</span>}</label>
              <input type="text" value={preview.issuerNif} onChange={(e) => handleFieldChange('issuerNif', e.target.value)} className={`w-full rounded text-sm font-mono ${nifError ? 'border-red-300 bg-red-50' : 'border-slate-200'}`} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Fecha</label>
              <input type="date" value={preview.date} onChange={(e) => handleFieldChange('date', e.target.value)} className="w-full border-slate-200 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Categoría</label>
              <select 
                value={preview.category || ''} 
                onChange={(e) => handleFieldChange('category', e.target.value)}
                className="w-full border-slate-200 rounded text-sm"
              >
                <option value="">Sin categorizar</option>
                <option value="628. Suministros">628. Suministros (Luz/Agua)</option>
                <option value="622. Reparaciones">622. Reparaciones</option>
                <option value="623. Profesionales">623. Servicios Profesionales</option>
              </select>
            </div>
            
            <div className="col-span-1 md:col-span-2 grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Base</label>
                <input type="number" value={preview.baseAmount} onChange={(e) => handleFieldChange('baseAmount', parseFloat(e.target.value))} className="w-full border-slate-200 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">IVA %</label>
                <select value={preview.vatRate} onChange={(e) => handleFieldChange('vatRate', parseFloat(e.target.value))} className="w-full border-slate-200 rounded text-sm">
                  <option value={21}>21%</option>
                  <option value={10}>10%</option>
                  <option value={4}>4%</option>
                  <option value={0}>0%</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Total</label>
                <input type="number" value={preview.totalAmount} onChange={(e) => handleFieldChange('totalAmount', parseFloat(e.target.value))} className="w-full border-slate-200 rounded text-sm font-bold" />
              </div>
            </div>
          </div>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
             <button onClick={() => { setReviewItem(null); setPreview(null); }} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">Cancelar</button>
             <button onClick={() => confirmInvoice(false)} className="bg-white border border-blue-600 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> Guardar Borrador
             </button>
             <button onClick={() => confirmInvoice(true)} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2 shadow-md shadow-emerald-200">
                <BookPlus className="w-4 h-4" /> Contabilizar
             </button>
          </div>
        </div>
      );
  }

  // --- UPLOAD / QUEUE MODE ---
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Drop Zone */}
      <div 
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 bg-white'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
            <Upload className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Sube tus facturas</h3>
            <p className="text-sm text-slate-500 mt-1">Arrastra archivos aquí o haz clic para buscar. La IA los procesará en segundo plano.</p>
          </div>
          <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,.pdf" onChange={handleFileInput} />
          <button onClick={() => fileInputRef.current?.click()} className="bg-slate-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
            Seleccionar Archivos
          </button>
        </div>
      </div>

      {/* Inbox List */}
      {inboxItems.length > 0 && (
        <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Bandeja de Procesamiento</h3>
            {inboxItems.map(item => (
                <div key={item.id} className="bg-white border border-slate-200 rounded-lg p-4 flex items-center gap-4 shadow-sm animate-fade-in">
                    {/* Icon Status */}
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

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 truncate">{item.file.name}</p>
                        <p className="text-xs text-slate-500">
                            {item.status === 'QUEUED' && 'Esperando turno...'}
                            {item.status === 'ANALYZING' && 'Analizando con Gemini AI...'}
                            {item.status === 'COMPLETED' && 'Análisis completado. Listo para revisión.'}
                            {item.status === 'ERROR' && <span className="text-red-500">{item.error}</span>}
                        </p>
                        {item.status === 'ANALYZING' && (
                            <div className="w-full h-1 bg-slate-100 rounded-full mt-2 overflow-hidden">
                                <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${item.progress}%` }}></div>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="shrink-0 flex items-center gap-2">
                        {item.status === 'COMPLETED' && (
                            <button onClick={() => startReview(item)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
                                <Play className="w-4 h-4" /> Revisar
                            </button>
                        )}
                        {item.status === 'ERROR' && (
                            <button onClick={() => retryItem(item.id)} className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 rounded-full">
                                <Upload className="w-4 h-4" />
                            </button>
                        )}
                        <button onClick={() => removeFromQueue(item.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            ))}
        </div>
      )}
    </div>
  );
};