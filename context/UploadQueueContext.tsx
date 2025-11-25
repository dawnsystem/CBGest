import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { QueueItem, UploadQueueContextType, Invoice, UploadType, BankTransaction, Supplier, AppSettings } from '../types';
import { analyzeInvoiceImage, analyzeBankStatement, parseXlsxBankStatement } from '../services/geminiService';
import { protectedDatabase } from '../lib/appwrite/protectedDatabase';
import { useAuth } from './AuthContext';

const UploadQueueContext = createContext<UploadQueueContextType | undefined>(undefined);

// Helper to check if using Appwrite
const isUsingAppwrite = (): boolean => {
  try {
    const saved = localStorage.getItem('gestcb_settings');
    if (!saved) return false;
    const settings: AppSettings = JSON.parse(saved);
    return settings.dataConfig?.type === 'APPWRITE' && !!settings.dataConfig.appwriteProjectId;
  } catch {
    return false;
  }
};

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

  // 1. Hydrate from Appwrite or LocalStorage - reload when user changes
  useEffect(() => {
    const loadQueue = async () => {
      if (isUsingAppwrite() && user) {
        try {
          const loadedItems = await protectedDatabase.getUploadQueue();
          // Reconstruct File objects from base64Data
          const rehydratedItems: QueueItem[] = loadedItems.map((item: any) => {
            let file = item.file;
            if (item.base64Data) {
              file = base64ToFile(item.base64Data, item.fileName, item.mimeType);
            }
            return { ...item, file };
          });
          setQueue(rehydratedItems);
        } catch (error) {
          // Silently handle errors - getUploadQueue already logs unexpected errors
          setQueue([]);
        }
      } else if (!isUsingAppwrite()) {
        // Load from localStorage
        const savedQueue = localStorage.getItem('gestcb_upload_queue');
        if (savedQueue) {
          try {
            const parsedItems = JSON.parse(savedQueue);
            const rehydratedItems: QueueItem[] = parsedItems.map((item: any) => {
              let file = item.file;
              if (item.base64Data) {
                file = base64ToFile(item.base64Data, item.fileName, item.mimeType);
              }
              return { ...item, file };
            });
            setQueue(rehydratedItems);
          } catch (e) {
            console.error("Failed to hydrate queue from localStorage:", e);
            localStorage.removeItem('gestcb_upload_queue');
          }
        }
      } else {
        // Using Appwrite but no user - clear queue
        setQueue([]);
      }
      setIsHydrated(true);
    };

    loadQueue();
  }, [user]); // Re-load when user changes

  // 2. Persist to LocalStorage (only in LOCAL_STORAGE mode)
  useEffect(() => {
    if (!isHydrated) return;

    if (!isUsingAppwrite()) {
      // Only save to localStorage in LOCAL_STORAGE mode
      try {
        const serializedQueue = queue.map(item => {
          const { file, ...rest } = item;
          return rest; // file is reconstructed from base64Data
        });
        localStorage.setItem('gestcb_upload_queue', JSON.stringify(serializedQueue));
      } catch (e) {
        console.warn("Storage quota exceeded.");
      }
    }
    // In Appwrite mode, individual operations handle persistence
  }, [queue, isHydrated]);


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

    if (isUsingAppwrite()) {
      try {
        // Create items in Appwrite using protectedDatabase (rate limited)
        const savedItems = await Promise.all(
          newItems.map(item => protectedDatabase.createUploadItem(item))
        );
        setQueue(prev => [...prev, ...savedItems]);
      } catch (error) {
        // Fallback to local state but log warning for debugging
        console.warn('Error añadiendo elementos a la cola en Appwrite, usando estado local:', error);
        setQueue(prev => [...prev, ...newItems]);
      }
    } else {
      setQueue(prev => [...prev, ...newItems]);
    }
  };

  const removeFromQueue = async (id: string) => {
    if (isUsingAppwrite()) {
      try {
        await protectedDatabase.deleteUploadItem(id);
        setQueue(prev => prev.filter(item => item.id !== id));
      } catch (error) {
        // Fallback to local state but log warning for debugging
        console.warn('Error eliminando elemento de la cola en Appwrite, usando estado local:', error);
        setQueue(prev => prev.filter(item => item.id !== id));
      }
    } else {
      setQueue(prev => prev.filter(item => item.id !== id));
    }
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

    if (isUsingAppwrite()) {
      try {
        await protectedDatabase.updateUploadItem(updatedItem);
        setQueue(prev => prev.map(i => i.id === id ? updatedItem : i));
      } catch (error) {
        // Fallback to local state but log warning for debugging
        console.warn('Error reintentando elemento en Appwrite, usando estado local:', error);
        setQueue(prev => prev.map(i => i.id === id ? updatedItem : i));
      }
    } else {
      setQueue(prev => prev.map(i => i.id === id ? updatedItem : i));
    }
  };

  const clearCompleted = async () => {
    if (isUsingAppwrite()) {
      try {
        await protectedDatabase.deleteCompletedUploads();
        setQueue(prev => prev.filter(item => item.status !== 'COMPLETED'));
      } catch (error) {
        // Fallback to local state but log warning for debugging
        console.warn('Error limpiando elementos completados en Appwrite, usando estado local:', error);
        setQueue(prev => prev.filter(item => item.status !== 'COMPLETED'));
      }
    } else {
      setQueue(prev => prev.filter(item => item.status !== 'COMPLETED'));
    }
  };

  const dismissNotifications = async () => {
    const itemsToDismiss = queue.filter(
      item => (item.status === 'COMPLETED' || item.status === 'ERROR') && !item.notificationDismissed
    );

    if (isUsingAppwrite()) {
      try {
        // Use protectedDatabase with rate limiting - updates are debounced
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
      } catch (error) {
        // Fallback to local state but log warning for debugging
        console.warn('Error actualizando notificaciones en Appwrite, usando estado local:', error);
        setQueue(prev => prev.map(item =>
          (item.status === 'COMPLETED' || item.status === 'ERROR')
            ? { ...item, notificationDismissed: true }
            : item
        ));
      }
    } else {
      setQueue(prev => prev.map(item =>
        (item.status === 'COMPLETED' || item.status === 'ERROR')
          ? { ...item, notificationDismissed: true }
          : item
      ));
    }
  };

  // Processing Logic
  useEffect(() => {
    if (processingId) return;
    const nextItem = queue.find(item => item.status === 'QUEUED');
    if (!nextItem) return;

    processItem(nextItem);
  }, [queue, processingId]);

  // Helper to update queue item both locally and in Appwrite
  // Uses protectedDatabase which has built-in debounce (2 seconds) for progress updates
  const updateQueueItem = async (updatedItem: QueueItem) => {
    setQueue(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));

    if (isUsingAppwrite()) {
      try {
        // protectedDatabase.updateUploadItem has built-in debounce to prevent rate limiting
        await protectedDatabase.updateUploadItem(updatedItem);
      } catch (error) {
        // Log warning but continue - local state is already updated
        console.warn('Error actualizando elemento de cola en Appwrite:', error);
      }
    }
  };

  const processItem = async (item: QueueItem) => {
    setProcessingId(item.id);

    // Update to ANALYZING status
    const analyzingItem = { ...item, status: 'ANALYZING' as const, progress: 10 };
    await updateQueueItem(analyzingItem);

    // OPTIMIZED: Progress updates now use protectedDatabase with built-in 2-second debounce
    // This prevents rate limiting by grouping rapid updates into single API calls
    const progressInterval = setInterval(() => {
      setQueue(prev => prev.map(i => {
        if (i.id === item.id && i.status === 'ANALYZING' && i.progress < 90) {
          const updatedProgress = { ...i, progress: i.progress + (Math.random() * 10) };
          // protectedDatabase has built-in debounce - safe to call frequently
          if (isUsingAppwrite()) {
            protectedDatabase.updateUploadItem(updatedProgress)
              .catch((error) => {
                // Log warning but don't block progress - this is non-critical
                console.warn('Error actualizando progreso en Appwrite:', error);
              });
          }
          return updatedProgress;
        }
        return i;
      }));
    }, 1000); // Increased from 500ms to 1000ms for additional rate limit protection

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

        const completedItem = {
          ...item,
          status: 'COMPLETED' as const,
          progress: 100,
          result: resultInvoice,
          notificationDismissed: false
        };
        await updateQueueItem(completedItem);

      } else if (item.uploadType === 'BANK_STATEMENT') {
        // Detect file type
        const isXlsx = item.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          item.mimeType === 'application/vnd.ms-excel' ||
          item.fileName.toLowerCase().endsWith('.xlsx') ||
          item.fileName.toLowerCase().endsWith('.xls');

        if (isXlsx) {
          // XLSX files need manual column mapping - mark as ready for mapping
          const completedItem = {
            ...item,
            status: 'COMPLETED' as const,
            progress: 100,
            needsMapping: true, // Flag to show mapping UI
            notificationDismissed: false
          };
          await updateQueueItem(completedItem);
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
          await updateQueueItem(completedItem);
        }
      }

      clearInterval(progressInterval);

    } catch (err: any) {
      clearInterval(progressInterval);
      console.error(err);

      const errorItem = {
        ...item,
        status: 'ERROR' as const,
        progress: 0,
        error: err.message || 'Error en análisis IA.',
        notificationDismissed: false
      };
      await updateQueueItem(errorItem);
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