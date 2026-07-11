/**
 * @fileoverview Servicio de almacenamiento de archivos para Appwrite
 */

import { ID } from 'appwrite';
import { storage, config } from '../../lib/appwrite/client';
import { authService } from '../authService';

export const storageService = {
  async uploadFile(file: File, id?: string): Promise<string> {
    try {
      const uploadedFile = await storage.createFile(config.bucketId, id || ID.unique(), file);
      return uploadedFile.$id;
    } catch (error: unknown) {
      console.error('Upload file error:', error);
      throw error;
    }
  },

  getFileUrl(fileId: string): string {
    return `${import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1'}/storage/buckets/${config.bucketId}/files/${fileId}/view`;
  },

  async downloadFile(fileId: string): Promise<Blob> {
    try {
      const downloadUrl = storage.getFileDownload(config.bucketId, fileId);

      // First attempt: use credentials (cookies)
      let response = await fetch(downloadUrl, {
        credentials: 'include',
        headers: {
          'X-Appwrite-Project': config.projectId,
        }
      });

      // If 401, try with JWT authentication
      if (response.status === 401) {
        console.log('[StorageService] Cookie auth failed, trying JWT...');
        const jwt = await authService.createJWT();

        if (jwt) {
          const baseUrl = `${config.endpoint}/storage/buckets/${config.bucketId}/files/${fileId}/download`;
          response = await fetch(baseUrl, {
            headers: {
              'X-Appwrite-Project': config.projectId,
              'X-Appwrite-JWT': jwt,
            }
          });
        }
      }

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }

      return await response.blob();
    } catch (error: unknown) {
      console.error('Download file error:', error);
      throw error;
    }
  },

  async deleteFile(fileId: string): Promise<void> {
    try {
      await storage.deleteFile(config.bucketId, fileId);
    } catch (error: unknown) {
      console.error('Delete file error:', error);
      throw error;
    }
  }
};
