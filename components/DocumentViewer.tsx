import React, { useEffect, useState, useRef } from 'react';
import { X, Download, ExternalLink, FileText, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

// Declaración global para TypeScript ya que usamos CDN
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

interface DocumentViewerProps {
  file?: File;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ file, isOpen, onClose, title }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  
  // PDF State
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Reference to keep track of the active render task to cancel it if needed
  const renderTaskRef = useRef<any>(null);

  // 1. Initialize Object URL
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setObjectUrl(url);
      setIsPdf(file.type === 'application/pdf');
      
      // Reset PDF state
      setPdfDoc(null);
      setPageNum(1);
      setNumPages(0);
      setRenderError(null);
      
      // Cancel any pending task from previous file
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  // 2. Load PDF Document
  useEffect(() => {
    if (isPdf && objectUrl && window.pdfjsLib) {
      setIsRendering(true);
      const loadingTask = window.pdfjsLib.getDocument(objectUrl);
      
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

  // 3. Render PDF Page (with Cancellation Logic)
  useEffect(() => {
    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current) return;
      
      // CANCEL PREVIOUS TASK if it exists
      if (renderTaskRef.current) {
        try {
            await renderTaskRef.current.cancel();
        } catch (e) {
            // Cancellation is expected, ignore error
        }
      }

      setIsRendering(true);
      try {
        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        
        if (!context) throw new Error("Canvas context not found");

        // Responsive scaling
        const viewport = page.getViewport({ scale: 1.5 });

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };

        // Store the task reference
        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        
        // Success
        setIsRendering(false);
        setRenderError(null);
      } catch (err: any) {
        if (err.name === 'RenderingCancelledException') {
            // This is expected when page changes quickly, do nothing
            return;
        }
        console.error("Page render error:", err);
        setRenderError("Error al visualizar la página.");
        setIsRendering(false);
      }
    };

    renderPage();
    
    // Cleanup on unmount or dependency change
    return () => {
        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
        }
    };
  }, [pdfDoc, pageNum]);

  if (!isOpen || !file || !objectUrl) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/95 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-slate-900 w-full max-w-5xl h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in-up border border-slate-800">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-3 text-white">
            <div className="bg-blue-900/50 p-2 rounded-lg">
               <FileText className="w-5 h-5 text-blue-400" />
            </div>
            <div className="overflow-hidden">
                <h3 className="text-sm font-medium text-white max-w-[150px] md:max-w-md truncate">{title || file.name}</h3>
                <p className="text-xs text-slate-300">{file.type} • {(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a 
                href={objectUrl} 
                download={file.name}
                className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                title="Descargar original"
            >
                <Download className="w-5 h-5" />
            </a>
            <button 
                onClick={onClose}
                className="p-2 text-slate-300 hover:text-white hover:bg-red-500/20 rounded-lg transition-colors ml-1"
            >
                <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Viewer Body */}
        <div className="flex-1 bg-slate-950 relative flex items-center justify-center overflow-auto p-4">
           {isRendering && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 z-10">
               <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-2" />
               <span className="text-slate-200 text-sm">Renderizando documento...</span>
             </div>
           )}

           {isPdf ? (
               renderError ? (
                 <div className="text-center text-slate-300 max-w-sm">
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
                    className="shadow-2xl max-w-full h-auto bg-white"
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

        {/* PDF Controls (Footer) */}
        {isPdf && numPages > 1 && (
          <div className="bg-slate-800 border-t border-slate-700 px-4 py-3 flex justify-center items-center gap-4 shrink-0">
             <button 
               onClick={() => setPageNum(p => Math.max(1, p - 1))}
               disabled={pageNum <= 1}
               className="p-1 text-slate-300 hover:text-white disabled:opacity-30"
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
             >
               <ChevronRight className="w-6 h-6" />
             </button>
          </div>
        )}
      </div>
    </div>
  );
};