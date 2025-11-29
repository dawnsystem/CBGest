import React, { useState } from 'react';
import { useUploadQueue } from '../context/UploadQueueContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, AlertCircle, X, ChevronDown, ChevronUp, Upload } from 'lucide-react';

export const GlobalUploadWidget: React.FC = () => {
  const { queue, dismissNotifications } = useUploadQueue();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMinimized, setIsMinimized] = useState(false);

  // Logic update: Only show items that haven't been explicitly dismissed by the user
  // The 'notificationDismissed' flag separates visual visibility from data persistence.
  const visibleItems = queue.filter(i => !i.notificationDismissed);

  const activeItems = visibleItems.filter(i => i.status === 'ANALYZING' || i.status === 'QUEUED');
  const completedCount = visibleItems.filter(i => i.status === 'COMPLETED').length;
  const errorCount = visibleItems.filter(i => i.status === 'ERROR').length;

  // Hide widget on /invoices route
  const isOnInvoicesPage = location.pathname === '/invoices';

  // If no relevant items to show, hide widget
  if (visibleItems.length === 0 || isOnInvoicesPage) return null;

  const isProcessing = activeItems.length > 0;

  const handleViewInvoices = () => {
    navigate('/invoices');
  };

  // Minimized state
  if (isMinimized) {
    return (
      <div className="fixed bottom-24 md:bottom-8 right-4 z-40 bg-slate-900 rounded-lg shadow-xl border border-slate-700 overflow-hidden animate-fade-in-up cursor-pointer hover:bg-slate-800 transition-colors"
           onClick={() => setIsMinimized(false)}>
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Upload className="w-4 h-4 text-emerald-400" />
            )}
            <span className="text-sm font-medium text-white">
              {completedCount > 0 ? `${completedCount} lista${completedCount > 1 ? 's' : ''}` : 'Subiendo...'}
            </span>
          </div>
          <ChevronUp className="w-4 h-4 text-slate-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-24 md:bottom-8 right-4 z-40 bg-white rounded-lg shadow-xl border border-slate-200 w-80 max-w-[calc(100vw-2rem)] overflow-hidden animate-fade-in-up">
      {/* Header */}
      <div className="bg-slate-900 text-white px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          )}
          <span className="text-sm font-medium">
            {isProcessing ? 'Procesando archivos...' : 'Procesamiento finalizado'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(true)}
            className="text-slate-300 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
            title="Minimizar"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          {/* This X button now only HIDES the notification, doesn't delete the file */}
          {!isProcessing && (
            <button onClick={dismissNotifications} className="text-slate-300 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors" title="Cerrar notificación (los archivos permanecerán en la bandeja)">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* List Preview (Max 3 items) */}
      <div className="max-h-48 overflow-y-auto p-2 space-y-2 bg-slate-50">
        {visibleItems.slice(0, 5).map(item => (
          <div key={item.id} className="bg-white p-2 rounded border border-slate-100 flex items-center gap-3">
            <div className="shrink-0">
              {item.status === 'ANALYZING' || item.status === 'QUEUED' ? (
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                  <span className="text-xs font-bold text-blue-600">{Math.round(item.progress)}%</span>
                </div>
              ) : item.status === 'COMPLETED' ? (
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              ) : (
                <AlertCircle className="w-8 h-8 text-red-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-900 truncate">{item.file.name}</p>
              <p className="text-[10px] text-slate-500 uppercase">{item.status}</p>
            </div>
            {item.status === 'ANALYZING' && (
              <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${item.progress}%` }}></div>
              </div>
            )}
          </div>
        ))}
        {visibleItems.length > 5 && (
          <p className="text-xs text-slate-500 text-center py-1">
            +{visibleItems.length - 5} más...
          </p>
        )}
      </div>

      {completedCount > 0 && (
        <button
          onClick={handleViewInvoices}
          className="w-full bg-emerald-50 px-4 py-2 text-xs text-emerald-700 text-center border-t border-emerald-100 hover:bg-emerald-100 transition-colors font-medium"
        >
          Ver {completedCount} factura{completedCount > 1 ? 's' : ''} lista{completedCount > 1 ? 's' : ''} para revisar →
        </button>
      )}
    </div>
  );
};