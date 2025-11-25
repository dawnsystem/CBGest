/**
 * @fileoverview Servicio de Autenticación
 * @description Gestiona todas las operaciones de autenticación con Appwrite.
 *              Separado del servicio de base de datos para mejor organización.
 *
 * @example
 * import { authService } from '@/services/authService';
 * const user = await authService.login(email, password);
 */

import { ID, AppwriteException } from 'appwrite';
import { account } from '../lib/appwrite/client';
import type { AppUser } from '../types';

// ============================================================================
// TIPOS
// ============================================================================

/**
 * Estados posibles de autenticación
 */
export type AuthState =
  | 'INITIALIZING'     // Verificando sesión existente al cargar
  | 'UNAUTHENTICATED'  // Sin sesión activa
  | 'AUTHENTICATING'   // Login/Register en progreso
  | 'AUTHENTICATED'    // Sesión activa y verificada
  | 'SESSION_EXPIRED'  // Sesión expiró (401 en operación)
  | 'ERROR';           // Error de autenticación

/**
 * Resultado de operación de autenticación
 */
export interface AuthResult {
  success: boolean;
  user: AppUser | null;
  error?: string;
  errorCode?: number;
}

/**
 * Información de sesión
 */
export interface SessionInfo {
  sessionId: string;
  userId: string;
  provider: string;
  expire: string;
  current: boolean;
}

// ============================================================================
// CONSTANTES
// ============================================================================

/** Delay para estabilización de sesión después de login (ms) */
const SESSION_STABILIZATION_DELAY = 150;

/** Códigos de error que indican sesión inválida */
const SESSION_INVALID_CODES = [401, 403];

/** Códigos de error que NO deben reintentarse */
const NON_RETRYABLE_CODES = [401, 403, 404, 409, 429];

// ============================================================================
// CALLBACKS PARA EVENTOS
// ============================================================================

type SessionReadyCallback = () => void;
type SessionExpiredCallback = () => void;
type AuthErrorCallback = (error: string, code?: number) => void;

let onSessionReady: SessionReadyCallback | null = null;
let onSessionExpired: SessionExpiredCallback | null = null;
let onAuthError: AuthErrorCallback | null = null;

/**
 * Configura callbacks para eventos de autenticación
 */
export const setAuthCallbacks = (callbacks: {
  onSessionReady?: SessionReadyCallback;
  onSessionExpired?: SessionExpiredCallback;
  onAuthError?: AuthErrorCallback;
}) => {
  onSessionReady = callbacks.onSessionReady || null;
  onSessionExpired = callbacks.onSessionExpired || null;
  onAuthError = callbacks.onAuthError || null;
};

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Espera un tiempo determinado (para estabilización de sesión)
 */
const wait = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Extrae mensaje de error legible
 */
const getErrorMessage = (error: unknown): string => {
  if (error instanceof AppwriteException) {
    // Mensajes específicos para errores comunes
    switch (error.code) {
      case 401:
        return 'Credenciales incorrectas o sesión expirada';
      case 404:
        return 'No existe una cuenta con ese email';
      case 409:
        return 'Ya existe una cuenta con ese email';
      case 429:
        return 'Demasiados intentos. Espera unos minutos.';
      default:
        return error.message || 'Error de autenticación';
    }
  }
  if (error instanceof Error) {
    if (error.message === 'Failed to fetch') {
      return 'Sin conexión a internet';
    }
    return error.message;
  }
  return 'Error desconocido';
};

/**
 * Extrae código de error
 */
const getErrorCode = (error: unknown): number | undefined => {
  if (error instanceof AppwriteException) {
    return error.code;
  }
  return undefined;
};

// ============================================================================
// SERVICIO DE AUTENTICACIÓN
// ============================================================================

export const authService = {
  /**
   * Verifica si existe una sesión activa al cargar la aplicación.
   * NO lanza errores - retorna null si no hay sesión.
   *
   * @returns Usuario actual o null
   */
  async getCurrentUser(): Promise<AppUser | null> {
    try {
      const user = await account.get();
      return user as AppUser;
    } catch (error) {
      const code = getErrorCode(error);
      // 401 es esperado cuando no hay sesión - no es un error
      if (code === 401) {
        return null;
      }
      // Otros errores se loguean pero no se propagan
      console.warn('[AuthService] getCurrentUser error:', getErrorMessage(error));
      return null;
    }
  },

  /**
   * Inicia sesión con email y contraseña.
   *
   * Flujo:
   * 1. Verificar si hay sesión existente
   * 2. Si existe, cerrarla primero
   * 3. Crear nueva sesión
   * 4. Esperar estabilización
   * 5. Verificar usuario
   * 6. Emitir evento sessionReady
   *
   * @param email - Email del usuario
   * @param password - Contraseña
   * @returns Resultado con usuario o error
   */
  async login(email: string, password: string): Promise<AuthResult> {
    try {
      // 1. Verificar sesión existente
      const existingUser = await this.getCurrentUser();
      if (existingUser) {
        console.log('[AuthService] Sesión existente detectada, cerrándola...');
        try {
          await account.deleteSession('current');
        } catch {
          // Ignorar error al cerrar sesión anterior
        }
      }

      // 2. Crear nueva sesión
      console.log('[AuthService] Creando sesión...');
      await account.createEmailPasswordSession(email, password);

      // 3. Esperar estabilización de sesión
      // Importante: da tiempo a que localStorage se sincronice
      await wait(SESSION_STABILIZATION_DELAY);

      // 4. Verificar usuario
      const user = await account.get();
      console.log('[AuthService] Login exitoso:', user.email);

      // 5. Emitir evento sessionReady
      if (onSessionReady) {
        onSessionReady();
      }

      return {
        success: true,
        user: user as AppUser,
      };
    } catch (error) {
      const message = getErrorMessage(error);
      const code = getErrorCode(error);

      console.error('[AuthService] Login error:', message);

      if (onAuthError) {
        onAuthError(message, code);
      }

      return {
        success: false,
        user: null,
        error: message,
        errorCode: code,
      };
    }
  },

  /**
   * Registra un nuevo usuario.
   *
   * Flujo:
   * 1. Crear cuenta
   * 2. Auto-login después de registro
   * 3. Emitir evento sessionReady
   *
   * @param email - Email del usuario
   * @param password - Contraseña (mínimo 8 caracteres)
   * @param name - Nombre completo
   * @returns Resultado con usuario o error
   */
  async register(email: string, password: string, name: string): Promise<AuthResult> {
    try {
      // 1. Crear cuenta
      console.log('[AuthService] Registrando usuario...');
      await account.create(ID.unique(), email, password, name);

      // 2. Auto-login después de registro
      console.log('[AuthService] Auto-login post-registro...');
      const loginResult = await this.login(email, password);

      if (!loginResult.success) {
        return loginResult;
      }

      console.log('[AuthService] Registro exitoso:', email);

      return {
        success: true,
        user: loginResult.user,
      };
    } catch (error) {
      const message = getErrorMessage(error);
      const code = getErrorCode(error);

      console.error('[AuthService] Register error:', message);

      if (onAuthError) {
        onAuthError(message, code);
      }

      return {
        success: false,
        user: null,
        error: message,
        errorCode: code,
      };
    }
  },

  /**
   * Cierra la sesión actual.
   *
   * @returns true si se cerró correctamente
   */
  async logout(): Promise<boolean> {
    try {
      console.log('[AuthService] Cerrando sesión...');
      await account.deleteSession('current');
      console.log('[AuthService] Sesión cerrada');
      return true;
    } catch (error) {
      console.error('[AuthService] Logout error:', getErrorMessage(error));
      // Considerar logout exitoso aunque falle (sesión ya inválida)
      return true;
    }
  },

  /**
   * Cierra todas las sesiones del usuario (todos los dispositivos).
   *
   * @returns true si se cerraron correctamente
   */
  async logoutAll(): Promise<boolean> {
    try {
      console.log('[AuthService] Cerrando todas las sesiones...');
      await account.deleteSessions();
      console.log('[AuthService] Todas las sesiones cerradas');
      return true;
    } catch (error) {
      console.error('[AuthService] LogoutAll error:', getErrorMessage(error));
      return false;
    }
  },

  /**
   * Actualiza el nombre del usuario.
   *
   * @param name - Nuevo nombre
   * @returns Usuario actualizado o null
   */
  async updateName(name: string): Promise<AppUser | null> {
    try {
      const user = await account.updateName(name);
      return user as AppUser;
    } catch (error) {
      console.error('[AuthService] UpdateName error:', getErrorMessage(error));
      return null;
    }
  },

  /**
   * Envía email de recuperación de contraseña.
   *
   * @param email - Email del usuario
   * @param resetUrl - URL de la página de reset
   * @returns true si se envió correctamente
   */
  async recoverPassword(email: string, resetUrl: string): Promise<boolean> {
    try {
      await account.createRecovery(email, resetUrl);
      return true;
    } catch (error) {
      console.error('[AuthService] RecoverPassword error:', getErrorMessage(error));
      return false;
    }
  },

  /**
   * Obtiene lista de sesiones activas del usuario.
   *
   * @returns Lista de sesiones o array vacío
   */
  async getSessions(): Promise<SessionInfo[]> {
    try {
      const sessions = await account.listSessions();
      return sessions.sessions.map(s => ({
        sessionId: s.$id,
        userId: s.userId,
        provider: s.provider,
        expire: s.expire,
        current: s.current,
      }));
    } catch (error) {
      console.error('[AuthService] GetSessions error:', getErrorMessage(error));
      return [];
    }
  },

  /**
   * Verifica si la sesión actual es válida.
   * Útil para health checks periódicos.
   *
   * @returns true si la sesión es válida
   */
  async verifySession(): Promise<boolean> {
    try {
      await account.get();
      return true;
    } catch (error) {
      const code = getErrorCode(error);
      if (SESSION_INVALID_CODES.includes(code || 0)) {
        if (onSessionExpired) {
          onSessionExpired();
        }
        return false;
      }
      // Error de red u otro - no significa sesión inválida
      return true;
    }
  },

  /**
   * Maneja un error 401 detectado en otra parte de la aplicación.
   * Útil para que el servicio de base de datos notifique sesiones expiradas.
   */
  handleUnauthorizedError(): void {
    console.warn('[AuthService] Error 401 detectado - sesión posiblemente expirada');
    if (onSessionExpired) {
      onSessionExpired();
    }
  },

  /**
   * Verifica si un error indica sesión inválida
   */
  isSessionError(error: unknown): boolean {
    const code = getErrorCode(error);
    return SESSION_INVALID_CODES.includes(code || 0);
  },

  /**
   * Verifica si un error es recuperable (retry posible)
   */
  isRetryableError(error: unknown): boolean {
    const code = getErrorCode(error);
    return !NON_RETRYABLE_CODES.includes(code || 0);
  },
};

export default authService;
