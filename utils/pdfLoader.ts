/**
 * PDF.js loader utility
 * Loads pdfjs-dist locally to avoid Tracking Prevention issues with CDN
 */
import * as pdfjsLib from 'pdfjs-dist';

// Configure worker for pdfjs-dist v5
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// Export the library
export { pdfjsLib };

// Make it available globally for compatibility
if (typeof window !== 'undefined') {
  (window as typeof globalThis & { pdfjsLib: typeof pdfjsLib }).pdfjsLib = pdfjsLib;
}
