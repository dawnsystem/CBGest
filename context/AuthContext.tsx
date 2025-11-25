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
  ReactNode,
} from 'react';
import { authService, setAuthCallbacks, AuthState } from '../services/authService';
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
  /** Función para registrar nuevo usuario */
  register: (email: string, password: string, name: string) => Promise<void>;
  /** Función para cerrar sesión */
  logout: () => Promise<void>;
  /** Atajo: true si hay usuario autenticado */
  isAuthenticated: boolean;
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

/** Eventos que indican actividad del usuario */
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

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

  // Estado de carga derivado
  const loading = authState === 'INITIALIZING' || authState === 'AUTHENTICATING';

  // ============================================================================
  // CONFIGURAR CALLBACKS DEL AUTH SERVICE
  // ============================================================================

  useEffect(() => {
    setAuthCallbacks({
      onSessionReady: () => {
        console.log('[AuthContext] Session ready event received');
        setSessionReady(true);
      },
      onSessionExpired: () => {
        console.log('[AuthContext] Session expired event received');
        setUser(null);
        setAuthState('SESSION_EXPIRED');
        setSessionReady(false);
        setLastError('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.');
      },
      onAuthError: (error: string, code?: number) => {
        console.error('[AuthContext] Auth error:', error, code);
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
    const checkExistingSession = async () => {
      console.log('[AuthContext] Checking existing session...');

      try {
        const currentUser = await authService.getCurrentUser();

        if (currentUser) {
          console.log('[AuthContext] Existing session found:', currentUser.email);
          setUser(currentUser);
          setAuthState('AUTHENTICATED');
          setSessionReady(true);
        } else {
          console.log('[AuthContext] No existing session');
          setAuthState('UNAUTHENTICATED');
        }
      } catch (error) {
        console.error('[AuthContext] Error checking session:', error);
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
        console.log('[AuthContext] Session timeout due to inactivity (15 min)');
        try {
          await authService.logout();
          setUser(null);
          setAuthState('SESSION_EXPIRED');
          setSessionReady(false);
          setLastError('Sesión cerrada por inactividad');
        } catch (error) {
          console.error('[AuthContext] Auto-logout error:', error);
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
  // FUNCIONES DE AUTENTICACIÓN
  // ============================================================================

  /**
   * Iniciar sesión
   */
  const login = useCallback(async (email: string, password: string): Promise<void> => {
    setAuthState('AUTHENTICATING');
    setLastError(null);
    setSessionReady(false);

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
   * Registrar nuevo usuario
   */
  const register = useCallback(async (
    email: string,
    password: string,
    name: string
  ): Promise<void> => {
    setAuthState('AUTHENTICATING');
    setLastError(null);
    setSessionReady(false);

    const result = await authService.register(email, password, name);

    if (result.success && result.user) {
      setUser(result.user);
      setAuthState('AUTHENTICATED');
      // sessionReady se establece por el callback onSessionReady
    } else {
      setUser(null);
      setAuthState('UNAUTHENTICATED');
      setLastError(result.error || 'Error de registro');
      throw new Error(result.error || 'Error de registro');
    }
  }, []);

  /**
   * Cerrar sesión
   */
  const logout = useCallback(async (): Promise<void> => {
    setAuthState('AUTHENTICATING');

    await authService.logout();

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

  const value = useMemo(
    () => ({
      user,
      loading,
      authState,
      sessionReady,
      login,
      register,
      logout,
      isAuthenticated: !!user,
      lastError,
      clearError,
    }),
    [user, loading, authState, sessionReady, login, register, logout, lastError, clearError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
