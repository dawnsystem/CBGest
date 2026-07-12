/**
 * @fileoverview Servicio de notificaciones para Appwrite
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
import type { Notification } from '../../types';

type NotificationDocument = AppwriteEntity<Notification> & { $id: string };

export async function createNotification(notification: Notification): Promise<Notification> {
  try {
    const { id } = notification;
    const notificationData = omitFields(notification as AppwriteEntity<Notification>, [
      'id',
      'appwriteId',
      'createdAt',
      'updatedAt',
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
        config.collections.notifications,
        id || ID.unique(),
        notificationData
      ),
      'createNotification'
    );

    setConnectionHealth(true);
    return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as Notification;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'createNotification');
    setConnectionHealth(false);
    throw error;
  }
}

export async function getNotifications(): Promise<Notification[]> {
  try {
    if (!config.collections.notifications) return [];

    const response = await withRetry(
      () => databases.listDocuments(
        config.databaseId,
        config.collections.notifications,
        [Query.orderDesc('timestamp'), Query.limit(100)]
      ),
      'getNotifications'
    );

    setConnectionHealth(true);
    return response.documents.map((doc) => {
      const notificationDoc = doc as NotificationDocument;
      return {
        ...notificationDoc,
        id: notificationDoc.$id,
        appwriteId: notificationDoc.$id
      };
    }) as Notification[];
  } catch (error: unknown) {
    if (getErrorCode(error) === 404 || getErrorCode(error) === 401) return [];
    notifyError((error instanceof Error ? error.message : String(error)), 'getNotifications');
    setConnectionHealth(false);
    throw error;
  }
}

export async function updateNotification(notification: Notification): Promise<Notification> {
  try {
    const { id, appwriteId } = notification;
    const notificationData = omitFields(notification as AppwriteEntity<Notification>, [
      'id',
      'appwriteId',
      'createdAt',
      'updatedAt',
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
        config.collections.notifications,
        docId,
        notificationData
      ),
      'updateNotification'
    );

    setConnectionHealth(true);
    return { ...doc, id: doc.$id, appwriteId: doc.$id } as unknown as Notification;
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'updateNotification');
    setConnectionHealth(false);
    throw error;
  }
}

export async function deleteNotification(id: string): Promise<void> {
  try {
    await withRetry(
      () => databases.deleteDocument(config.databaseId, config.collections.notifications, id),
      'deleteNotification'
    );
    setConnectionHealth(true);
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'deleteNotification');
    setConnectionHealth(false);
    throw error;
  }
}

export async function deleteAllNotifications(): Promise<void> {
  try {
    const response = await withRetry(
      () => databases.listDocuments(
        config.databaseId,
        config.collections.notifications,
        [Query.limit(100)]
      ),
      'listNotificationsForDelete'
    );

    await Promise.all(
      response.documents.map(doc =>
        withRetry(
          () => databases.deleteDocument(config.databaseId, config.collections.notifications, doc.$id),
          'deleteNotificationBatch'
        )
      )
    );
    setConnectionHealth(true);
  } catch (error: unknown) {
    notifyError((error instanceof Error ? error.message : String(error)), 'deleteAllNotifications');
    setConnectionHealth(false);
    throw error;
  }
}
