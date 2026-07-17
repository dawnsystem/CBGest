import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { QueueItem, UploadQueueContextType, Invoice, UploadType, BankTransaction, Supplier } from '../types';
import { analyzeInvoiceImage, analyzeBankStatement } from '../services/geminiService';
import { protectedDatabase } from '../lib/appwrite/protectedDatabase';
import { storageService, findImportByFileSha256 } from '../services/appwriteService';
import { useAuth } from './AuthContext';
import { useFiscalYear } from './FiscalYearContext';
import { generateId } from '../utils/defaults';
import { uploadLogger } from '../services/logger';
import { isAllowedGeminiMimeType, normalizeMimeType } from '../utils/mimeAllowlist';
import {
  buildContentFingerprint,
  computeFileSha256,
  findDuplicateByContentFingerprint,
  findDuplicateByFileHash,
  toDuplicateMatch,
} from '../utils/invoiceDedup';

const UploadQueueContext = createContext<UploadQueueContextType | undefined>(undefined);

export const useUploadQueue = () => {
  const context = useContext(UploadQueueContext);
  if (!context) {
    throw new Error('useUploadQueue must be used within an UploadQueueProvider');
  }
  return context;
};

// ============================================================================
// CONSTANTS
// ============================================================================

/** Número máximo de subidas paralelas a Storage */
const MAX_CONCURRENT_UPLOADS = 5;

/** Intervalo para actualizar progreso visual (ms) — PERF-006: increased to 1 s to reduce re-renders with concurrent uploads */
const PROGRESS_UPDATE_INTERVAL = 1000;

// ============================================================================
// PROVIDER
// ============================================================================

interface UploadQueueProviderProps {
  children: ReactNode;
  suppliers?: Supplier[];
  invoices?: Invoice[];
}

export const UploadQueueProvider: React.FC<UploadQueueProviderProps> = ({
  children,
  suppliers = [],
  invoices = [],
}) => {
  const { user } = useAuth();
  const { activeFiscalYear } = useFiscalYear();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  
  // Ref para tracking de uploads en progreso (para el pool de workers)
  const uploadingCountRef = useRef(0);
  const uploadQueueRef = useRef<QueueItem[]>([]);
  const invoicesRef = useRef(invoices);
  const activeFiscalYearRef = useRef(activeFiscalYear);

  useEffect(() => {
    invoicesRef.current = invoices;
  }, [invoices]);

  useEffect(() => {
    activeFiscalYearRef.current = activeFiscalYear;
  }, [activeFiscalYear]);

  // ============================================================================
  // LOAD QUEUE FROM APPWRITE
  // ============================================================================

  useEffect(() => {
    const loadQueue = async () => {
      if (!user) {
        setQueue([]);
        setIsHydrated(true);
        return;
      }

      try {
        uploadLogger.info('[UploadQueue] Cargando cola desde Appwrite...');
        const loadedItems = await protectedDatabase.getUploadQueue();
        
        // Items de Appwrite no tienen localFile - son solo metadata
        setQueue(loadedItems);
        uploadLogger.info(`[UploadQueue] ${loadedItems.length} items cargados`);
        
        // Reanudar items que quedaron en UPLOADING (probablemente por cierre inesperado)
        const stuckUploading = loadedItems.filter(item => item.status === 'UPLOADING');
        if (stuckUploading.length > 0) {
          uploadLogger.info(`[UploadQueue] ${stuckUploading.length} items en UPLOADING - marcando como ERROR`);
          for (const item of stuckUploading) {
            await protectedDatabase.updateUploadItem({
              ...item,
              status: 'ERROR',
              error: 'Subida interrumpida. Por favor, vuelve a añadir el archivo.'
            });
          }
          // Recargar para obtener el estado actualizado
          const updatedItems = await protectedDatabase.getUploadQueue();
          setQueue(updatedItems);
        }
      } catch (error) {
        uploadLogger.error('[UploadQueue] Error cargando cola:', error);
        setQueue([]);
      }
      setIsHydrated(true);
    };

    loadQueue();
  }, [user]);

  // ============================================================================
  // ADD TO QUEUE - Fase 1: Captura instantánea
  // ============================================================================

  const addToQueue = useCallback(async (files: File[], type: UploadType) => {
    uploadLogger.info(`[UploadQueue] Añadiendo ${files.length} archivos a la cola`);
    const fiscalYearId = resolveFiscalYearId(activeFiscalYearRef.current);

    // Crear items locales inmediatamente (UI instantánea)
    const newItems: QueueItem[] = await Promise.all(
      files.map(async (file) => {
        let fileSha256: string | undefined;
        if (type === 'BANK_STATEMENT') {
          try {
            fileSha256 = await computeFileSha256(file);
          } catch (error) {
            uploadLogger.warn(`[UploadQueue] No se pudo calcular SHA-256 de ${file.name}:`, error);
          }
        }

        return {
          id: generateId(),
          localFile: file,
          uploadType: type,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
          fileSha256,
          fiscalYearId,
          status: 'PENDING_UPLOAD' as const,
          progress: 0,
          timestamp: Date.now(),
          notificationDismissed: false,
        };
      })
    );

    // Añadir a la cola local inmediatamente
    setQueue(prev => [...prev, ...newItems]);
    
    // Añadir a la cola de upload para el pool de workers
    uploadQueueRef.current = [...uploadQueueRef.current, ...newItems];
    
    // Iniciar el pool de workers si no está activo
    processUploadQueue();
  // processUploadQueue is intentionally omitted: this callback must run only
  // on mount so it starts the upload pool once. Including it would risk
  // re-triggering the pool on every re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================================
  // UPLOAD POOL - Fase 2: Subida paralela a Storage
  // ============================================================================

  const processUploadQueue = useCallback(async () => {
    // Procesar items pendientes respetando el límite de concurrencia
    while (uploadQueueRef.current.length > 0 && uploadingCountRef.current < MAX_CONCURRENT_UPLOADS) {
      const item = uploadQueueRef.current.shift();
      if (!item || !item.localFile) continue;
      
      uploadingCountRef.current++;
      
      // Procesar en background (no await)
      uploadSingleFile(item).finally(() => {
        uploadingCountRef.current--;
        // Continuar procesando si hay más en cola
        processUploadQueue();
      });
    }
  }, []);

  const uploadSingleFile = async (item: QueueItem): Promise<void> => {
    const file = item.localFile;
    if (!file) {
      uploadLogger.error(`[UploadQueue] Item ${item.id} no tiene localFile`);
      return;
    }

    try {
      let workingItem = item;

      // Fast-path extractos: SHA-256 — no subir ni analizar
      if (item.uploadType === 'BANK_STATEMENT' && item.fileSha256) {
        const fiscalYearId = item.fiscalYearId || resolveFiscalYearId(activeFiscalYearRef.current);
        const existing = await findImportByFileSha256(item.fileSha256, fiscalYearId);
        if (existing) {
          const duplicateItem: QueueItem = {
            ...item,
            status: 'COMPLETED',
            progress: 100,
            isDuplicate: true,
            error: 'Extracto duplicado (mismo archivo).',
            localFile: undefined,
            notificationDismissed: false,
          };
          setQueue((prev) => prev.map((i) => (i.id === item.id ? duplicateItem : i)));
          uploadLogger.info(
            `[UploadQueue] Extracto duplicado por SHA ${item.fileName} (import ${existing.id})`
          );
          try {
            await protectedDatabase.createUploadItem({
              ...duplicateItem,
              localFile: undefined,
            });
          } catch (persistError) {
            uploadLogger.warn(
              '[UploadQueue] No se pudo persistir item duplicado en uploads:',
              persistError
            );
          }
          return;
        }
      }

      let fileHash = item.fileHash;

      // Capa 1 facturas: hash de archivo antes de subir (evita Storage + Gemini)
      if (item.uploadType === 'INVOICE' && !item.forceProcess) {
        if (!fileHash) {
          fileHash = await computeFileSha256(file);
        }

        const fiscalYearId = resolveFiscalYearId(activeFiscalYearRef.current);
        const existingByHash = await resolveExistingByFileHash(
          invoicesRef.current,
          fileHash,
          fiscalYearId
        );

        if (existingByHash) {
          const duplicateMatch = toDuplicateMatch(existingByHash, 'FILE');
          const completedItem: QueueItem = {
            ...item,
            fileHash,
            localFile: file,
            status: 'COMPLETED',
            progress: 100,
            result: cloneInvoicePreviewFromExisting(existingByHash, fileHash),
            duplicateMatch,
            notificationDismissed: false,
          };

          setQueue(prev => prev.map(i => i.id === item.id ? completedItem : i));
          uploadLogger.info(
            `[UploadQueue] Duplicado de archivo detectado para ${item.fileName}, IA omitida`
          );
          return;
        }

        workingItem = { ...item, fileHash };
        setQueue(prev => prev.map(i => i.id === item.id ? workingItem : i));
      }

      // Actualizar estado a UPLOADING
      setQueue(prev => prev.map(i => 
        i.id === workingItem.id ? { ...i, status: 'UPLOADING' as const, progress: 5 } : i
      ));

      uploadLogger.debug(`[UploadQueue] Subiendo ${workingItem.fileName} a Storage...`);
      
      // Generar un fileId válido para Appwrite (máx 36 chars, solo a-z, A-Z, 0-9, ., -, _)
      // Usamos un formato corto: timestamp en base36 + sufijo aleatorio
      const shortTimestamp = Date.now().toString(36).slice(-8);
      const randomPart = Math.random().toString(36).substring(2, 10);
      const fileId = `up_${shortTimestamp}_${randomPart}`;
      
      // Subir archivo a Storage
      const storageFileId = await storageService.uploadFile(file, fileId);
      
      uploadLogger.debug(`[UploadQueue] ${workingItem.fileName} subido, storageFileId: ${storageFileId}`);

      // Crear documento en la colección uploads
      const itemForAppwrite: QueueItem = {
        ...workingItem,
        storageFileId,
        status: 'QUEUED',
        progress: 0,
        localFile: undefined, // No enviar a Appwrite
      };

      const savedItem = await protectedDatabase.createUploadItem(itemForAppwrite);

      uploadLogger.info(`[UploadQueue] ${workingItem.fileName} en cola (appwriteId: ${savedItem.appwriteId})`);

      // Actualizar estado local con los IDs de Appwrite
      setQueue(prev => prev.map(i => 
        i.id === workingItem.id 
          ? { 
              ...savedItem, 
              id: workingItem.id, // Mantener el ID original para consistencia
              localFile: undefined // Ya no necesitamos el archivo local
            } 
          : i
      ));

    } catch (error) {
      uploadLogger.error(`[UploadQueue] Error subiendo ${item.fileName}:`, error);
      
      // Marcar como error
      setQueue(prev => prev.map(i => 
        i.id === item.id 
          ? { 
              ...i, 
              status: 'ERROR' as const, 
              progress: 0,
              error: error instanceof Error ? error.message : 'Error al subir archivo'
            } 
          : i
      ));
    }
  };

  // ============================================================================
  // REMOVE FROM QUEUE - Sin errores 404
  // ============================================================================

  const removeFromQueue = useCallback(async (id: string) => {
    const item = queue.find(i => i.id === id);
    
    // Eliminar de UI inmediatamente
    setQueue(prev => prev.filter(i => i.id !== id));
    
    // También eliminar de la cola de upload si está pendiente
    uploadQueueRef.current = uploadQueueRef.current.filter(i => i.id !== id);
    
    if (!item) return;

    // Si es solo local (PENDING_UPLOAD), ya terminamos
    if (!item.appwriteId) {
      uploadLogger.debug(`[UploadQueue] Item ${id} eliminado (solo local)`);
      return;
    }

    // Si está en Appwrite, eliminar documento y archivo de Storage
    try {
      await protectedDatabase.deleteUploadItem(item.appwriteId, item.storageFileId);
      uploadLogger.info(`[UploadQueue] Item ${id} eliminado de Appwrite`);
    } catch (error) {
      // Error ya manejado en el servicio, solo loguear
      uploadLogger.error(`[UploadQueue] Error eliminando ${id}:`, error);
    }
  }, [queue]);

  // ============================================================================
  // RETRY ITEM
  // ============================================================================

  const retryItem = useCallback(async (id: string) => {
    const item = queue.find(i => i.id === id);
    if (!item) return;

    // Si el item tiene archivo local, reintentar subida
    if (item.localFile && (item.status === 'ERROR' || item.status === 'PENDING_UPLOAD')) {
      setQueue(prev => prev.map(i => 
        i.id === id 
          ? { ...i, status: 'PENDING_UPLOAD' as const, progress: 0, error: undefined } 
          : i
      ));
      uploadQueueRef.current.push(item);
      processUploadQueue();
      return;
    }

    // Si está en Appwrite y tiene storageFileId, reintentar procesamiento Gemini
    if (item.appwriteId && item.storageFileId) {
      const updatedItem: QueueItem = {
        ...item,
        status: 'QUEUED',
        progress: 0,
        error: undefined,
        notificationDismissed: false
      };

      try {
        await protectedDatabase.updateUploadItem(updatedItem);
        setQueue(prev => prev.map(i => i.id === id ? updatedItem : i));
      } catch (error) {
        uploadLogger.error(`[UploadQueue] Error reintentando ${id}:`, error);
      }
    }
  }, [queue, processUploadQueue]);

  const forceReprocessItem = useCallback(async (id: string) => {
    const item = queue.find(i => i.id === id);
    if (!item) return;

    if (item.localFile) {
      const updated: QueueItem = {
        ...item,
        forceProcess: true,
        duplicateMatch: undefined,
        status: 'PENDING_UPLOAD',
        progress: 0,
        error: undefined,
        result: undefined,
        notificationDismissed: false,
      };
      setQueue(prev => prev.map(i => i.id === id ? updated : i));
      uploadQueueRef.current.push(updated);
      processUploadQueue();
      return;
    }

    if (item.appwriteId && item.storageFileId) {
      const updated: QueueItem = {
        ...item,
        forceProcess: true,
        duplicateMatch: undefined,
        status: 'QUEUED',
        progress: 0,
        error: undefined,
        result: undefined,
        notificationDismissed: false,
      };

      try {
        await protectedDatabase.updateUploadItem(updated);
        setQueue(prev => prev.map(i => i.id === id ? updated : i));
      } catch (error) {
        uploadLogger.error(`[UploadQueue] Error forzando reproceso de ${id}:`, error);
      }
    }
  }, [queue, processUploadQueue]);

  // ============================================================================
  // CLEAR COMPLETED
  // ============================================================================

  const clearCompleted = useCallback(async () => {
    // Eliminar localmente primero
    setQueue(prev => prev.filter(item => item.status !== 'COMPLETED'));
    
    // Luego eliminar de Appwrite (incluyendo archivos de Storage)
    try {
      await protectedDatabase.deleteCompletedUploads();
    } catch (error) {
      uploadLogger.error('[UploadQueue] Error eliminando completados:', error);
    }
  }, []);

  // ============================================================================
  // DISMISS NOTIFICATIONS
  // ============================================================================

  const dismissNotifications = useCallback(async () => {
    const itemsToDismiss = queue.filter(
      item => (item.status === 'COMPLETED' || item.status === 'ERROR') && 
              !item.notificationDismissed &&
              item.appwriteId // Solo items que están en Appwrite
    );

    if (itemsToDismiss.length === 0) return;

    // Actualizar localmente primero
    setQueue(prev => prev.map(item =>
      (item.status === 'COMPLETED' || item.status === 'ERROR')
        ? { ...item, notificationDismissed: true }
        : item
    ));

    // Actualizar en Appwrite
    try {
      await Promise.all(
        itemsToDismiss.map(item =>
          protectedDatabase.updateUploadItem({ ...item, notificationDismissed: true })
        )
      );
    } catch (error) {
      uploadLogger.error('[UploadQueue] Error dismissing notifications:', error);
    }
  }, [queue]);

  // ============================================================================
  // GEMINI PROCESSING - Fase 3: Procesar con IA
  // ============================================================================

  const processWithGemini = useCallback(async (item: QueueItem) => {
    if (!item.storageFileId) {
      uploadLogger.error(`[UploadQueue] Item ${item.id} no tiene storageFileId`);
      return;
    }

    setProcessingId(item.id);

    // Actualizar a ANALYZING - UI inmediata, Appwrite en background
    const analyzingItem: QueueItem = { ...item, status: 'ANALYZING', progress: 10 };
    setQueue(prev => prev.map(i => i.id === item.id ? analyzingItem : i));
    
    // Actualizar Appwrite en segundo plano (no bloquear el procesamiento)
    if (item.appwriteId) {
      protectedDatabase.updateUploadItem(analyzingItem).catch(error => {
        uploadLogger.error('[UploadQueue] Error actualizando estado a ANALYZING:', error);
      });
    }

    // Progreso visual
    const progressInterval = setInterval(() => {
      setQueue(prev => prev.map(i => {
        if (i.id === item.id && i.status === 'ANALYZING' && i.progress < 90) {
          return { ...i, progress: i.progress + (Math.random() * 10) };
        }
        return i;
      }));
    }, PROGRESS_UPDATE_INTERVAL);

    try {
      // ========================================================================
      // OPTIMIZACIÓN: Detectar XLSX ANTES de descargar para evitar trabajo innecesario
      // Los archivos XLSX se procesan en el XlsxColumnMapper, no aquí
      // ========================================================================
      if (item.uploadType === 'BANK_STATEMENT') {
        const isXlsx = item.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          item.mimeType === 'application/vnd.ms-excel' ||
          item.fileName.toLowerCase().endsWith('.xlsx') ||
          item.fileName.toLowerCase().endsWith('.xls');

        if (isXlsx) {
          clearInterval(progressInterval);
          
          // XLSX necesita mapeo manual - NO necesita descargar ni procesar con Gemini
          const completedItem: QueueItem = {
            ...item,
            status: 'COMPLETED',
            progress: 100,
            needsMapping: true,
            notificationDismissed: false
          };
          
          // IMPORTANTE: Actualizar UI inmediatamente
          setQueue(prev => prev.map(i => i.id === item.id ? completedItem : i));
          
          // Actualizar Appwrite en segundo plano (fire-and-forget)
          if (item.appwriteId) {
            protectedDatabase.updateUploadItem(completedItem).catch(err => {
              uploadLogger.error('[UploadQueue] Error guardando estado COMPLETED para XLSX:', err);
            });
          }
          
          uploadLogger.info(`[UploadQueue] XLSX ${item.fileName} listo para mapeo de columnas`);
          
          // IMPORTANTE: Limpiar processingId antes de salir para permitir procesar más items
          setProcessingId(null);
          return; // Salir - no necesitamos procesar más
        }
      }

      // ========================================================================
      // Para PDFs y facturas: descargar de Storage y procesar con Gemini
      // ========================================================================
      uploadLogger.debug(`[UploadQueue] Descargando archivo ${item.storageFileId} de Storage...`);
      const blob = await storageService.downloadFile(item.storageFileId);
      
      // Convertir a base64 para Gemini API
      const base64 = await blobToBase64(blob);
      const base64ForApi = base64.includes(',') ? base64.split(',')[1] : base64;

      if (!base64ForApi) {
        throw new Error('Error convirtiendo archivo a base64');
      }

      const safeMime = normalizeMimeType(item.mimeType);
      if (!isAllowedGeminiMimeType(safeMime, item.fileName)) {
        throw new Error(`Tipo de archivo no permitido para análisis IA: ${item.mimeType || '(vacío)'} (${item.fileName})`);
      }

      if (item.uploadType === 'INVOICE') {
        const data = await analyzeInvoiceImage(base64ForApi, safeMime, suppliers);

        // Buscar proveedor si la IA lo sugirió
        let matchedSupplierId: string | undefined = undefined;
        if (data.matchedSupplierId) {
          const supplier = suppliers.find(s =>
            s.name.toLowerCase() === data.matchedSupplierId.toLowerCase() ||
            s.nif === data.issuerNif
          );
          if (supplier) {
            matchedSupplierId = supplier.id;
          }
        }

        const resultInvoice: Invoice = {
          id: generateId(),
          ...data,
          supplierId: matchedSupplierId,
          status: 'PENDING',
          fileHash: item.fileHash,
          contentFingerprint: buildContentFingerprint({
            issuerNif: data.issuerNif,
            number: data.number,
            date: data.date,
            totalAmount: data.totalAmount,
          }),
          history: [{ date: new Date().toISOString(), action: 'Analyzed via Gemini', user: 'System' }]
        };

        const fiscalYearId = resolveFiscalYearId(activeFiscalYearRef.current);
        const existingByContent = await resolveExistingByContentFingerprint(
          invoicesRef.current,
          resultInvoice.contentFingerprint!,
          fiscalYearId
        );
        const duplicateMatch = existingByContent
          ? toDuplicateMatch(existingByContent, 'CONTENT')
          : item.duplicateMatch;

        clearInterval(progressInterval);

        const completedItem: QueueItem = {
          ...item,
          status: 'COMPLETED',
          progress: 100,
          result: resultInvoice,
          duplicateMatch,
          notificationDismissed: false
        };

        // IMPORTANTE: Actualizar UI inmediatamente ANTES de esperar a Appwrite
        setQueue(prev => prev.map(i => i.id === item.id ? completedItem : i));
        
        // Actualizar Appwrite en segundo plano
        if (item.appwriteId) {
          protectedDatabase.updateUploadItem(completedItem).catch(err => {
            uploadLogger.error('[UploadQueue] Error guardando estado COMPLETED para factura:', err);
          });
        }
        
        uploadLogger.info(`[UploadQueue] Factura ${item.fileName} procesada`);

      } else if (item.uploadType === 'BANK_STATEMENT') {
        // PDF/imagen de extracto bancario - procesar con IA
        // (Los XLSX ya fueron manejados arriba y retornaron)
        const transactions = await analyzeBankStatement(base64ForApi, safeMime);

        const enrichedTransactions: BankTransaction[] = transactions.map(t => ({
          id: generateId(),
          ...t,
          status: 'PENDING' as const
        }));

        clearInterval(progressInterval);

        const completedItem: QueueItem = {
          ...item,
          status: 'COMPLETED',
          progress: 100,
          bankResult: enrichedTransactions,
          notificationDismissed: false
        };
        
        // IMPORTANTE: Actualizar UI inmediatamente ANTES de esperar a Appwrite
        setQueue(prev => prev.map(i => i.id === item.id ? completedItem : i));
        
        // Actualizar Appwrite en segundo plano
        if (item.appwriteId) {
          protectedDatabase.updateUploadItem(completedItem).catch(err => {
            uploadLogger.error('[UploadQueue] Error guardando estado COMPLETED para PDF:', err);
          });
        }
        
        uploadLogger.info(`[UploadQueue] PDF ${item.fileName} procesado: ${enrichedTransactions.length} transacciones`);
      }

    } catch (err: unknown) {
      clearInterval(progressInterval);
      uploadLogger.error('[UploadQueue] Error procesando con Gemini:', err);

      const errorMessage = err instanceof Error ? err.message : 'Error en análisis IA.';
      const errorItem: QueueItem = {
        ...item,
        status: 'ERROR',
        progress: 0,
        error: errorMessage,
        notificationDismissed: false
      };

      // IMPORTANTE: Actualizar UI inmediatamente
      setQueue(prev => prev.map(i => i.id === item.id ? errorItem : i));
      
      // Actualizar Appwrite en segundo plano
      if (item.appwriteId) {
        protectedDatabase.updateUploadItem(errorItem).catch(saveError => {
          uploadLogger.error('[UploadQueue] Error guardando estado de error:', saveError);
        });
      }
    } finally {
      setProcessingId(null);
    }
  }, [suppliers]);

  // ============================================================================
  // PROCESSING LOOP - Procesar items QUEUED con Gemini
  // ============================================================================

  useEffect(() => {
    if (processingId) return;
    if (!isHydrated) return;
    
    // Buscar el siguiente item QUEUED que tenga storageFileId
    const nextItem = queue.find(item => 
      item.status === 'QUEUED' && 
      item.storageFileId &&
      item.appwriteId
    );
    
    if (!nextItem) return;

    processWithGemini(nextItem);
  }, [queue, processingId, isHydrated, processWithGemini]);

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const isUploading = queue.some(item => 
    item.status === 'PENDING_UPLOAD' || item.status === 'UPLOADING'
  );
  
  const pendingCount = queue.filter(item => 
    item.status === 'PENDING_UPLOAD' || 
    item.status === 'UPLOADING' || 
    item.status === 'QUEUED' ||
    item.status === 'ANALYZING'
  ).length;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <UploadQueueContext.Provider value={{ 
      queue, 
      addToQueue, 
      removeFromQueue, 
      retryItem,
      forceReprocessItem,
      clearCompleted, 
      dismissNotifications,
      isUploading,
      pendingCount
    }}>
      {children}
    </UploadQueueContext.Provider>
  );
};

// ============================================================================
// HELPERS
// ============================================================================

const resolveFiscalYearId = (
  activeFiscalYear: { id: string; appwriteId?: string } | null
): string | undefined => activeFiscalYear?.appwriteId || activeFiscalYear?.id;

const cloneInvoicePreviewFromExisting = (existing: Invoice, fileHash: string): Invoice => ({
  ...existing,
  id: generateId(),
  appwriteId: undefined,
  appwriteFileId: undefined,
  status: 'PENDING',
  fileHash,
  contentFingerprint: existing.contentFingerprint || buildContentFingerprint(existing),
  history: [{
    date: new Date().toISOString(),
    action: 'Archivo duplicado detectado (hash)',
    user: 'System',
  }],
});

async function resolveExistingByFileHash(
  invoices: Invoice[],
  fileHash: string,
  fiscalYearId?: string
): Promise<Invoice | undefined> {
  const inMemory = findDuplicateByFileHash(invoices, fileHash, fiscalYearId);
  if (inMemory) return inMemory;
  const remote = await protectedDatabase.findInvoiceByFileHash(fileHash, fiscalYearId);
  return remote ?? undefined;
}

async function resolveExistingByContentFingerprint(
  invoices: Invoice[],
  fingerprint: string,
  fiscalYearId?: string
): Promise<Invoice | undefined> {
  const inMemory = findDuplicateByContentFingerprint(invoices, fingerprint, fiscalYearId);
  if (inMemory) return inMemory;
  const remote = await protectedDatabase.findInvoiceByContentFingerprint(fingerprint, fiscalYearId);
  return remote ?? undefined;
}

/**
 * Convierte un Blob a base64 string
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => {
      const result = reader.result?.toString();
      if (result) resolve(result);
      else reject(new Error('Failed to convert blob to base64'));
    };
    reader.onerror = reject;
  });
}
