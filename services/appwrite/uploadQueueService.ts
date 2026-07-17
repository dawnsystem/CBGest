/**
 * @fileoverview Servicio de cola de uploads para Appwrite
 */

import { Query, ID } from 'appwrite';
import { databases, storage, config } from '../../lib/appwrite/client';
import { dataLogger } from '../logger';
import {
  AppwriteEntity,
  omitFields,
  withRetry,
  notifyError,
  setConnectionHealth,
  getErrorCode,
  getErrorMessage,
} from './infrastructure';
import type { BankTransaction, QueueItem } from '../../types';

type UploadQueueDocument = AppwriteEntity<QueueItem> & { $id: string };

function safeJsonParse<T>(raw: string, field: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    dataLogger.warn(`uploadQueueService: invalid JSON in field "${field}", skipping`, e);
    return undefined;
  }
}

/** Fields added for bank-statement dedup; may be absent on older Cloud schemas. */
const DEDUP_UPLOAD_FIELDS = ['fileSha256', 'isDuplicate', 'fiscalYearId'] as const;

function buildUploadPayload(
  item: QueueItem,
  options: { includeDedupFields: boolean }
): Record<string, unknown> {
  const { result, bankResult } = item;
  const omitList: Array<keyof QueueItem | 'appwriteId' | 'createdAt' | 'updatedAt' | keyof AppwriteEntity<QueueItem>> = [
    'id',
    'appwriteId',
    'createdAt',
    'updatedAt',
    'localFile',
    '$id',
    '$createdAt',
    '$updatedAt',
    '$databaseId',
    '$collectionId',
    '$permissions',
  ];
  if (!options.includeDedupFields) {
    omitList.push(...DEDUP_UPLOAD_FIELDS);
  }
  const itemData = omitFields(
    item as AppwriteEntity<QueueItem> & { localFile?: File },
    omitList
  );

  return {
    ...itemData,
    progress: Math.round(item.progress || 0),
    fileSize: item.fileSize || 0,
    result: result ? JSON.stringify(result) : undefined,
    bankResult: bankResult ? JSON.stringify(bankResult) : undefined,
  };
}

function isUnknownAttributeError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('unknown attribute') ||
    message.includes('invalid document structure') ||
    message.includes('filesha256') ||
    message.includes('isduplicate')
  );
}

export async function createUploadItem(item: QueueItem): Promise<QueueItem> {
  try {
    const { result, bankResult, id } = item;
    let dataToSave = buildUploadPayload(item, { includeDedupFields: true });

    let doc;
    try {
      doc = await withRetry(
        () =>
          databases.createDocument(
            config.databaseId,
            config.collections.uploads,
            id || ID.unique(),
            dataToSave
          ),
        'createUploadItem'
      );
    } catch (error: unknown) {
      if (!isUnknownAttributeError(error)) throw error;
      dataLogger.warn(
        '[createUploadItem] Schema sin campos dedup; reintentando sin fileSha256/isDuplicate/fiscalYearId'
      );
      dataToSave = buildUploadPayload(item, { includeDedupFields: false });
      doc = await withRetry(
        () =>
          databases.createDocument(
            config.databaseId,
            config.collections.uploads,
            id || ID.unique(),
            dataToSave
          ),
        'createUploadItemFallback'
      );
    }

    setConnectionHealth(true);
    return {
      ...doc,
      id: doc.$id,
      appwriteId: doc.$id,
      result,
      bankResult,
      fileSha256: item.fileSha256,
      isDuplicate: item.isDuplicate,
      fiscalYearId: item.fiscalYearId,
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
    return response.documents.map((doc) => {
      const uploadDoc = doc as UploadQueueDocument;
      return {
        id: uploadDoc.$id,
        appwriteId: uploadDoc.$id,
        storageFileId: uploadDoc.storageFileId,
        fileName: uploadDoc.fileName,
        mimeType: uploadDoc.mimeType,
        fileSize: uploadDoc.fileSize || 0,
        uploadType: uploadDoc.uploadType,
        status: uploadDoc.status,
        progress: uploadDoc.progress || 0,
        error: uploadDoc.error,
        timestamp: uploadDoc.timestamp,
        notificationDismissed: uploadDoc.notificationDismissed,
        needsMapping: uploadDoc.needsMapping,
        fileSha256: uploadDoc.fileSha256,
        fiscalYearId: uploadDoc.fiscalYearId,
        isDuplicate: uploadDoc.isDuplicate,
        result: uploadDoc.result && typeof uploadDoc.result === 'string'
          ? safeJsonParse<QueueItem['result']>(uploadDoc.result, 'result')
          : uploadDoc.result,
        bankResult: uploadDoc.bankResult && typeof uploadDoc.bankResult === 'string'
          ? safeJsonParse<BankTransaction[]>(uploadDoc.bankResult, 'bankResult')
          : uploadDoc.bankResult,
      };
    }) as QueueItem[];
  } catch (error: unknown) {
    if (getErrorCode(error) === 404 || getErrorCode(error) === 401) return [];
    notifyError((error instanceof Error ? error.message : String(error)), 'getUploadQueue');
    setConnectionHealth(false);
    throw error;
  }
}

export async function updateUploadItem(item: QueueItem): Promise<QueueItem> {
  try {
    const { result, bankResult, id, appwriteId } = item;
    const docId = appwriteId || id;
    let dataToSave = buildUploadPayload(item, { includeDedupFields: true });

    let doc;
    try {
      doc = await withRetry(
        () =>
          databases.updateDocument(
            config.databaseId,
            config.collections.uploads,
            docId,
            dataToSave
          ),
        'updateUploadItem'
      );
    } catch (error: unknown) {
      if (!isUnknownAttributeError(error)) throw error;
      dataLogger.warn(
        '[updateUploadItem] Schema sin campos dedup; reintentando sin fileSha256/isDuplicate/fiscalYearId'
      );
      dataToSave = buildUploadPayload(item, { includeDedupFields: false });
      doc = await withRetry(
        () =>
          databases.updateDocument(
            config.databaseId,
            config.collections.uploads,
            docId,
            dataToSave
          ),
        'updateUploadItemFallback'
      );
    }

    setConnectionHealth(true);
    return {
      ...doc,
      id: doc.$id,
      appwriteId: doc.$id,
      result,
      bankResult,
      fileSha256: item.fileSha256,
      isDuplicate: item.isDuplicate,
      fiscalYearId: item.fiscalYearId,
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
      } catch (storageError: unknown) {
        if (getErrorCode(storageError) !== 404) {
          console.warn(`[deleteUploadItem] Error eliminando archivo de Storage:`, getErrorMessage(storageError));
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
      response.documents.map(async (doc) => {
        const uploadDoc = doc as UploadQueueDocument;
        try {
          if (uploadDoc.storageFileId) {
            try {
              await storage.deleteFile(config.bucketId, uploadDoc.storageFileId);
            } catch (storageError: unknown) {
              if (getErrorCode(storageError) !== 404) {
                console.warn(`[deleteCompletedUploads] Error eliminando archivo:`, getErrorMessage(storageError));
              }
            }
          }

          await withRetry(
            () => databases.deleteDocument(config.databaseId, config.collections.uploads, uploadDoc.$id),
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
