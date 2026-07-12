/**
 * @fileoverview Servicio de historial de coincidencias IA para Appwrite
 */

import { Query, ID } from 'appwrite';
import { databases, config } from '../../lib/appwrite/client';
import {
  AppwriteEntity,
  omitFields,
  withRetry,
  notifyError,
  setConnectionHealth,
  getErrorCode,
} from './infrastructure';
import type { AIMatchHistory } from '../../types';

type AIMatchDocument = AppwriteEntity<AIMatchHistory> & { $id: string };

export async function createAIMatchHistory(match: AIMatchHistory): Promise<AIMatchHistory> {
  try {
    const { id } = match;
    const matchData = omitFields(match as AppwriteEntity<AIMatchHistory>, [
      'id',
      'appwriteId',
      'createdAt',
      'lastUsedAt',
      '$id',
      '$createdAt',
      '$updatedAt',
      '$databaseId',
      '$collectionId',
      '$permissions',
    ]);

    const doc = await withRetry(
      () => databases.createDocument(
        config.databaseId,
        config.collections.aiMatchHistory,
        id || ID.unique(),
        matchData
      ),
      'createAIMatchHistory'
    );

    setConnectionHealth(true);
    return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as AIMatchHistory;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'createAIMatchHistory');
    setConnectionHealth(false);
    throw error;
  }
}

export async function getAIMatchHistory(): Promise<AIMatchHistory[]> {
  try {
    const response = await withRetry(
      () => databases.listDocuments(
        config.databaseId,
        config.collections.aiMatchHistory,
        [Query.orderDesc('usageCount'), Query.limit(1000)]
      ),
      'getAIMatchHistory'
    );

    setConnectionHealth(true);
    return response.documents.map((doc) => {
      const matchDoc = doc as AIMatchDocument;
      return {
        ...matchDoc,
        id: matchDoc.$id,
        appwriteId: matchDoc.$id
      };
    }) as AIMatchHistory[];
  } catch (error: unknown) {
    if (getErrorCode(error) === 404) return [];
    notifyError((error instanceof Error ? error.message : String(error)), 'getAIMatchHistory');
    setConnectionHealth(false);
    throw error;
  }
}

export async function updateAIMatchHistory(match: AIMatchHistory): Promise<AIMatchHistory> {
  try {
    const { id, appwriteId } = match;
    const matchData = omitFields(match as AppwriteEntity<AIMatchHistory>, [
      'id',
      'appwriteId',
      'createdAt',
      'lastUsedAt',
      '$id',
      '$createdAt',
      '$updatedAt',
      '$databaseId',
      '$collectionId',
      '$permissions',
    ]);
    const docId = appwriteId || id;

    const doc = await withRetry(
      () => databases.updateDocument(
        config.databaseId,
        config.collections.aiMatchHistory,
        docId,
        matchData
      ),
      'updateAIMatchHistory'
    );

    setConnectionHealth(true);
    return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as AIMatchHistory;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'updateAIMatchHistory');
    setConnectionHealth(false);
    throw error;
  }
}

export async function deleteAIMatchHistory(id: string): Promise<void> {
  try {
    await withRetry(
      () => databases.deleteDocument(config.databaseId, config.collections.aiMatchHistory, id),
      'deleteAIMatchHistory'
    );
    setConnectionHealth(true);
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'deleteAIMatchHistory');
    setConnectionHealth(false);
    throw error;
  }
}

export async function findMatchByBankConcept(concept: string): Promise<AIMatchHistory | null> {
  try {
    const response = await databases.listDocuments(
      config.databaseId,
      config.collections.aiMatchHistory,
      [
        Query.search('bankConcept', concept),
        Query.orderDesc('usageCount'),
        Query.limit(1)
      ]
    );

    if (response.documents.length > 0) {
      const doc = response.documents[0] as AIMatchDocument;
      return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as AIMatchHistory;
    }
    return null;
  } catch (error: unknown) {
    if (getErrorCode(error) === 404) return null;
    console.error('Find match by bank concept error:', error);
    return null;
  }
}
