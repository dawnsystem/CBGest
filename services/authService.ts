/**
 * @fileoverview Servicio de Autenticación
 * @description Gestiona todas las operaciones de autenticación con Appwrite.
 *              Separado del servicio de base de datos para mejor organización.
 *
 * @example
 * import { authService } from '@/services/authService';
 * const user = await authService.login(email, password);
 */

import { AppwriteException } from 'appwrite';
import { account } from '../lib/appwrite/client';
import type { AppUser } from '../types';
import { authLogger } from './logger';
import { isAllowedAuthRedirectUrl } from '../utils/authRedirect';

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
const SESSION_STABILIZATION_DELAY = 300;

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
      // 401 is expected when no session exists — not an error
      if (code === 401) {
        return null;
      }
      // Network/server errors should be distinguishable from "no user"
      authLogger.warn(`getCurrentUser: error inesperado (code=${code}): ${getErrorMessage(error)}`);
      throw error;
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
      let existingUser = null;
      try {
        existingUser = await this.getCurrentUser();
      } catch (e) {
        // Network error checking existing session — proceed with login anyway
        authLogger.warn('Error verificando sesión existente, continuando con login', e);
      }
      if (existingUser) {
        authLogger.info('Sesión existente detectada, cerrándola...');
        try {
          await account.deleteSession('current');
        } catch {
          // Ignorar error al cerrar sesión anterior
        }
      }

      // 2. Crear nueva sesión
      authLogger.info('Creando sesión...');
      await account.createEmailPasswordSession(email, password);

      // 3. Esperar estabilización de sesión
      // Importante: da tiempo a que localStorage se sincronice
      await wait(SESSION_STABILIZATION_DELAY);

      // 4. Verificar usuario
      const user = await account.get();
      authLogger.success('Login exitoso');

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

      authLogger.error(`Login error: ${message}`);

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
      authLogger.info('Cerrando sesión...');
      await account.deleteSession('current');
      authLogger.success('Sesión cerrada');
      return true;
    } catch (error) {
      authLogger.error(`Logout error: ${getErrorMessage(error)}`);
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
      authLogger.info('Cerrando todas las sesiones...');
      await account.deleteSessions();
      authLogger.success('Todas las sesiones cerradas');
      return true;
    } catch (error) {
      authLogger.error(`LogoutAll error: ${getErrorMessage(error)}`);
      return false;
    }
  },

  /**
   * Cambia la contraseña del usuario actual y limpia el flag `mustChangePassword`.
   *
   * Se usa tanto para el cambio voluntario de contraseña como para el cambio
   * obligatorio tras un primer login con contraseña temporal asignada por un
   * administrador (ver `ForcePasswordChange.tsx`).
   *
   * @param oldPassword - Contraseña actual (o la temporal asignada por el admin)
   * @param newPassword - Nueva contraseña definitiva (mínimo 8 caracteres)
   * @returns Usuario actualizado con `prefs.mustChangePassword = false`
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<AuthResult> {
    try {
      authLogger.info('Actualizando contraseña...');
      await account.updatePassword(newPassword, oldPassword);

      const current = await account.get();
      const updated = await account.updatePrefs({
        ...(current.prefs || {}),
        mustChangePassword: false,
      });

      authLogger.success('Contraseña actualizada correctamente');

      return { success: true, user: updated as AppUser };
    } catch (error) {
      const message = getErrorMessage(error);
      const code = getErrorCode(error);

      authLogger.error(`ChangePassword error: ${message}`);

      return { success: false, user: null, error: message, errorCode: code };
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
      authLogger.error(`UpdateName error: ${getErrorMessage(error)}`);
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
    if (!isAllowedAuthRedirectUrl(resetUrl)) {
      authLogger.error(`RecoverPassword blocked: redirect URL not allowlisted — ${resetUrl}`);
      return false;
    }
    try {
      await account.createRecovery(email, resetUrl);
      return true;
    } catch (error) {
      authLogger.error(`RecoverPassword error: ${getErrorMessage(error)}`);
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
      authLogger.error(`GetSessions error: ${getErrorMessage(error)}`);
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
   *
   * NOTE: This method now verifies if the session is actually invalid before
   * triggering expiration. A 401 from a collection (permissions issue) should NOT
   * trigger session expiration if the user's session is still valid.
   */
  async handleUnauthorizedError(): Promise<void> {
    // IMPORTANT: Verify if the session is actually invalid before triggering expiration
    // A 401 from a collection (permissions issue) should NOT trigger session expiration
    try {
      const user = await account.get();
      if (user) {
        // Session is valid! The 401 was due to collection permissions, not session expiration
        authLogger.warn('Error 401 detectado pero la sesión sigue válida - probablemente es un problema de permisos de colección');
        return;
      }
    } catch (sessionCheckError: unknown) {
      const sessionCheckCode = getErrorCode(sessionCheckError);
      if (sessionCheckCode === 401) {
        // Session is truly expired
        authLogger.warn('Sesión verificada como expirada');
      } else {
        // Network error or other transient issue — do NOT expire session
        authLogger.warn(`Error verificando sesión (no es 401, ignorando): ${getErrorMessage(sessionCheckError)}`);
        return;
      }
    }

    authLogger.warn('Error 401 confirmado - sesión expirada');
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

  // ==========================================================================
  // VERIFICACIÓN DE EMAIL (Opcional)
  // ==========================================================================

  /**
   * Envía email de verificación al usuario actual.
   *
   * @param verificationUrl - URL donde el usuario confirma (debe incluir userId y secret)
   * @returns true si se envió correctamente
   *
   * @example
   * // La URL recibirá parámetros: ?userId=xxx&secret=yyy
   * await authService.sendEmailVerification('https://miapp.com/verify-email');
   */
  async sendEmailVerification(verificationUrl: string): Promise<boolean> {
    if (!isAllowedAuthRedirectUrl(verificationUrl)) {
      authLogger.error(`SendEmailVerification blocked: redirect URL not allowlisted — ${verificationUrl}`);
      return false;
    }
    try {
      authLogger.info('Enviando email de verificación...');
      await account.createVerification(verificationUrl);
      authLogger.success('Email de verificación enviado');
      return true;
    } catch (error) {
      authLogger.error(`SendEmailVerification error: ${getErrorMessage(error)}`);
      return false;
    }
  },

  /**
   * Confirma la verificación de email con los parámetros recibidos.
   *
   * @param userId - ID del usuario (del parámetro URL)
   * @param secret - Secret de verificación (del parámetro URL)
   * @returns true si se verificó correctamente
   */
  async confirmEmailVerification(userId: string, secret: string): Promise<boolean> {
    try {
      authLogger.info('Confirmando verificación de email...');
      await account.updateVerification(userId, secret);
      authLogger.success('Email verificado correctamente');
      return true;
    } catch (error) {
      authLogger.error(`ConfirmEmailVerification error: ${getErrorMessage(error)}`);
      return false;
    }
  },

  /**
   * Verifica si el usuario actual tiene el email verificado.
   *
   * @returns true si el email está verificado, false si no
   */
  async isEmailVerified(): Promise<boolean> {
    try {
      const user = await account.get();
      return user.emailVerification;
    } catch (error) {
      authLogger.error(`IsEmailVerified error: ${getErrorMessage(error)}`);
      return false;
    }
  },

  /**
   * Creates a JWT token for the current session.
   * The JWT can be used to authenticate requests to Appwrite APIs.
   * 
   * @returns JWT token string or null if failed
   */
  async createJWT(): Promise<string | null> {
    try {
      const jwt = await account.createJWT();
      return jwt.jwt;
    } catch (error) {
      authLogger.error(`CreateJWT error: ${getErrorMessage(error)}`);
      return null;
    }
  },
};

export default authService;
