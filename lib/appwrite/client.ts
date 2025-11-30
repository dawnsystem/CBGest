/**
 * @fileoverview Cliente Appwrite - Punto único de instancias
 * @description Este módulo exporta las instancias singleton del SDK de Appwrite.
 *              Se inicializan automáticamente al importar el módulo.
 *              NO HAY función initialize() - evita múltiples inicializaciones.
 *
 * @example
 * import { account, databases, storage } from '@/lib/appwrite/client';
 * const user = await account.get();
 */

import { Client, Account, Databases, Storage } from 'appwrite';
import { APPWRITE_CONFIG } from '../../config/appwrite';

// ============================================================================
// CLIENTE SINGLETON
// ============================================================================

/**
 * Cliente Appwrite configurado con endpoint y proyecto.
 * Se crea una única vez al importar este módulo.
 */
const client = new Client()
  .setEndpoint(APPWRITE_CONFIG.endpoint)
  .setProject(APPWRITE_CONFIG.projectId);

// ============================================================================
// INSTANCIAS DE SERVICIOS
// ============================================================================

/**
 * Servicio de autenticación de Appwrite.
 * Usado para: login, logout, register, getCurrentUser, sessions.
 */
const account = new Account(client);

/**
 * Servicio de base de datos de Appwrite.
 * Usado para: CRUD de documentos en todas las colecciones.
 */
const databases = new Databases(client);

/**
 * Servicio de almacenamiento de Appwrite.
 * Usado para: upload, download, delete de archivos.
 */
const storage = new Storage(client);

// ============================================================================
// CONFIGURACIÓN EXPORTADA
// ============================================================================

/**
 * IDs de configuración para operaciones de base de datos.
 * Evita tener que importar APPWRITE_CONFIG en cada archivo.
 */
const config = {
  projectId: APPWRITE_CONFIG.projectId,
  endpoint: APPWRITE_CONFIG.endpoint,
  databaseId: APPWRITE_CONFIG.databaseId,
  bucketId: APPWRITE_CONFIG.bucketId,
  collections: APPWRITE_CONFIG.collections,
} as const;

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Verifica si el cliente está correctamente configurado.
 * Útil para debugging.
 */
const isConfigured = (): boolean => {
  return !!(
    APPWRITE_CONFIG.endpoint &&
    APPWRITE_CONFIG.projectId &&
    APPWRITE_CONFIG.databaseId
  );
};

/**
 * Obtiene información del cliente para debugging.
 * NO expone datos sensibles.
 */
const getClientInfo = () => ({
  endpoint: APPWRITE_CONFIG.endpoint,
  projectId: APPWRITE_CONFIG.projectId,
  isConfigured: isConfigured(),
});

// Log de inicialización (solo en desarrollo)
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  console.log('🔧 Appwrite client initialized:', APPWRITE_CONFIG.endpoint);
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  client,
  account,
  databases,
  storage,
  config,
  isConfigured,
  getClientInfo,
};

// Export por defecto para conveniencia
export default {
  client,
  account,
  databases,
  storage,
  config,
};
