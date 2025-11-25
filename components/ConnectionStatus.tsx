/**
 * @fileoverview Componente que muestra el estado de conexión y operaciones pendientes
 */

import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle, Clock } from 'lucide-react';
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
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Actualizar estadísticas periódicamente
    const interval = setInterval(() => {
      const newStats = protectedDatabase.getSystemStats();
      setStats(newStats);

      // Mostrar si hay problemas o operaciones pendientes
      const shouldShow = alwaysShow ||
        !newStats.offlineQueue.isOnline ||
        newStats.offlineQueue.pendingOperations > 0 ||
        newStats.rateLimiter.queueLength > 3;

      setIsVisible(shouldShow);
    }, 2000);

    // Suscribirse a cambios de conexión
    const unsubscribe = protectedDatabase.onOnlineStatusChange((isOnline) => {
      setIsVisible(!isOnline || alwaysShow);
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [alwaysShow]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await protectedDatabase.forceSync();
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isVisible) return null;

  const { offlineQueue: oq, rateLimiter: rl, cache: c } = stats;

  // Determinar color del indicador
  const statusColor = !oq.isOnline
    ? 'bg-red-500'
    : oq.pendingOperations > 0
    ? 'bg-yellow-500'
    : 'bg-green-500';

  const positionClasses = {
    'top-right': 'fixed top-4 right-4 z-50',
    'bottom-right': 'fixed bottom-4 right-4 z-50',
    'inline': '',
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${positionClasses[position]}`}>
        <div className={`w-2 h-2 rounded-full ${statusColor}`} />
        {!oq.isOnline && <WifiOff className="w-4 h-4 text-red-500" />}
        {oq.pendingOperations > 0 && (
          <span className="text-xs text-gray-500">
            {oq.pendingOperations} pendientes
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`${positionClasses[position]} bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 max-w-sm`}>
      {/* Estado de conexión */}
      <div className="flex items-center gap-2 mb-2">
        {oq.isOnline ? (
          <Wifi className="w-4 h-4 text-green-500" />
        ) : (
          <WifiOff className="w-4 h-4 text-red-500" />
        )}
        <span className={`text-sm font-medium ${oq.isOnline ? 'text-green-600' : 'text-red-600'}`}>
          {oq.isOnline ? 'Conectado' : 'Sin conexión'}
        </span>
        <div className={`w-2 h-2 rounded-full ${statusColor} ml-auto`} />
      </div>

      {/* Operaciones pendientes */}
      {oq.pendingOperations > 0 && (
        <div className="flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-400 mb-2">
          <Clock className="w-4 h-4" />
          <span>
            {oq.pendingOperations} {oq.pendingOperations === 1 ? 'operación pendiente' : 'operaciones pendientes'}
          </span>
          {oq.isSyncing && <RefreshCw className="w-3 h-3 animate-spin" />}
        </div>
      )}

      {/* Cola del rate limiter */}
      {rl.queueLength > 0 && (
        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 mb-2">
          <AlertCircle className="w-4 h-4" />
          <span>
            {rl.queueLength} peticiones en cola ({rl.requestsInWindow}/{rl.maxRequestsPerWindow})
          </span>
        </div>
      )}

      {/* Botón de sincronización */}
      {oq.isOnline && oq.pendingOperations > 0 && !oq.isSyncing && (
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="w-full mt-2 px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSyncing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Sincronizar ahora
            </>
          )}
        </button>
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
 * Banner simple para mostrar en la parte superior de la app
 */
export const ConnectionBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!protectedDatabase.isOnline);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const stats = protectedDatabase.getSystemStats();
      setIsOffline(!stats.offlineQueue.isOnline);
      setPendingCount(stats.offlineQueue.pendingOperations);
    }, 2000);

    const unsubscribe = protectedDatabase.onOnlineStatusChange((online) => {
      setIsOffline(!online);
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  if (!isOffline && pendingCount === 0) return null;

  return (
    <div className={`px-4 py-2 text-sm text-center ${
      isOffline
        ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    }`}>
      {isOffline ? (
        <span className="flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          Sin conexión - Los cambios se guardarán localmente
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <Clock className="w-4 h-4" />
          {pendingCount} {pendingCount === 1 ? 'cambio pendiente' : 'cambios pendientes'} de sincronizar
        </span>
      )}
    </div>
  );
};

export default ConnectionStatus;
