/**
 * @fileoverview Componente que muestra el estado de conexión
 * La app ahora es completamente online - sin modo offline
 */

import React, { useState, useEffect } from 'react';
import { Wifi, AlertCircle } from 'lucide-react';
import { protectedDatabase } from '../lib/appwrite/protectedDatabase';

interface ConnectionStatusProps {
  /** Mostrar versión compacta */
  compact?: boolean;
  /** Posición del indicador */
  position?: 'top-right' | 'bottom-right' | 'inline';
  /** Mostrar siempre, no solo cuando hay problemas */
  alwaysShow?: boolean;
}

interface SystemStats {
  rateLimiter: {
    queueLength: number;
    requestsInWindow: number;
    maxRequestsPerWindow: number;
    isProcessing: boolean;
  };
  cache: {
    totalEntries: number;
    validEntries: number;
    expiredEntries: number;
    maxEntries: number;
  };
  offlineQueue: {
    pendingOperations: number;
    isOnline: boolean;
    isSyncing: boolean;
    oldestOperation: string | null;
  };
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  compact = false,
  position = 'inline',
  alwaysShow = false,
}) => {
  const [stats, setStats] = useState<SystemStats>(protectedDatabase.getSystemStats());
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Actualizar estadísticas periódicamente
    const interval = setInterval(() => {
      const newStats = protectedDatabase.getSystemStats();
      setStats(newStats);

      // Mostrar solo si hay cola de rate limiter activa
      const shouldShow = alwaysShow || newStats.rateLimiter.queueLength > 3;
      setIsVisible(shouldShow);
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [alwaysShow]);

  if (!isVisible) return null;

  const { rateLimiter: rl, cache: c } = stats;

  const positionClasses = {
    'top-right': 'fixed top-4 right-4 z-50',
    'bottom-right': 'fixed bottom-4 right-4 z-50',
    'inline': '',
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${positionClasses[position]}`}>
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <Wifi className="w-4 h-4 text-green-500" />
      </div>
    );
  }

  return (
    <div className={`${positionClasses[position]} bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 max-w-sm`}>
      {/* Estado de conexión */}
      <div className="flex items-center gap-2 mb-2">
        <Wifi className="w-4 h-4 text-green-500" />
        <span className="text-sm font-medium text-green-600">
          Conectado
        </span>
        <div className="w-2 h-2 rounded-full bg-green-500 ml-auto" />
      </div>

      {/* Cola del rate limiter */}
      {rl.queueLength > 0 && (
        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 mb-2">
          <AlertCircle className="w-4 h-4" />
          <span>
            {rl.queueLength} peticiones en cola ({rl.requestsInWindow}/{rl.maxRequestsPerWindow})
          </span>
        </div>
      )}

      {/* Info del caché (solo en modo no-compacto) */}
      {alwaysShow && (
        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500">
          Caché: {c.validEntries}/{c.maxEntries} entradas
        </div>
      )}
    </div>
  );
};

/**
 * Banner simple - ahora solo muestra si hay problemas de rate limiting
 */
export const ConnectionBanner: React.FC = () => {
  const [queueLength, setQueueLength] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const stats = protectedDatabase.getSystemStats();
      setQueueLength(stats.rateLimiter.queueLength);
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Solo mostrar si hay muchas peticiones en cola
  if (queueLength < 5) return null;

  return (
    <div className="px-4 py-2 text-sm text-center bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
      <span className="flex items-center justify-center gap-2">
        <AlertCircle className="w-4 h-4" />
        Procesando {queueLength} peticiones - por favor espera
      </span>
    </div>
  );
};

export default ConnectionStatus;
