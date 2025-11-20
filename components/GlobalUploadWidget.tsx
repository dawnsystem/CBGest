import React from 'react';
import { useUploadQueue } from '../context/UploadQueueContext';
import { Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';

export const GlobalUploadWidget: React.FC = () => {
  const { queue, dismissNotifications } = useUploadQueue();

  // Logic update: Only show items that haven't been explicitly dismissed by the user
  // The 'notificationDismissed' flag separates visual visibility from data persistence.
  const visibleItems = queue.filter(i => !i.notificationDismissed);

  const activeItems = visibleItems.filter(i => i.status === 'ANALYZING' || i.status === 'QUEUED');
  const completedCount = visibleItems.filter(i => i.status === 'COMPLETED').length;
  const errorCount = visibleItems.filter(i => i.status === 'ERROR').length;

  // If no relevant items to show, hide widget
  if (visibleItems.length === 0) return null;

  const isProcessing = activeItems.length > 0;

  return (
    <div className="fixed bottom-20 md:bottom-8 right-4 z-50 bg-white rounded-lg shadow-xl border border-slate-200 w-80 overflow-hidden animate-fade-in-up">
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
        {/* This X button now only HIDES the notification, doesn't delete the file */}
        {!isProcessing && (
          <button onClick={dismissNotifications} className="text-slate-300 hover:text-white" title="Cerrar notificación (los archivos permanecerán en la bandeja)">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* List Preview (Max 3 items) */}
      <div className="max-h-48 overflow-y-auto p-2 space-y-2 bg-slate-50">
        {visibleItems.map(item => (
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
      </div>
      
      {completedCount > 0 && (
        <div className="bg-emerald-50 px-4 py-2 text-xs text-emerald-700 text-center border-t border-emerald-100 cursor-pointer hover:bg-emerald-100 transition-colors">
            Ver {completedCount} facturas listas para revisar en "Facturas"
        </div>
      )}
    </div>
  );
};