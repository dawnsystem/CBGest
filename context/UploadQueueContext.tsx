import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { QueueItem, UploadQueueContextType, Invoice } from '../types';
import { analyzeInvoiceImage } from '../services/geminiService';

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
        while(n--){
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, {type: mimeType});
    } catch (e) {
        console.error("Error reconstructing file:", e);
        return new File([""], filename, {type: mimeType});
    }
};

export const UploadQueueProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // 1. Hydrate from LocalStorage on Mount
  useEffect(() => {
    const savedQueue = localStorage.getItem('gestcb_upload_queue');
    if (savedQueue) {
        try {
            const parsedItems = JSON.parse(savedQueue);
            const rehydratedItems: QueueItem[] = parsedItems.map((item: any) => {
                let file = item.file;
                if (item.base64Data) {
                    file = base64ToFile(item.base64Data, item.fileName, item.mimeType);
                }
                
                let result = item.result;
                if (result) {
                    result = { ...result, file: file };
                }

                return {
                    ...item,
                    file,
                    result
                };
            });
            setQueue(rehydratedItems);
        } catch (e) {
            console.error("Failed to hydrate queue:", e);
            localStorage.removeItem('gestcb_upload_queue');
        }
    }
    setIsHydrated(true);
  }, []);

  // 2. Persist to LocalStorage
  useEffect(() => {
    if (!isHydrated) return;

    try {
        const serializedQueue = queue.map(item => {
            const { file, result, ...rest } = item;
            const serializedResult = result ? { ...result, file: undefined } : undefined;
            return { ...rest, result: serializedResult };
        });
        localStorage.setItem('gestcb_upload_queue', JSON.stringify(serializedQueue));
    } catch (e) {
        console.warn("Storage quota exceeded. Drafts might not be saved.");
    }
  }, [queue, isHydrated]);


  const addToQueue = async (files: File[]) => {
    const newItemsPromises = files.map(async (file) => {
        const base64Full = await fileToBase64(file);
        return {
            id: Math.random().toString(36).substr(2, 9),
            file,
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
    setQueue(prev => [...prev, ...newItems]);
  };

  const removeFromQueue = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const retryItem = (id: string) => {
    setQueue(prev => prev.map(item => 
      item.id === id ? { ...item, status: 'QUEUED', progress: 0, error: undefined, notificationDismissed: false } : item
    ));
  };

  // FIX: clearCompleted removes data. We keep it for legacy but generally shouldn't be used by the widget X button.
  const clearCompleted = () => {
    setQueue(prev => prev.filter(item => item.status !== 'COMPLETED'));
  };

  // NEW: Just hides them from the notification widget
  const dismissNotifications = () => {
    setQueue(prev => prev.map(item => 
       (item.status === 'COMPLETED' || item.status === 'ERROR') 
       ? { ...item, notificationDismissed: true } 
       : item
    ));
  };

  // Processing Logic
  useEffect(() => {
    if (processingId) return;
    const nextItem = queue.find(item => item.status === 'QUEUED');
    if (!nextItem) return;

    processItem(nextItem);
  }, [queue, processingId]);

  const processItem = async (item: QueueItem) => {
    setProcessingId(item.id);
    
    setQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'ANALYZING', progress: 10 } : i));

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
      if (base64ForApi.includes(',')) {
          base64ForApi = base64ForApi.split(',')[1];
      }

      if (!base64ForApi) throw new Error("Data invalid");

      const data = await analyzeInvoiceImage(base64ForApi, item.mimeType);

      clearInterval(progressInterval);
      
      const resultInvoice: Invoice = {
        id: Math.random().toString(36).substr(2, 9),
        ...data,
        status: 'PENDING',
        history: [{
          date: new Date().toISOString(),
          action: 'Analyzed via Gemini',
          user: 'System'
        }]
      };

      setQueue(prev => prev.map(i => 
        i.id === item.id 
          ? { 
              ...i, 
              status: 'COMPLETED', 
              progress: 100, 
              result: resultInvoice,
              notificationDismissed: false // Show notification when done
            } 
          : i
      ));

    } catch (err) {
      clearInterval(progressInterval);
      console.error(err);
      setQueue(prev => prev.map(i => 
        i.id === item.id 
          ? { ...i, status: 'ERROR', progress: 0, error: 'Error en análisis IA.', notificationDismissed: false } 
          : i
      ));
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