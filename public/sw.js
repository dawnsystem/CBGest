/**
 * CBGest Service Worker
 *
 * Estrategia:
 * - index.html → Network-first (fresco con red, fallback a caché si está offline)
 * - Assets con hash (/assets/*) → Cache-first con fallback a red (inmutables por diseño)
 * - Resto → Network-first con fallback a caché offline
 *
 * Esta estrategia resuelve el problema de cambios que no aparecen en móvil:
 * el SW intercepta la petición de index.html y fuerza siempre la versión de red.
 */

const CACHE_VERSION = 'cbgest-v1';
const ASSETS_CACHE = `${CACHE_VERSION}-assets`;

// Recursos críticos a pre-cachear en la instalación
const PRECACHE_URLS = ['/'];

// ── Instalación ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ASSETS_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Activa el SW inmediatamente sin esperar a que cierren las pestañas abiertas
  self.skipWaiting();
});

// ── Activación (limpia cachés antiguas) ──────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('cbgest-') && key !== ASSETS_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Toma el control de las pestañas ya abiertas sin necesidad de recargar
  self.clients.claim();
});

// ── Fetch: lógica de caché por tipo de recurso ───────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo manejamos peticiones del mismo origen
  if (url.origin !== self.location.origin) return;
  // No interceptar métodos no idempotentes
  if (request.method !== 'GET') return;

  // 1. index.html y rutas SPA → Network-first (con fallback a caché offline)
  //    Detectamos navegación HTML comprobando la extensión: si no tiene extensión
  //    de fichero estático (js, css, png, etc.) asumimos que es una ruta SPA.
  const hasSafeStaticExtension = /\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|json|webmanifest|map)$/i.test(url.pathname);
  if (!hasSafeStaticExtension) {
    event.respondWith(networkFirst(request, { bypassHttpCache: true }));
    return;
  }

  // 2. Assets hasheados (/assets/*) → Cache-first (son inmutables)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 3. Resto (imágenes, iconos, manifest) → Network-first con fallback
  event.respondWith(networkFirst(request));
});

// ── Estrategias de fetch ─────────────────────────────────────

/**
 * Network-first: intenta la red; si falla, sirve desde caché.
 * Garantiza contenido fresco cuando hay conexión.
 */
async function networkFirst(request, options = {}) {
  const { bypassHttpCache = false } = options;
  try {
    const networkRequest = bypassHttpCache ? new Request(request, { cache: 'no-store' }) : request;
    const networkResponse = await fetch(networkRequest);
    // Cachea la respuesta fresca para uso offline futuro
    if (networkResponse.ok) {
      try {
        const cache = await caches.open(ASSETS_CACHE);
        await cache.put(request, networkResponse.clone());
      } catch {
        // Ignora errores de almacenamiento y entrega la respuesta de red
      }
    }
    return networkResponse;
  } catch {
    // Sin conexión: sirve desde caché si existe
    const cached = await caches.match(request);
    return cached || new Response('Sin conexión', { status: 503 });
  }
}

/**
 * Cache-first: sirve desde caché si existe; si no, descarga y cachea.
 * Óptimo para assets con hash (nunca cambian una vez publicados).
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(ASSETS_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return new Response('Asset no disponible offline', { status: 503 });
  }
}
