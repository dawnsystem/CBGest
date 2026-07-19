import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // Prefer VITE_* (Vite/client); fallback a nombres sin prefijo (secrets Cloud legacy).
    const geminiKey =
      env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || env.API_KEY || '';
    const groqKey = env.VITE_GROQ_API_KEY || env.GROQ_API_KEY || '';
    const openrouterKey =
      env.VITE_OPENROUTER_API_KEY || env.OPENROUTER_API_KEY || '';
    const openrouterModel =
      env.VITE_OPENROUTER_MODEL ||
      env.OPENROUTER_MODEL ||
      'qwen/qwen2.5-vl-72b-instruct:free';

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: ['.tail1c095e.ts.net'],
        // Prevent browser caching of all served files during development
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      },
      preview: {
        port: 4173,
        host: '0.0.0.0',
        // Prevent browser caching of all served files during production preview
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(geminiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey),
        'process.env.GROQ_API_KEY': JSON.stringify(groqKey),
        'process.env.OPENROUTER_API_KEY': JSON.stringify(openrouterKey),
        'process.env.OPENROUTER_MODEL': JSON.stringify(openrouterModel),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      optimizeDeps: {
        include: ['pdfjs-dist']
      },
      build: {
        // Optimize chunk splitting for better caching and loading
        rollupOptions: {
          output: {
            manualChunks: {
              // Separate vendor chunks for better caching
              'vendor-react': ['react', 'react-dom', 'react-router-dom'],
              'vendor-charts': ['recharts'],
              'vendor-icons': ['lucide-react'],
              // Keep heavy libs separate
              'vendor-pdf': ['pdfjs-dist'],
            },
            // Ensure consistent chunk naming for caching
            chunkFileNames: 'assets/[name]-[hash].js',
            entryFileNames: 'assets/[name]-[hash].js',
            assetFileNames: 'assets/[name]-[hash].[ext]',
          },
        },
        // Improve initial load by inlining small assets
        assetsInlineLimit: 4096,
        // Enable CSS code splitting
        cssCodeSplit: true,
        // Generate source maps for production debugging (optional)
        sourcemap: false,
        // Minify for smaller bundles
        minify: 'esbuild',
        // Target modern browsers for smaller bundles
        target: 'es2020',
      },
      // Preload critical modules
      experimental: {
        renderBuiltUrl(filename, { hostType }) {
          // Add preload hints for critical chunks
          return filename;
        },
      },
    };
});
