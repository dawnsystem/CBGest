/**
 * @fileoverview Sistema de notificaciones toast inline
 * @description Reemplaza alert() y window.confirm() con un sistema no-bloqueante.
 *              Provee un contexto global + hook para usar en cualquier componente.
 *
 * @example
 * const { showToast, showConfirm } = useToast();
 * showToast('Guardado correctamente', 'success');
 * const ok = await showConfirm('¿Eliminar este registro?');
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

// ============================================================================
// TIPOS
// ============================================================================

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ConfirmState {
  message: string;
  resolve: (value: boolean) => void;
}

interface ToastContextType {
  /** Muestra un mensaje toast temporal */
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  /** Muestra un diálogo de confirmación no-bloqueante. Devuelve Promise<boolean> */
  showConfirm: (message: string) => Promise<boolean>;
}

// ============================================================================
// CONTEXTO
// ============================================================================

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/**
 * Hook para acceder al sistema de notificaciones toast.
 * Debe usarse dentro de un ToastProvider.
 */
export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

// ============================================================================
// CONSTANTES
// ============================================================================

const DEFAULT_DURATION = 4000;

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />,
  error: <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />,
  info: <Info className="w-5 h-5 text-blue-400 flex-shrink-0" />,
};

const BG_COLORS: Record<ToastType, string> = {
  success: 'bg-green-900/90 border-green-700',
  error: 'bg-red-900/90 border-red-700',
  warning: 'bg-yellow-900/90 border-yellow-700',
  info: 'bg-blue-900/90 border-blue-700',
};

// ============================================================================
// COMPONENTE TOAST INDIVIDUAL
// ============================================================================

const ToastMessage: React.FC<{
  toast: ToastItem;
  onDismiss: (id: string) => void;
}> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-white text-sm animate-slide-in ${BG_COLORS[toast.type]}`}
      role="alert"
    >
      {ICONS[toast.type]}
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-white/60 hover:text-white transition-colors"
        aria-label="Cerrar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

// ============================================================================
// COMPONENTE DIÁLOGO DE CONFIRMACIÓN
// ============================================================================

const ConfirmDialog: React.FC<{
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ message, onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6">
        <div className="flex items-start gap-3 mb-6">
          <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-white text-sm leading-relaxed">{message}</p>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-500 transition-colors"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// PROVIDER
// ============================================================================

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const idCounter = useRef(0);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration: number = DEFAULT_DURATION) => {
      const id = `toast-${++idCounter.current}`;
      setToasts(prev => [...prev.slice(-4), { id, message, type, duration }]);
    },
    []
  );

  const showConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirm({ message, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    confirm?.resolve(true);
    setConfirm(null);
  }, [confirm]);

  const handleCancel = useCallback(() => {
    confirm?.resolve(false);
    setConfirm(null);
  }, [confirm]);

  return (
    <ToastContext.Provider value={{ showToast, showConfirm }}>
      {children}

      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastMessage toast={toast} onDismiss={dismissToast} />
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ToastContext.Provider>
  );
};

export default ToastProvider;
