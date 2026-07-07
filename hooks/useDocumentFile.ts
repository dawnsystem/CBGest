/**
 * @fileoverview Hook for resolving a viewable File from either a direct File prop
 *               or an Appwrite Storage fileId — DEBT-007 split of DocumentViewer.
 *
 * Responsibilities:
 *   - Downloads the file from Appwrite Storage when `appwriteFileId` is provided
 *   - Returns the effective File object and loading/error state
 *   - Cleans up nothing (caller holds the objectUrl lifecycle)
 */

import { useState, useEffect } from 'react';
import { storageService } from '../services/appwriteService';

export interface UseDocumentFileOptions {
  /** Direct File object (legacy path) */
  file?: File;
  /** Appwrite Storage file ID */
  appwriteFileId?: string;
  /** MIME type hint for the downloaded file */
  mimeType?: string;
  /** Human-readable file name for the downloaded File object */
  title?: string;
  /** Whether the viewer is currently open — avoids downloading when closed */
  isOpen: boolean;
}

export interface UseDocumentFileResult {
  /** The resolved File to render, or null while loading */
  effectiveFile: File | null;
  /** True while the file is being fetched from Storage */
  isDownloading: boolean;
  /** Error message if the download failed, otherwise null */
  downloadError: string | null;
}

export function useDocumentFile({
  file,
  appwriteFileId,
  mimeType,
  title,
  isOpen,
}: UseDocumentFileOptions): UseDocumentFileResult {
  const [downloadedFile, setDownloadedFile] = useState<File | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (!appwriteFileId) {
      setDownloadedFile(null);
      return;
    }

    let cancelled = false;

    const downloadFile = async () => {
      setIsDownloading(true);
      setDownloadError(null);
      try {
        const blob = await storageService.downloadFile(appwriteFileId);
        if (cancelled) return;
        const resolvedMimeType = mimeType || blob.type || 'application/octet-stream';
        setDownloadedFile(new File([blob], title || 'document', { type: resolvedMimeType }));
      } catch (error) {
        if (cancelled) return;
        console.error('Error downloading file from Storage:', error);
        setDownloadError('Error al descargar el archivo');
      } finally {
        if (!cancelled) setIsDownloading(false);
      }
    };

    downloadFile();

    return () => { cancelled = true; };
  }, [appwriteFileId, isOpen, mimeType, title]);

  return {
    effectiveFile: file ?? downloadedFile,
    isDownloading,
    downloadError,
  };
}
