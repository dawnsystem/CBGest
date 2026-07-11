/**
 * @fileoverview Servicio de cola de uploads para Appwrite
 */

import { Query, ID } from 'appwrite';
import { databases, storage, config } from '../../lib/appwrite/client';
import { dataLogger } from '../logger';
import {
  withRetry,
  notifyError,
  setConnectionHealth,
  getErrorCode,
} from './infrastructure';
import type { QueueItem } from '../../types';

export async function createUploadItem(item: QueueItem): Promise<QueueItem> {
  try {
    const {
      localFile,
      result,
      bankResult,
      id,
      appwriteId,
      createdAt, updatedAt,
      $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
      ...itemData
    } = item as any;

    const dataToSave = {
      ...itemData,
      progress: Math.round(itemData.progress || 0),
      fileSize: itemData.fileSize || 0,
      result: result ? JSON.stringify(result) : undefined,
      bankResult: bankResult ? JSON.stringify(bankResult) : undefined
    };

    const doc = await withRetry(
      () => databases.createDocument(
        config.databaseId,
        config.collections.uploads,
        id || ID.unique(),
        dataToSave
      ),
      'createUploadItem'
    );

    setConnectionHealth(true);
    return {
      ...doc,
      id: doc.$id,
      appwriteId: doc.$id,
      result,
      bankResult,
    } as unknown as QueueItem;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'createUploadItem');
    setConnectionHealth(false);
    throw error;
  }
}

export async function getUploadQueue(): Promise<QueueItem[]> {
  try {
    if (!config.collections.uploads) return [];

    const response = await withRetry(
      () => databases.listDocuments(
        config.databaseId,
        config.collections.uploads,
        [Query.orderDesc('timestamp'), Query.limit(100)]
      ),
      'getUploadQueue'
    );

    setConnectionHealth(true);
    return response.documents.map((doc: any) => ({
      id: doc.$id,
      appwriteId: doc.$id,
      storageFileId: doc.storageFileId,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize || 0,
      uploadType: doc.uploadType,
      status: doc.status,
      progress: doc.progress || 0,
      error: doc.error,
      timestamp: doc.timestamp,
      notificationDismissed: doc.notificationDismissed,
      needsMapping: doc.needsMapping,
      result: doc.result && typeof doc.result === 'string' ? JSON.parse(doc.result) : doc.result,
      bankResult: doc.bankResult && typeof doc.bankResult === 'string' ? JSON.parse(doc.bankResult) : doc.bankResult,
    })) as QueueItem[];
  } catch (error: unknown) {
    if (getErrorCode(error) === 404 || getErrorCode(error) === 401) return [];
    notifyError((error instanceof Error ? error.message : String(error)), 'getUploadQueue');
    setConnectionHealth(false);
    throw error;
  }
}

export async function updateUploadItem(item: QueueItem): Promise<QueueItem> {
  try {
    const {
      localFile,
      result,
      bankResult,
      id,
      appwriteId,
      createdAt, updatedAt,
      $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions,
      ...itemData
    } = item as any;
    const docId = appwriteId || id;

    const dataToSave = {
      ...itemData,
      progress: Math.round(itemData.progress || 0),
      result: result ? JSON.stringify(result) : undefined,
      bankResult: bankResult ? JSON.stringify(bankResult) : undefined
    };

    const doc = await withRetry(
      () => databases.updateDocument(
        config.databaseId,
        config.collections.uploads,
        docId,
        dataToSave
      ),
      'updateUploadItem'
    );

    setConnectionHealth(true);
    return {
      ...doc,
      id: doc.$id,
      appwriteId: doc.$id,
      result,
      bankResult
    } as unknown as QueueItem;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'updateUploadItem');
    setConnectionHealth(false);
    throw error;
  }
}

export async function deleteUploadItem(id: string, storageFileId?: string): Promise<void> {
  try {
    if (storageFileId) {
      try {
        await storage.deleteFile(config.bucketId, storageFileId);
        dataLogger.debug(`[deleteUploadItem] Archivo ${storageFileId} eliminado de Storage`);
      } catch (storageError: any) {
        if (storageError?.code !== 404) {
          console.warn(`[deleteUploadItem] Error eliminando archivo de Storage:`, storageError.message);
        }
      }
    }

    await withRetry(
      () => databases.deleteDocument(config.databaseId, config.collections.uploads, id),
      'deleteUploadItem'
    );
    setConnectionHealth(true);
  } catch (error: unknown) {
    if (getErrorCode(error) === 404) {
      dataLogger.debug(`[deleteUploadItem] Documento ${id} no encontrado - ya fue eliminado`);
      return;
    }
    notifyError((error instanceof Error ? error.message : String(error)), 'deleteUploadItem');
    setConnectionHealth(false);
    throw error;
  }
}

export async function deleteCompletedUploads(): Promise<void> {
  try {
    const response = await withRetry(
      () => databases.listDocuments(
        config.databaseId,
        config.collections.uploads,
        [Query.equal('status', 'COMPLETED'), Query.limit(100)]
      ),
      'listCompletedUploads'
    );

    await Promise.all(
      response.documents.map(async (doc: any) => {
        try {
          if (doc.storageFileId) {
            try {
              await storage.deleteFile(config.bucketId, doc.storageFileId);
            } catch (storageError: any) {
              if (storageError?.code !== 404) {
                console.warn(`[deleteCompletedUploads] Error eliminando archivo:`, storageError.message);
              }
            }
          }

          await withRetry(
            () => databases.deleteDocument(config.databaseId, config.collections.uploads, doc.$id),
            'deleteCompletedUploadBatch'
          );
        } catch (error: unknown) {
          if (getErrorCode(error) !== 404) {
            throw error;
          }
        }
      })
    );
    setConnectionHealth(true);
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'deleteCompletedUploads');
    setConnectionHealth(false);
    throw error;
  }
}
