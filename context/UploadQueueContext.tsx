import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { QueueItem, UploadQueueContextType, Invoice, UploadType, BankTransaction, Supplier } from '../types';
import { analyzeInvoiceImage, analyzeBankStatement } from '../services/geminiService';
import { protectedDatabase } from '../lib/appwrite/protectedDatabase';
import { useAuth } from './AuthContext';

const UploadQueueContext = createContext<UploadQueueContextType | undefined>(undefined);

export const useUploadQueue = () => {
  const context = useContext(UploadQueueContext);
  if (!context) {
    throw new Error('useUploadQueue must be used within an UploadQueueProvider');
  }
  return context;
};

// Helper: File to Base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result?.toString();
      if (result) resolve(result);
      else reject(new Error("Failed to read file"));
    };
    reader.onerror = reject;
  });
};

// Helper: Base64 to File
const base64ToFile = (dataurl: string, filename: string, mimeType: string): File => {
  try {
    const arr = dataurl.split(',');
    const bstr = atob(arr.length > 1 ? arr[1] : arr[0]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mimeType });
  } catch (e) {
    console.error("Error reconstructing file:", e);
    return new File([""], filename, { type: mimeType });
  }
};

interface UploadQueueProviderProps {
  children: ReactNode;
  suppliers?: Supplier[];
}

export const UploadQueueProvider: React.FC<UploadQueueProviderProps> = ({ children, suppliers = [] }) => {
  const { user } = useAuth();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load queue from Appwrite on mount and when user changes
  useEffect(() => {
    const loadQueue = async () => {
      if (!user) {
        setQueue([]);
        setIsHydrated(true);
        return;
      }

      try {
        const loadedItems = await protectedDatabase.getUploadQueue();
        // Reconstruct File objects from base64Data
        const rehydratedItems: QueueItem[] = loadedItems.map((item: QueueItem) => {
          let file = item.file;
          if (item.base64Data) {
            file = base64ToFile(item.base64Data, item.fileName, item.mimeType);
          }
          return { ...item, file };
        });
        setQueue(rehydratedItems);
      } catch (error) {
        console.error('Error cargando cola de subidas:', error);
        setQueue([]);
      }
      setIsHydrated(true);
    };

    loadQueue();
  }, [user]);

  const addToQueue = async (files: File[], type: UploadType) => {
    const newItemsPromises = files.map(async (file) => {
      const base64Full = await fileToBase64(file);
      return {
        id: Math.random().toString(36).substr(2, 9),
        file,
        uploadType: type,
        fileName: file.name,
        mimeType: file.type,
        base64Data: base64Full,
        status: 'QUEUED' as const,
        progress: 0,
        timestamp: Date.now(),
        notificationDismissed: false
      };
    });

    const newItems = await Promise.all(newItemsPromises);

    // Create items in Appwrite - no fallback to local state
    const savedItems = await Promise.all(
      newItems.map(item => protectedDatabase.createUploadItem(item))
    );
    setQueue(prev => [...prev, ...savedItems]);
  };

  const removeFromQueue = async (id: string) => {
    await protectedDatabase.deleteUploadItem(id);
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const retryItem = async (id: string) => {
    const item = queue.find(i => i.id === id);
    if (!item) return;

    const updatedItem = {
      ...item,
      status: 'QUEUED' as const,
      progress: 0,
      error: undefined,
      notificationDismissed: false
    };

    await protectedDatabase.updateUploadItem(updatedItem);
    setQueue(prev => prev.map(i => i.id === id ? updatedItem : i));
  };

  const clearCompleted = async () => {
    await protectedDatabase.deleteCompletedUploads();
    setQueue(prev => prev.filter(item => item.status !== 'COMPLETED'));
  };

  const dismissNotifications = async () => {
    const itemsToDismiss = queue.filter(
      item => (item.status === 'COMPLETED' || item.status === 'ERROR') && !item.notificationDismissed
    );

    // Update in Appwrite - debounced to avoid rate limiting
    await Promise.all(
      itemsToDismiss.map(item =>
        protectedDatabase.updateUploadItem({ ...item, notificationDismissed: true })
      )
    );
    setQueue(prev => prev.map(item =>
      (item.status === 'COMPLETED' || item.status === 'ERROR')
        ? { ...item, notificationDismissed: true }
        : item
    ));
  };

  // Processing Logic
  useEffect(() => {
    if (processingId) return;
    if (!isHydrated) return;
    const nextItem = queue.find(item => item.status === 'QUEUED');
    if (!nextItem) return;

    processItem(nextItem);
  }, [queue, processingId, isHydrated]);

  const processItem = async (item: QueueItem) => {
    setProcessingId(item.id);

    // Update to ANALYZING status - save to Appwrite
    const analyzingItem = { ...item, status: 'ANALYZING' as const, progress: 10 };
    try {
      await protectedDatabase.updateUploadItem(analyzingItem);
    } catch (error) {
      console.error('Error actualizando estado a ANALYZING:', error);
    }
    setQueue(prev => prev.map(i => i.id === item.id ? analyzingItem : i));

    // OPTIMIZED: Only update progress locally to avoid rate limiting
    // We only save to Appwrite at the start (ANALYZING) and end (COMPLETED/ERROR)
    const progressInterval = setInterval(() => {
      setQueue(prev => prev.map(i => {
        if (i.id === item.id && i.status === 'ANALYZING' && i.progress < 90) {
          return { ...i, progress: i.progress + (Math.random() * 10) };
        }
        return i;
      }));
    }, 500);

    try {
      let base64ForApi = item.base64Data || '';
      if (base64ForApi.includes(',')) base64ForApi = base64ForApi.split(',')[1];
      if (!base64ForApi) throw new Error("Data invalid");

      // CRITICAL: Choose parser based on uploadType
      if (item.uploadType === 'INVOICE') {
        const data = await analyzeInvoiceImage(base64ForApi, item.mimeType, suppliers);

        // If AI matched a supplier, find the supplier ID
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
          id: Math.random().toString(36).substr(2, 9),
          ...data,
          supplierId: matchedSupplierId,
          status: 'PENDING',
          history: [{ date: new Date().toISOString(), action: 'Analyzed via Gemini', user: 'System' }]
        };

        clearInterval(progressInterval);

        const completedItem = {
          ...item,
          status: 'COMPLETED' as const,
          progress: 100,
          result: resultInvoice,
          notificationDismissed: false
        };

        // Save final state to Appwrite
        await protectedDatabase.updateUploadItem(completedItem);
        setQueue(prev => prev.map(i => i.id === item.id ? completedItem : i));

      } else if (item.uploadType === 'BANK_STATEMENT') {
        // Detect file type
        const isXlsx = item.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          item.mimeType === 'application/vnd.ms-excel' ||
          item.fileName.toLowerCase().endsWith('.xlsx') ||
          item.fileName.toLowerCase().endsWith('.xls');

        clearInterval(progressInterval);

        if (isXlsx) {
          // XLSX files need manual column mapping - mark as ready for mapping
          const completedItem = {
            ...item,
            status: 'COMPLETED' as const,
            progress: 100,
            needsMapping: true, // Flag to show mapping UI
            notificationDismissed: false
          };
          await protectedDatabase.updateUploadItem(completedItem);
          setQueue(prev => prev.map(i => i.id === item.id ? completedItem : i));
        } else {
          // Use AI for PDF/images
          const transactions = await analyzeBankStatement(base64ForApi, item.mimeType);

          // Add IDs to transactions
          const enrichedTransactions: BankTransaction[] = transactions.map(t => ({
            id: Math.random().toString(36).substr(2, 9),
            ...t,
            status: 'PENDING' as const
          }));

          const completedItem = {
            ...item,
            status: 'COMPLETED' as const,
            progress: 100,
            bankResult: enrichedTransactions,
            notificationDismissed: false
          };
          await protectedDatabase.updateUploadItem(completedItem);
          setQueue(prev => prev.map(i => i.id === item.id ? completedItem : i));
        }
      }

    } catch (err: unknown) {
      clearInterval(progressInterval);
      console.error(err);

      const errorMessage = err instanceof Error ? err.message : 'Error en análisis IA.';
      const errorItem = {
        ...item,
        status: 'ERROR' as const,
        progress: 0,
        error: errorMessage,
        notificationDismissed: false
      };

      // Save error state to Appwrite
      try {
        await protectedDatabase.updateUploadItem(errorItem);
      } catch (saveError) {
        console.error('Error guardando estado de error:', saveError);
      }
      setQueue(prev => prev.map(i => i.id === item.id ? errorItem : i));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <UploadQueueContext.Provider value={{ queue, addToQueue, removeFromQueue, retryItem, clearCompleted, dismissNotifications }}>
      {children}
    </UploadQueueContext.Provider>
  );
};
