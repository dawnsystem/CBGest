import React, { useEffect, useState, useRef, useCallback } from 'react';
import { X, Download, FileText, ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut, Maximize, ArrowLeftRight } from 'lucide-react';
import { pdfjsLib } from '../utils/pdfLoader';
import { storageService } from '../services/appwriteService';

declare global {
  interface Window {
    pdfjsLib: any;
  }
}

type FitMode = 'page' | 'width' | 'custom';

interface DocumentViewerProps {
  /** File object directo (legacy) */
  file?: File;
  /** ID del archivo en Appwrite Storage */
  appwriteFileId?: string;
  /** Tipo MIME del archivo (necesario si se usa appwriteFileId) */
  mimeType?: string;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ 
  file, 
  appwriteFileId, 
  mimeType, 
  isOpen, 
  onClose, 
  title 
}) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadedFile, setDownloadedFile] = useState<File | null>(null);

  // PDF State
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Zoom State
  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState<FitMode>('page');
  const [baseViewport, setBaseViewport] = useState<{ width: number; height: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);

  // Zoom controls
  const ZOOM_STEP = 0.25;
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 4;

  const handleZoomIn = () => {
    setFitMode('custom');
    setScale(prev => Math.min(MAX_ZOOM, prev + ZOOM_STEP));
  };

  const handleZoomOut = () => {
    setFitMode('custom');
    setScale(prev => Math.max(MIN_ZOOM, prev - ZOOM_STEP));
  };

  const handleFitPage = useCallback(() => {
    setFitMode('page');
    if (baseViewport && containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 32;
      const containerHeight = containerRef.current.clientHeight - 32;
      const scaleX = containerWidth / baseViewport.width;
      const scaleY = containerHeight / baseViewport.height;
      setScale(Math.min(scaleX, scaleY));
    }
  }, [baseViewport]);

  const handleFitWidth = useCallback(() => {
    setFitMode('width');
    if (baseViewport && containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 32;
      setScale(containerWidth / baseViewport.width);
    }
  }, [baseViewport]);

  // Download file from Storage if appwriteFileId is provided
  useEffect(() => {
    if (!isOpen) return;
    if (!appwriteFileId) {
      setDownloadedFile(null);
      return;
    }

    const downloadFile = async () => {
      setIsDownloading(true);
      setRenderError(null);
      try {
        const blob = await storageService.downloadFile(appwriteFileId);
        const downloadedMimeType = mimeType || blob.type || 'application/octet-stream';
        const downloadedFileObj = new File([blob], title || 'document', { type: downloadedMimeType });
        setDownloadedFile(downloadedFileObj);
      } catch (error) {
        console.error('Error downloading file from Storage:', error);
        setRenderError('Error al descargar el archivo');
      } finally {
        setIsDownloading(false);
      }
    };

    downloadFile();
  }, [appwriteFileId, isOpen, mimeType, title]);

  // Determine which file to use (direct file or downloaded)
  const effectiveFile = file || downloadedFile;

  // Initialize Object URL
  useEffect(() => {
    if (effectiveFile) {
      const url = URL.createObjectURL(effectiveFile);
      setObjectUrl(url);
      setIsPdf(effectiveFile.type === 'application/pdf');

      // Reset PDF state
      setPdfDoc(null);
      setPageNum(1);
      setNumPages(0);
      setRenderError(null);
      setScale(1);
      setFitMode('page');
      setBaseViewport(null);

      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      return () => URL.revokeObjectURL(url);
    }
  }, [effectiveFile]);

  // Load PDF Document
  useEffect(() => {
    if (isPdf && objectUrl && pdfjsLib) {
      setIsRendering(true);
      const loadingTask = pdfjsLib.getDocument(objectUrl);

      loadingTask.promise.then((pdf: any) => {
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setIsRendering(false);
      }).catch((error: any) => {
        console.error("Error loading PDF:", error);
        setRenderError("No se pudo cargar el PDF. Puede estar dañado.");
        setIsRendering(false);
      });
    }
  }, [isPdf, objectUrl]);

  // Calculate initial scale when PDF loads
  useEffect(() => {
    const calculateInitialScale = async () => {
      if (!pdfDoc || !containerRef.current) return;

      try {
        const page = await pdfDoc.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        setBaseViewport({ width: viewport.width, height: viewport.height });

        const containerWidth = containerRef.current.clientWidth - 32;
        const containerHeight = containerRef.current.clientHeight - 32;

        const scaleX = containerWidth / viewport.width;
        const scaleY = containerHeight / viewport.height;
        setScale(Math.min(scaleX, scaleY));
      } catch (err) {
        console.error("Error calculating initial scale:", err);
      }
    };

    calculateInitialScale();
  }, [pdfDoc]);

  // Render PDF Page
  useEffect(() => {
    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

      if (renderTaskRef.current) {
        try {
          await renderTaskRef.current.cancel();
        } catch (e) {
          // Cancellation is expected
        }
      }

      setIsRendering(true);
      try {
        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (!context) throw new Error("Canvas context not found");

        // Use the current scale
        const scaledViewport = page.getViewport({ scale });

        // Set canvas dimensions based on device pixel ratio for sharper rendering
        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = scaledViewport.width * pixelRatio;
        canvas.height = scaledViewport.height * pixelRatio;
        canvas.style.width = `${scaledViewport.width}px`;
        canvas.style.height = `${scaledViewport.height}px`;

        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        const renderContext = {
          canvasContext: context,
          viewport: scaledViewport
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;

        setIsRendering(false);
        setRenderError(null);
      } catch (err: any) {
        if (err.name === 'RenderingCancelledException') {
          return;
        }
        console.error("Page render error:", err);
        setRenderError("Error al visualizar la página.");
        setIsRendering(false);
      }
    };

    renderPage();

    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, pageNum, scale]);

  // Recalculate scale on window resize for fit modes
  useEffect(() => {
    const handleResize = () => {
      if (fitMode === 'page') {
        handleFitPage();
      } else if (fitMode === 'width') {
        handleFitWidth();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fitMode, handleFitPage, handleFitWidth]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === 'ArrowLeft' && numPages > 1) {
        e.preventDefault();
        setPageNum(p => Math.max(1, p - 1));
      } else if (e.key === 'ArrowRight' && numPages > 1) {
        e.preventDefault();
        setPageNum(p => Math.min(numPages, p + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, numPages]);

  // Show loading state while downloading
  if (isOpen && appwriteFileId && isDownloading) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-slate-800 p-8 rounded-xl text-center">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-white">Descargando documento...</p>
        </div>
      </div>
    );
  }

  if (!isOpen || (!effectiveFile && !renderError) || (!objectUrl && !renderError)) return null;

  const zoomPercentage = Math.round(scale * 100);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/95 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-slate-900 w-full max-w-6xl h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in-up border border-slate-800">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-3 text-white">
            <div className="bg-blue-900/50 p-2 rounded-lg">
              <FileText className="w-5 h-5 text-blue-400" />
            </div>
            <div className="overflow-hidden">
              <h3 className="text-sm font-medium text-white max-w-[150px] md:max-w-md truncate">{title || effectiveFile?.name || 'Documento'}</h3>
              <p className="text-xs text-slate-300">{effectiveFile?.type || mimeType || 'Archivo'} • {effectiveFile ? `${(effectiveFile.size / 1024).toFixed(1)} KB` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {objectUrl && (
              <a
                href={objectUrl}
                download={effectiveFile?.name || title || 'document'}
                className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                title="Descargar original"
              >
                <Download className="w-5 h-5" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-300 hover:text-white hover:bg-red-500/20 rounded-lg transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Zoom Controls Bar (for PDFs) */}
        {isPdf && !renderError && (
          <div className="bg-slate-800/80 border-b border-slate-700 px-4 py-2 flex items-center justify-center gap-2 shrink-0">
            <button
              onClick={handleZoomOut}
              disabled={scale <= MIN_ZOOM}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Alejar (tecla -)"
            >
              <ZoomOut className="w-5 h-5" />
            </button>

            <span className="text-sm text-slate-200 font-mono w-16 text-center">
              {zoomPercentage}%
            </span>

            <button
              onClick={handleZoomIn}
              disabled={scale >= MAX_ZOOM}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Acercar (tecla +)"
            >
              <ZoomIn className="w-5 h-5" />
            </button>

            <div className="w-px h-6 bg-slate-600 mx-2" />

            <button
              onClick={handleFitPage}
              className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1.5 transition-colors ${
                fitMode === 'page'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
              title="Ajustar a página"
            >
              <Maximize className="w-4 h-4" />
              <span className="hidden sm:inline">Página</span>
            </button>

            <button
              onClick={handleFitWidth}
              className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1.5 transition-colors ${
                fitMode === 'width'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
              title="Ajustar al ancho"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span className="hidden sm:inline">Ancho</span>
            </button>
          </div>
        )}

        {/* Viewer Body */}
        <div ref={containerRef} className="flex-1 bg-slate-950 relative flex items-start justify-center overflow-auto p-4">
          {isRendering && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 z-10">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-2" />
              <span className="text-slate-200 text-sm">Renderizando documento...</span>
            </div>
          )}

          {isPdf ? (
            renderError ? (
              <div className="text-center text-slate-300 max-w-sm m-auto">
                <p className="text-red-400 mb-2 font-medium">Error de visualización</p>
                <p className="text-sm mb-4">{renderError}</p>
                <a
                  href={objectUrl}
                  download={file.name}
                  className="inline-flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-slate-700"
                >
                  <Download className="w-4 h-4" /> Descargar para ver
                </a>
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                className="shadow-2xl bg-white"
                style={{ maxWidth: fitMode === 'page' ? '100%' : 'none' }}
              />
            )
          ) : (
            <img
              src={objectUrl}
              alt="Vista previa"
              className="max-w-full max-h-full object-contain shadow-2xl bg-white/5"
            />
          )}
        </div>

        {/* PDF Page Controls (Footer) */}
        {isPdf && numPages > 1 && (
          <div className="bg-slate-800 border-t border-slate-700 px-4 py-3 flex justify-center items-center gap-4 shrink-0">
            <button
              onClick={() => setPageNum(p => Math.max(1, p - 1))}
              disabled={pageNum <= 1}
              className="p-1 text-slate-300 hover:text-white disabled:opacity-30"
              title="Página anterior (tecla ←)"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <span className="text-sm text-slate-200 font-mono">
              Página {pageNum} de {numPages}
            </span>
            <button
              onClick={() => setPageNum(p => Math.min(numPages, p + 1))}
              disabled={pageNum >= numPages}
              className="p-1 text-slate-300 hover:text-white disabled:opacity-30"
              title="Página siguiente (tecla →)"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
