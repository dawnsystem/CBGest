/**
 * @fileoverview Contexto de Autenticación
 * @description Provee estado de autenticación a toda la aplicación.
 *              Usa el nuevo authService para operaciones con Appwrite.
 *
 * @example
 * // En un componente:
 * const { user, login, logout, isAuthenticated, sessionReady } = useAuth();
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { authService, setAuthCallbacks, AuthState } from '../services/authService';
import { cache } from '../lib/appwrite/cache';
import { authLogger } from '../services/logger';
import type { AppUser } from '../types';

// ============================================================================
// TIPOS
// ============================================================================

interface AuthContextType {
  /** Usuario autenticado actual o null */
  user: AppUser | null;
  /** Estado de carga (verificando sesión o autenticando) */
  loading: boolean;
  /** Estado actual de autenticación */
  authState: AuthState;
  /** Indica si la sesión está lista para operaciones de DB */
  sessionReady: boolean;
  /** Función para iniciar sesión */
  login: (email: string, password: string) => Promise<void>;
  /** Función para cerrar sesión */
  logout: () => Promise<void>;
  /** Atajo: true si hay usuario autenticado */
  isAuthenticated: boolean;
  /**
   * true si el usuario debe cambiar su contraseña antes de poder usar la app
   * (ej. contraseña temporal asignada por un administrador en su creación).
   */
  mustChangePassword: boolean;
  /** Cambia la contraseña del usuario actual y limpia `mustChangePassword`. */
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  /** Último error de autenticación */
  lastError: string | null;
  /** Limpiar el último error */
  clearError: () => void;
}

// ============================================================================
// CONTEXTO
// ============================================================================

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================================================
// HOOK PRINCIPAL
// ============================================================================

/**
 * Hook para acceder al contexto de autenticación.
 * Debe usarse dentro de un AuthProvider.
 *
 * @throws Error si se usa fuera de AuthProvider
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// ============================================================================
// HOOKS AUXILIARES
// ============================================================================

/**
 * Hook simplificado que solo retorna el usuario.
 * Útil para componentes que solo necesitan datos del usuario.
 */
export const useUser = (): AppUser | null => {
  const { user } = useAuth();
  return user;
};

/**
 * Hook que indica si la sesión está lista para operaciones.
 * Usar antes de hacer llamadas a la base de datos.
 */
export const useSessionReady = (): boolean => {
  const { sessionReady } = useAuth();
  return sessionReady;
};

/**
 * Hook que solo retorna el estado de autenticación.
 * Útil para componentes que solo necesitan saber el estado.
 */
export const useAuthState = (): AuthState => {
  const { authState } = useAuth();
  return authState;
};

// ============================================================================
// CONSTANTES
// ============================================================================

/** Timeout de inactividad: 15 minutos */
const INACTIVITY_TIMEOUT = 15 * 60 * 1000;

/** Intervalo de verificación de sesión: 5 minutos */
const SESSION_REFRESH_INTERVAL = 5 * 60 * 1000;

/** Eventos que indican actividad del usuario */
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

/** Keys de localStorage que NO se deben borrar en logout (configuración de UI) */
const PROTECTED_STORAGE_KEYS = ['gestcb_settings'];

/**
 * Comprueba si una clave de localStorage debe conservarse tras logout.
 * Incluye preferencias de ejercicio fiscal por usuario (último usado).
 */
function isProtectedStorageKey(key: string): boolean {
  if (PROTECTED_STORAGE_KEYS.includes(key)) return true;
  if (key.startsWith('gestcb_active_fy_')) return true;
  return false;
}

// ============================================================================
// PROVIDER
// ============================================================================

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // Estado principal
  const [user, setUser] = useState<AppUser | null>(null);
  const [authState, setAuthState] = useState<AuthState>('INITIALIZING');
  const [sessionReady, setSessionReady] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Ref to prevent double session check in React Strict Mode
  const sessionCheckStartedRef = useRef(false);

  // Estado de carga derivado
  const loading = authState === 'INITIALIZING' || authState === 'AUTHENTICATING';

  // ============================================================================
  // CONFIGURAR CALLBACKS DEL AUTH SERVICE
  // ============================================================================

  useEffect(() => {
    setAuthCallbacks({
      onSessionReady: () => {
        authLogger.debug('Session ready event received');
        setSessionReady(true);
      },
      onSessionExpired: () => {
        authLogger.debug('Session expired event received');
        setUser(null);
        setAuthState('SESSION_EXPIRED');
        setSessionReady(false);
        setLastError('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.');
      },
      onAuthError: (error: string, code?: number) => {
        authLogger.error(`Auth error: ${error} (code=${code})`);
        setLastError(error);
      },
    });

    // Cleanup
    return () => {
      setAuthCallbacks({});
    };
  }, []);

  // ============================================================================
  // VERIFICAR SESIÓN EXISTENTE AL MONTAR
  // ============================================================================

  useEffect(() => {
    // Prevent double session check in React Strict Mode
    if (sessionCheckStartedRef.current) {
      return;
    }
    sessionCheckStartedRef.current = true;

    const checkExistingSession = async () => {
      authLogger.debug('Checking existing session...');

      try {
        const currentUser = await authService.getCurrentUser();

        if (currentUser) {
          authLogger.debug('Existing session found');
          setUser(currentUser);
          setAuthState('AUTHENTICATED');
          setSessionReady(true);
        } else {
          authLogger.debug('No existing session');
          setAuthState('UNAUTHENTICATED');
        }
      } catch (error) {
        // Network/server error — no session could be verified, treat as unauthenticated
        authLogger.warn(`Error checking session (network/server): ${error}`);
        setAuthState('UNAUTHENTICATED');
      }
    };

    checkExistingSession();
  }, []);

  // ============================================================================
  // AUTO-LOGOUT POR INACTIVIDAD
  // ============================================================================

  useEffect(() => {
    if (!user) return;

    let inactivityTimer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(async () => {
        authLogger.debug('Session timeout due to inactivity (15 min)');
        try {
          await authService.logout();
          setUser(null);
          setAuthState('SESSION_EXPIRED');
          setSessionReady(false);
          setLastError('Sesión cerrada por inactividad');
        } catch (error) {
          authLogger.error(`Auto-logout error: ${error}`);
        }
      }, INACTIVITY_TIMEOUT);
    };

    // Registrar eventos de actividad
    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    // Iniciar timer
    resetTimer();

    // Cleanup
    return () => {
      clearTimeout(inactivityTimer);
      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user]);

  // ============================================================================
  // SESSION REFRESH PROACTIVO (cada 5 min)
  // ============================================================================

  useEffect(() => {
    // BUG-017 fix: start the refresh interval as soon as the user object is
    // available, without requiring sessionReady.  sessionReady can be delayed
    // (e.g. when the app initialises from a stored token) and waiting for it
    // leaves a window where an expired session goes undetected.
    if (!user) return;

    const refreshInterval = setInterval(async () => {
      authLogger.debug('Verificación proactiva de sesión...');
      try {
        const isValid = await authService.verifySession();
        if (!isValid) {
          authLogger.debug('Sesión inválida detectada en verificación proactiva');
          setUser(null);
          setAuthState('SESSION_EXPIRED');
          setSessionReady(false);
          setLastError('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.');
        } else {
          authLogger.debug('Sesión válida confirmada');
        }
      } catch (error) {
        authLogger.error(`Error en verificación de sesión: ${error}`);
        // No cerrar sesión por error de red - podría ser temporal
      }
    }, SESSION_REFRESH_INTERVAL);

    return () => {
      clearInterval(refreshInterval);
    };
  }, [user]);

  // ============================================================================
  // FUNCIONES DE AUTENTICACIÓN
  // ============================================================================

  /**
   * Iniciar sesión
   */
  const login = useCallback(async (email: string, password: string): Promise<void> => {
    setAuthState('AUTHENTICATING');
    setLastError(null);
    setSessionReady(false);

    // Limpiar caché de usuario anterior antes de login
    authLogger.debug('Limpiando caché antes de login...');
    cache.clear();

    const result = await authService.login(email, password);

    if (result.success && result.user) {
      setUser(result.user);
      setAuthState('AUTHENTICATED');
      // sessionReady se establece por el callback onSessionReady
    } else {
      setUser(null);
      setAuthState('UNAUTHENTICATED');
      setLastError(result.error || 'Error de autenticación');
      throw new Error(result.error || 'Error de autenticación');
    }
  }, []);

  /**
   * Cambiar contraseña del usuario actual (voluntario o forzado en primer login).
   * Actualiza el usuario en memoria para reflejar `mustChangePassword: false`.
   */
  const changePassword = useCallback(async (
    oldPassword: string,
    newPassword: string
  ): Promise<void> => {
    setLastError(null);

    const result = await authService.changePassword(oldPassword, newPassword);

    if (result.success && result.user) {
      setUser(result.user);
    } else {
      setLastError(result.error || 'Error al cambiar la contraseña');
      throw new Error(result.error || 'Error al cambiar la contraseña');
    }
  }, []);

  /**
   * Cerrar sesión
   */
  const logout = useCallback(async (): Promise<void> => {
    setAuthState('AUTHENTICATING');

    await authService.logout();

    // Limpiar caché de datos
    authLogger.debug('Limpiando caché en logout...');
    cache.clear();

    // Limpiar localStorage selectivamente (mantener settings de UI)
    authLogger.debug('Limpiando localStorage selectivamente...');
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !isProtectedStorageKey(key)) {
        // Eliminar keys de la app y dependencias (Appwrite, Statsig analytics)
        if (
          key.startsWith('gestcb_') ||
          key.startsWith('appwrite') ||
          key.startsWith('cookieFallback') ||
          key.startsWith('statsig.')
        ) {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach(key => {
      authLogger.debug(`Eliminando localStorage key: ${key}`);
      localStorage.removeItem(key);
    });

    setUser(null);
    setAuthState('UNAUTHENTICATED');
    setSessionReady(false);
    setLastError(null);
  }, []);

  /**
   * Limpiar último error
   */
  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  // ============================================================================
  // VALOR DEL CONTEXTO
  // ============================================================================

  const mustChangePassword = !!(user?.prefs && (user.prefs as { mustChangePassword?: boolean }).mustChangePassword);

  const value = useMemo(
    () => ({
      user,
      loading,
      authState,
      sessionReady,
      login,
      logout,
      isAuthenticated: !!user,
      mustChangePassword,
      changePassword,
      lastError,
      clearError,
    }),
    [user, loading, authState, sessionReady, login, logout, mustChangePassword, changePassword, lastError, clearError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
